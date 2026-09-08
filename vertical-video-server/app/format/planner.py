"""The planner: target length in, a renderable structure out.

The operator asks for 90 minutes. The planner produces chapters, beats and —
critically — SEGMENTS that never exceed the HeyGen duration cap, so nothing
downstream has to think about the limit.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any

from .tiers import (
    FRAMINGS,
    TierSpec,
    get_tier,
    short_windows,
    tier_for_duration,
)
from .validation import ValidationReport, count_words, validate_plan

_SENTENCE_RE = re.compile(r"[^.!?\n]+[.!?]*", re.MULTILINE)


class PlanError(ValueError):
    """The request cannot be planned as asked."""


@dataclass
class PlannedBeat:
    index: int  # index within the chapter
    global_index: int
    role: str
    start_seconds: float
    duration_seconds: float
    narration: str = ""
    visual: str = ""
    loopable: bool = False
    key_moment: bool = False
    expensive: bool = False
    plate_ref: str | None = None
    framing: str | None = None
    segment_index: int | None = None

    @property
    def words(self) -> int:
        return count_words(self.narration)


@dataclass
class PlannedChapter:
    index: int
    title: str
    start_seconds: float
    duration_seconds: float
    beats: list[PlannedBeat] = field(default_factory=list)
    segment_indexes: list[int] = field(default_factory=list)
    plate_pool: list[str] = field(default_factory=list)


@dataclass
class PlannedSegment:
    index: int
    chapter_index: int
    index_in_chapter: int
    start_seconds: float
    duration_seconds: float
    beat_global_indexes: list[int] = field(default_factory=list)
    narration: str = ""


@dataclass
class Seam:
    after_segment: int
    at_seconds: float
    crossfade_ms: int
    within_chapter: bool


@dataclass
class Plan:
    tier: str
    target_seconds: float
    planned_seconds: float
    max_segment_seconds: float
    crossfade_ms: int
    words_per_second: float
    chapters: list[PlannedChapter]
    segments: list[PlannedSegment]
    seams: list[Seam]
    validation: ValidationReport

    def as_dict(self) -> dict[str, Any]:
        return {
            "tier": self.tier,
            "target_seconds": round(self.target_seconds, 2),
            "planned_seconds": round(self.planned_seconds, 2),
            "max_segment_seconds": self.max_segment_seconds,
            "crossfade_ms": self.crossfade_ms,
            "words_per_second": self.words_per_second,
            "counts": {
                "chapters": len(self.chapters),
                "beats": sum(len(c.beats) for c in self.chapters),
                "segments": len(self.segments),
                "seams": len(self.seams),
            },
            "chapters": [
                {
                    **{k: v for k, v in asdict(c).items() if k != "beats"},
                    "beats": [asdict(b) for b in c.beats],
                }
                for c in self.chapters
            ],
            "segments": [asdict(s) for s in self.segments],
            "seams": [asdict(s) for s in self.seams],
            "validation": self.validation.as_dict(),
        }


# --------------------------------------------------------------------- input
def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_RE.findall(text or "") if s.strip()]


def _distribute(sentences: list[str], budgets: list[int]) -> list[str]:
    """Fill each slot up to its word budget, in order, without losing text.

    The last slot absorbs whatever is left; validation is what complains about
    it, not the planner.
    """
    slots: list[list[str]] = [[] for _ in budgets]
    used = [0] * len(budgets)
    slot = 0
    for sentence in sentences:
        w = count_words(sentence)
        while slot < len(budgets) - 1 and used[slot] and used[slot] + w > budgets[slot]:
            slot += 1
        slots[slot].append(sentence)
        used[slot] += w
    return [" ".join(parts) for parts in slots]


# ------------------------------------------------------------------- helpers
def _beat_seconds(words: int, tier: TierSpec) -> float:
    if words <= 0:
        return tier.beat_target_seconds
    seconds = words / tier.words_per_second
    return max(tier.beat_min_seconds, min(tier.beat_max_seconds, seconds))


def _pack_segments(
    chapters: list[PlannedChapter], max_segment_seconds: float
) -> list[PlannedSegment]:
    """Pack beats into segments no longer than the cap, never splitting a beat.

    Segments never straddle a chapter: chapters have to stay independently
    renderable and resumable.
    """
    segments: list[PlannedSegment] = []
    for chapter in chapters:
        current: PlannedSegment | None = None
        for beat in chapter.beats:
            if beat.duration_seconds > max_segment_seconds:
                raise PlanError(
                    f"beat {beat.global_index} is {beat.duration_seconds:.1f}s, longer than the "
                    f"{max_segment_seconds:g}s segment cap. Shorten the beat or raise "
                    "HEYGEN_MAX_SEGMENT_SECONDS."
                )
            if current is None or current.duration_seconds + beat.duration_seconds > max_segment_seconds:
                current = PlannedSegment(
                    index=len(segments),
                    chapter_index=chapter.index,
                    index_in_chapter=len(chapter.segment_indexes),
                    start_seconds=beat.start_seconds,
                    duration_seconds=0.0,
                )
                segments.append(current)
                chapter.segment_indexes.append(current.index)
            current.duration_seconds = round(current.duration_seconds + beat.duration_seconds, 3)
            current.beat_global_indexes.append(beat.global_index)
            if beat.narration:
                current.narration = f"{current.narration} {beat.narration}".strip()
            beat.segment_index = current.index
    return segments


def _seams(segments: list[PlannedSegment], crossfade_ms: int) -> list[Seam]:
    seams: list[Seam] = []
    clock = 0.0
    for i, seg in enumerate(segments[:-1]):
        clock += seg.duration_seconds
        seams.append(
            Seam(
                after_segment=i,
                at_seconds=round(clock, 3),
                crossfade_ms=crossfade_ms,
                within_chapter=segments[i + 1].chapter_index == seg.chapter_index,
            )
        )
    return seams


def _apply_reuse(chapter: PlannedChapter, tier: TierSpec, pool_size: int, expensive_cap: int) -> None:
    """Long tier: a pool of plates per chapter, recomposed with varied framing.

    Expensive treatment is reserved for the chapter opener and marked key
    moments, capped at `expensive_cap` per chapter.
    """
    pool_size = max(1, pool_size)
    chapter.plate_pool = [f"ch{chapter.index:03d}_plate{i}" for i in range(pool_size)]
    expensive_used = 0
    for i, beat in enumerate(chapter.beats):
        beat.plate_ref = chapter.plate_pool[i % pool_size]
        beat.framing = FRAMINGS[i % len(FRAMINGS)]
        wants_expensive = i == 0 or beat.key_moment
        if wants_expensive and expensive_used < expensive_cap:
            beat.expensive = True
            expensive_used += 1
            if i == 0:
                beat.role = "opener"
        else:
            beat.expensive = False


# --------------------------------------------------------------------- short
def _plan_short(tier: TierSpec, target_seconds: float, spec: dict[str, Any]) -> list[PlannedChapter]:
    windows = short_windows(target_seconds)
    supplied = spec.get("beats") or []
    if supplied and len(supplied) != len(windows):
        raise PlanError(
            f"short tier takes exactly {len(windows)} beats (hook, setup, turn, payoff); "
            f"got {len(supplied)}"
        )
    if not supplied:
        budgets = [tier.word_budget(hi - lo) for _, lo, hi in windows]
        texts = _distribute(_sentences(spec.get("script", "")), budgets)
        supplied = [{"narration": t} for t in texts]

    beats: list[PlannedBeat] = []
    for i, ((role, lo, hi), raw) in enumerate(zip(windows, supplied)):
        beats.append(
            PlannedBeat(
                index=i,
                global_index=i,
                role=role,
                start_seconds=round(lo, 3),
                duration_seconds=round(hi - lo, 3),
                narration=(raw.get("narration") or "").strip(),
                visual=(raw.get("visual") or "").strip(),
                key_moment=bool(raw.get("key_moment")),
            )
        )
    chapter = PlannedChapter(
        index=0,
        title=spec.get("title") or "short",
        start_seconds=0.0,
        duration_seconds=round(target_seconds, 3),
        beats=beats,
    )
    return [chapter]


# --------------------------------------------------------------- mid / long
def _chapters_from_spec(
    tier: TierSpec, target_seconds: float, spec: dict[str, Any]
) -> list[dict[str, Any]]:
    """Normalise operator input into [{title, beats:[{narration,...}]}]."""
    if spec.get("chapters"):
        return spec["chapters"]

    script = spec.get("script", "")
    sentences = _sentences(script)
    chapter_count = max(1, int(round(target_seconds / tier.chapter_target_seconds)))
    # Spread the requested length evenly over the chapters instead of stacking
    # nominal-length chapters and overshooting the target.
    chapter_seconds = target_seconds / chapter_count
    beats_per_chapter = max(1, int(round(chapter_seconds / tier.beat_target_seconds)))
    total_beats = chapter_count * beats_per_chapter

    if sentences:
        budgets = [tier.word_budget(tier.beat_target_seconds)] * total_beats
        texts = _distribute(sentences, budgets)
    else:
        texts = [""] * total_beats

    # Beats with no narration divide the chapter evenly, so an auto-planned
    # project lands on the requested length rather than drifting past it.
    even_split = max(
        tier.beat_min_seconds, min(tier.beat_max_seconds, chapter_seconds / beats_per_chapter)
    )

    chapters: list[dict[str, Any]] = []
    for c in range(chapter_count):
        chunk = texts[c * beats_per_chapter : (c + 1) * beats_per_chapter]
        chapters.append(
            {
                "title": f"Chapter {c + 1}",
                "beats": [
                    {"narration": t, **({} if t else {"duration_seconds": even_split})} for t in chunk
                ],
            }
        )
    return chapters


def _plan_chaptered(
    tier: TierSpec,
    target_seconds: float,
    spec: dict[str, Any],
    plate_pool_size: int,
    expensive_cap: int,
    loopable_min_seconds: float,
) -> list[PlannedChapter]:
    raw_chapters = _chapters_from_spec(tier, target_seconds, spec)
    chapters: list[PlannedChapter] = []
    clock = 0.0
    global_index = 0

    for c_index, raw in enumerate(raw_chapters):
        raw_beats = raw.get("beats") or [{"narration": raw.get("script", "")}]
        chapter = PlannedChapter(
            index=c_index,
            title=(raw.get("title") or f"Chapter {c_index + 1}").strip(),
            start_seconds=round(clock, 3),
            duration_seconds=0.0,
        )
        for b_index, rb in enumerate(raw_beats):
            narration = (rb.get("narration") or "").strip()
            duration = float(rb.get("duration_seconds") or 0.0) or _beat_seconds(
                count_words(narration), tier
            )
            duration = max(tier.beat_min_seconds, min(tier.beat_max_seconds, duration))
            beat = PlannedBeat(
                index=b_index,
                global_index=global_index,
                role="hook" if (c_index == 0 and b_index == 0) else "body",
                start_seconds=round(clock, 3),
                duration_seconds=round(duration, 3),
                narration=narration,
                visual=(rb.get("visual") or "").strip(),
                key_moment=bool(rb.get("key_moment")),
                # Mark long beats as loopable: render once, loop under the
                # narration instead of paying for motion we do not see.
                loopable=bool(rb.get("loopable"))
                or (tier.reuse_plates and duration >= loopable_min_seconds and not rb.get("key_moment")),
            )
            chapter.beats.append(beat)
            clock += duration
            global_index += 1

        chapter.duration_seconds = round(clock - chapter.start_seconds, 3)
        if tier.reuse_plates:
            _apply_reuse(chapter, tier, plate_pool_size, expensive_cap)
        chapters.append(chapter)

    return chapters


# ---------------------------------------------------------------------- main
def plan_project(
    *,
    target_seconds: float,
    spec: dict[str, Any] | None = None,
    tier: str | None = None,
    max_segment_seconds: float = 300.0,
    crossfade_ms: int = 300,
    plate_pool_size: int = 4,
    expensive_cap: int = 2,
    loopable_min_seconds: float = 20.0,
) -> Plan:
    spec = dict(spec or {})
    tier_name = tier or spec.get("tier") or tier_for_duration(target_seconds)
    tier_spec = get_tier(tier_name)

    if target_seconds <= 0:
        raise PlanError("target_seconds must be positive")
    if max_segment_seconds <= 0:
        raise PlanError("HEYGEN_MAX_SEGMENT_SECONDS must be positive")
    if tier_name == "short" and target_seconds > tier_spec.max_seconds:
        raise PlanError(
            f"{target_seconds:g}s is past the short tier ceiling of {tier_spec.max_seconds:g}s"
        )
    if target_seconds > get_tier("long").max_seconds:
        raise PlanError("3 hours is the ceiling")

    if tier_spec.chaptered:
        chapters = _plan_chaptered(
            tier_spec,
            target_seconds,
            spec,
            plate_pool_size=plate_pool_size,
            expensive_cap=expensive_cap,
            loopable_min_seconds=loopable_min_seconds,
        )
    else:
        chapters = _plan_short(tier_spec, target_seconds, spec)

    segments = _pack_segments(chapters, max_segment_seconds)
    seams = _seams(segments, crossfade_ms)
    planned_seconds = sum(c.duration_seconds for c in chapters)
    validation = validate_plan(tier_spec, target_seconds, chapters)

    return Plan(
        tier=tier_name,
        target_seconds=target_seconds,
        planned_seconds=round(planned_seconds, 3),
        max_segment_seconds=max_segment_seconds,
        crossfade_ms=crossfade_ms,
        words_per_second=tier_spec.words_per_second,
        chapters=chapters,
        segments=segments,
        seams=seams,
        validation=validation,
    )


def expected_segment_count(
    target_seconds: float, max_segment_seconds: float, tier: str | None = None
) -> int:
    """What the operator sees before anything is planned.

    Segments never straddle chapters, so on the chaptered tiers the count is
    chapters times the segments each chapter needs — not the whole runtime
    divided by the cap.
    """
    tier_spec = get_tier(tier or tier_for_duration(target_seconds))
    if not tier_spec.chaptered:
        return max(1, math.ceil(target_seconds / max_segment_seconds))
    chapters = max(1, int(round(target_seconds / tier_spec.chapter_target_seconds)))
    per_chapter = max(1, math.ceil((target_seconds / chapters) / max_segment_seconds))
    return chapters * per_chapter
