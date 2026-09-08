"""Script rules, enforced in code.

The point of this module is to refuse work rather than to quietly degrade it.
We never speed up audio to fit a long script: an over-budget script is an error
the operator has to rewrite.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from .tiers import (
    HOOK_MAX_WORDS,
    HOOK_PATTERN_BREAK_SECONDS,
    OPENING_HOOK_WINDOW_SECONDS,
    TierSpec,
    short_word_cap,
)

_WORD_RE = re.compile(r"[A-Za-z0-9']+(?:-[A-Za-z0-9']+)*")

# A beat may run this far over its word budget before it stops being a warning
# and becomes a rewrite: past this, only a speed-up would make it fit.
BEAT_OVERRUN_TOLERANCE = 0.15


def count_words(text: str | None) -> int:
    if not text:
        return 0
    return len(_WORD_RE.findall(text))


@dataclass
class Issue:
    level: str  # "error" | "warning"
    code: str
    message: str
    beat_index: int | None = None
    chapter_index: int | None = None
    numbers: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "level": self.level,
            "code": self.code,
            "message": self.message,
            "beat_index": self.beat_index,
            "chapter_index": self.chapter_index,
            "numbers": self.numbers,
        }


@dataclass
class BeatBudget:
    index: int
    chapter_index: int
    role: str
    seconds: float
    word_budget: int
    words: int

    @property
    def over_by(self) -> int:
        return max(0, self.words - self.word_budget)

    def as_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "chapter_index": self.chapter_index,
            "role": self.role,
            "seconds": round(self.seconds, 2),
            "word_budget": self.word_budget,
            "words": self.words,
            "over_by": self.over_by,
        }


@dataclass
class ValidationReport:
    ok: bool
    issues: list[Issue] = field(default_factory=list)
    budgets: list[BeatBudget] = field(default_factory=list)
    total_words: int = 0
    word_cap: int | None = None

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "warning"]

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "issues": [i.as_dict() for i in self.issues],
            "errors": [i.as_dict() for i in self.errors],
            "warnings": [i.as_dict() for i in self.warnings],
            "budgets": [b.as_dict() for b in self.budgets],
            "total_words": self.total_words,
            "word_cap": self.word_cap,
        }


def _iter_beats(chapters: Iterable[Any]) -> Iterable[tuple[int, int, Any]]:
    global_index = 0
    for c_index, chapter in enumerate(chapters):
        beats = chapter["beats"] if isinstance(chapter, dict) else chapter.beats
        for beat in beats:
            yield global_index, c_index, beat
            global_index += 1


def _get(beat: Any, key: str, default: Any = None) -> Any:
    if isinstance(beat, dict):
        return beat.get(key, default)
    return getattr(beat, key, default)


def validate_plan(tier: TierSpec, target_seconds: float, chapters: list[Any]) -> ValidationReport:
    """Validate a planned structure (chapters -> beats) against the tier rules."""
    issues: list[Issue] = []
    budgets: list[BeatBudget] = []
    total_words = 0

    for g_index, c_index, beat in _iter_beats(chapters):
        seconds = float(_get(beat, "duration_seconds", 0.0) or 0.0)
        narration = _get(beat, "narration", "") or ""
        role = _get(beat, "role", "body") or "body"
        words = count_words(narration)
        total_words += words
        budget = tier.word_budget(seconds)
        budgets.append(
            BeatBudget(
                index=g_index,
                chapter_index=c_index,
                role=role,
                seconds=seconds,
                word_budget=budget,
                words=words,
            )
        )

        if words > budget:
            over = words - budget
            ratio = (words / budget) if budget else float("inf")
            level = "warning" if ratio <= 1 + BEAT_OVERRUN_TOLERANCE else "error"
            issues.append(
                Issue(
                    level=level,
                    code="beat_over_budget",
                    message=(
                        f"beat {g_index} ({role}) runs {over} word(s) over its budget: "
                        f"{words} words in {seconds:.1f}s, budget {budget} at "
                        f"{tier.words_per_second} words/sec"
                        + ("" if level == "warning" else " — rewrite it, audio is never sped up to fit")
                    ),
                    beat_index=g_index,
                    chapter_index=c_index,
                    numbers={
                        "words": words,
                        "budget": budget,
                        "over_by": over,
                        "seconds": round(seconds, 2),
                        "words_per_second": tier.words_per_second,
                        "required_words_per_second": round(words / seconds, 2) if seconds else None,
                    },
                )
            )

        # Beat length sanity for the chaptered tiers.
        if tier.chaptered and seconds and not (tier.beat_min_seconds <= seconds <= tier.beat_max_seconds):
            issues.append(
                Issue(
                    level="warning",
                    code="beat_length_out_of_band",
                    message=(
                        f"beat {g_index} is {seconds:.1f}s; tier '{tier.name}' wants "
                        f"{tier.beat_min_seconds:g}-{tier.beat_max_seconds:g}s"
                    ),
                    beat_index=g_index,
                    chapter_index=c_index,
                    numbers={"seconds": round(seconds, 2)},
                )
            )

    # ------------------------------------------------------------- hook rules
    if budgets:
        first = budgets[0]
        first_beat = next(b for _, _, b in _iter_beats(chapters))
        hook_words = count_words(_get(first_beat, "narration", ""))
        if hook_words > HOOK_MAX_WORDS:
            issues.append(
                Issue(
                    level="error",
                    code="hook_too_long",
                    message=(
                        f"hook is {hook_words} words; the cap is {HOOK_MAX_WORDS}. "
                        "Cut it — the pattern break has to land inside "
                        f"{HOOK_PATTERN_BREAK_SECONDS}s."
                    ),
                    beat_index=0,
                    chapter_index=0,
                    numbers={"words": hook_words, "cap": HOOK_MAX_WORDS},
                )
            )
        if tier.chaptered and first.seconds > OPENING_HOOK_WINDOW_SECONDS:
            # Hook rules still apply to the opening 10 seconds of mid/long.
            opening_budget = tier.word_budget(OPENING_HOOK_WINDOW_SECONDS)
            issues.append(
                Issue(
                    level="warning",
                    code="opening_hook_window",
                    message=(
                        f"the opening beat is {first.seconds:.1f}s; the hook still has to land "
                        f"inside the first {OPENING_HOOK_WINDOW_SECONDS:g}s "
                        f"(~{opening_budget} words)"
                    ),
                    beat_index=0,
                    chapter_index=0,
                    numbers={"seconds": round(first.seconds, 2), "opening_budget": opening_budget},
                )
            )

    # -------------------------------------------------------- short word cap
    word_cap = None
    if tier.name == "short":
        word_cap = short_word_cap(target_seconds)
        if total_words > word_cap:
            issues.append(
                Issue(
                    level="error",
                    code="script_over_cap",
                    message=(
                        f"script is {total_words} words against a {word_cap}-word cap at "
                        f"{target_seconds:g}s. Rewrite it shorter — audio is never sped up to fit."
                    ),
                    numbers={"words": total_words, "cap": word_cap},
                )
            )
        if len(budgets) != len(tier.structure):
            issues.append(
                Issue(
                    level="error",
                    code="short_structure",
                    message=(
                        f"short tier is a fixed four-beat structure; got {len(budgets)} beats"
                    ),
                    numbers={"beats": len(budgets)},
                )
            )

    # --------------------------------------------- total duration vs. script
    total_budget = tier.word_budget(target_seconds)
    if total_words > total_budget:
        issues.append(
            Issue(
                level="error",
                code="script_exceeds_duration",
                message=(
                    f"{total_words} words needs {total_words / tier.words_per_second:.1f}s at "
                    f"{tier.words_per_second} words/sec but the target is {target_seconds:g}s "
                    f"({total_budget} words). Rewrite — audio is never sped up to fit."
                ),
                numbers={
                    "words": total_words,
                    "budget": total_budget,
                    "needed_seconds": round(total_words / tier.words_per_second, 1),
                    "target_seconds": target_seconds,
                },
            )
        )

    ok = not any(i.level == "error" for i in issues)
    return ValidationReport(
        ok=ok, issues=issues, budgets=budgets, total_words=total_words, word_cap=word_cap
    )
