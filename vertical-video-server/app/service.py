"""Domain service: turn operator intent into rows, and read rows back for the
dashboard. The workers do the spending; this module does the bookkeeping."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import Settings, settings as default_settings
from .cost import Estimate, estimate_plan
from .format.planner import Plan, PlanError, plan_project
from .format.tiers import ROLE_COLOURS, get_tier, tier_for_duration
from .format.validation import count_words
from .media import storage
from .models import (
    Beat,
    Chapter,
    HookVariant,
    Job,
    JobStatus,
    Project,
    ProjectStatus,
    Segment,
    UnitStatus,
)

log = logging.getLogger(__name__)


class ServiceError(ValueError):
    pass


# ------------------------------------------------------------------ planning
def build_plan(
    *,
    target_seconds: float,
    spec: dict[str, Any],
    tier: str | None = None,
    settings: Settings | None = None,
) -> Plan:
    s = settings or default_settings
    return plan_project(
        target_seconds=target_seconds,
        spec=spec,
        tier=tier,
        max_segment_seconds=s.heygen_max_segment_seconds,
        crossfade_ms=s.crossfade_ms,
        plate_pool_size=s.plate_pool_per_chapter,
        expensive_cap=s.max_expensive_beats_per_chapter,
        loopable_min_seconds=s.loopable_min_seconds,
    )


def materialise_plan(db: Session, project: Project, plan: Plan) -> None:
    """Replace the project's structure with a freshly planned one.

    Only legal while nothing has been rendered — a started project keeps its
    checkpoints.
    """
    rendered = db.execute(
        select(func.count(Segment.id)).where(
            Segment.project_id == project.id, Segment.status == UnitStatus.COMPLETE
        )
    ).scalar_one()
    if rendered:
        raise ServiceError(
            f"{rendered} segment(s) are already rendered; re-render individual chapters instead "
            "of replanning the project"
        )

    db.execute(delete(Beat).where(Beat.project_id == project.id))
    db.execute(delete(Segment).where(Segment.project_id == project.id))
    db.execute(delete(Chapter).where(Chapter.project_id == project.id))
    db.flush()

    segment_rows: dict[int, Segment] = {}
    for planned in plan.segments:
        row = Segment(
            project_id=project.id,
            index=planned.index,
            index_in_chapter=planned.index_in_chapter,
            start_seconds=planned.start_seconds,
            duration_seconds=planned.duration_seconds,
            narration=planned.narration,
        )
        db.add(row)
        segment_rows[planned.index] = row
    db.flush()

    for planned_chapter in plan.chapters:
        chapter = Chapter(
            project_id=project.id,
            index=planned_chapter.index,
            title=planned_chapter.title,
            start_seconds=planned_chapter.start_seconds,
            duration_seconds=planned_chapter.duration_seconds,
            asset_pool={"plates": planned_chapter.plate_pool},
        )
        db.add(chapter)
        db.flush()
        for seg_index in planned_chapter.segment_indexes:
            segment_rows[seg_index].chapter_id = chapter.id
        for planned_beat in planned_chapter.beats:
            db.add(
                Beat(
                    project_id=project.id,
                    chapter_id=chapter.id,
                    segment_id=segment_rows[planned_beat.segment_index].id
                    if planned_beat.segment_index is not None
                    else None,
                    index=planned_beat.index,
                    global_index=planned_beat.global_index,
                    role=planned_beat.role,
                    start_seconds=planned_beat.start_seconds,
                    duration_seconds=planned_beat.duration_seconds,
                    narration=planned_beat.narration,
                    visual=planned_beat.visual,
                    loopable=planned_beat.loopable,
                    key_moment=planned_beat.key_moment,
                    expensive=planned_beat.expensive,
                    plate_ref=planned_beat.plate_ref,
                    framing=planned_beat.framing,
                )
            )
    db.flush()

    project.plan = plan.as_dict()
    project.validation = plan.validation.as_dict()
    project.tier = plan.tier
    project.status = ProjectStatus.PLANNED
    db.flush()


def create_project(
    db: Session,
    *,
    name: str,
    target_seconds: float,
    spec: dict[str, Any] | None = None,
    tier: str | None = None,
    render_mode: str | None = None,
    batch_id: str | None = None,
    batch_index: int | None = None,
    source_project_id: str | None = None,
    settings: Settings | None = None,
) -> Project:
    s = settings or default_settings
    spec = dict(spec or {})
    tier = tier or spec.get("tier") or tier_for_duration(target_seconds)
    plan = build_plan(target_seconds=target_seconds, spec=spec, tier=tier, settings=s)

    project = Project(
        name=name,
        tier=plan.tier,
        target_seconds=target_seconds,
        render_mode=render_mode or s.render_mode,
        spec=spec,
        status=ProjectStatus.DRAFT,
        batch_id=batch_id,
        batch_index=batch_index,
        source_project_id=source_project_id,
    )
    db.add(project)
    db.flush()

    materialise_plan(db, project, plan)
    estimate = estimate_plan(plan.as_dict(), db=db, settings=s)
    project.estimate = estimate.as_dict()
    if estimate.requires_confirmation:
        # A new plan is a new number: any earlier confirmation is void.
        project.confirmed_at = None
        project.status = ProjectStatus.AWAITING_CONFIRMATION
    db.flush()
    return project


def replan_project(db: Session, project: Project, settings: Settings | None = None) -> Project:
    s = settings or default_settings
    plan = build_plan(
        target_seconds=project.target_seconds, spec=project.spec, tier=project.tier, settings=s
    )
    materialise_plan(db, project, plan)
    estimate = estimate_plan(plan.as_dict(), db=db, settings=s)
    project.estimate = estimate.as_dict()
    if estimate.requires_confirmation:
        # A new plan is a new number: any earlier confirmation is void.
        project.confirmed_at = None
        project.status = ProjectStatus.AWAITING_CONFIRMATION
    db.flush()
    return project


# ------------------------------------------------------------------ starting
def preflight(db: Session, project: Project, settings: Settings | None = None) -> Estimate:
    s = settings or default_settings
    return estimate_plan(project.plan or {}, db=db, settings=s)


def can_start(db: Session, project: Project, settings: Settings | None = None) -> tuple[bool, str]:
    s = settings or default_settings
    validation = project.validation or {}
    if validation.get("errors"):
        first = validation["errors"][0]["message"]
        return False, f"script validation failed: {first}"
    estimate = preflight(db, project, s)
    if estimate.over_monthly_cap:
        return False, (
            f"refused: ${estimate.month_to_date_usd:.2f} spent this month plus "
            f"${estimate.total_usd:.2f} estimated exceeds the ${estimate.monthly_cap_usd:.2f} cap"
        )
    if estimate.requires_confirmation and project.confirmed_at is None:
        return False, "long-tier render needs explicit confirmation of the cost estimate"
    return True, ""


# ------------------------------------------------------------------ progress
def project_progress(db: Session, project: Project) -> dict[str, Any]:
    chapters = db.execute(
        select(Chapter).where(Chapter.project_id == project.id).order_by(Chapter.index)
    ).scalars().all()
    segments = db.execute(
        select(Segment).where(Segment.project_id == project.id).order_by(Segment.index)
    ).scalars().all()
    beats = db.execute(
        select(Beat).where(Beat.project_id == project.id).order_by(Beat.global_index)
    ).scalars().all()

    beats_by_chapter: dict[str, list[Beat]] = {}
    for beat in beats:
        beats_by_chapter.setdefault(beat.chapter_id, []).append(beat)
    segments_by_chapter: dict[str | None, list[Segment]] = {}
    for segment in segments:
        segments_by_chapter.setdefault(segment.chapter_id, []).append(segment)

    tier = get_tier(project.tier)
    total_seconds = sum(c.duration_seconds for c in chapters) or project.target_seconds
    done_seconds = sum(c.duration_seconds for c in chapters if c.status == UnitStatus.COMPLETE)

    chapter_views = []
    for chapter in chapters:
        chapter_beats = beats_by_chapter.get(chapter.id, [])
        chapter_segments = segments_by_chapter.get(chapter.id, [])
        chapter_views.append(
            {
                "id": chapter.id,
                "index": chapter.index,
                "title": chapter.title,
                "status": chapter.status,
                "start_seconds": chapter.start_seconds,
                "duration_seconds": chapter.duration_seconds,
                "output_path": chapter.output_path,
                "cost": round(chapter.cost, 4),
                "error": chapter.error,
                "checkpoint": chapter.checkpoint,
                "segments": [
                    {
                        "id": s.id,
                        "index": s.index,
                        "index_in_chapter": s.index_in_chapter,
                        "status": s.status,
                        "duration_seconds": s.duration_seconds,
                        "start_seconds": s.start_seconds,
                        "provider": s.provider,
                        "provider_video_id": s.provider_video_id,
                        "attempts": s.attempts,
                        "cost": round(s.cost, 4),
                        "error": s.error,
                        "output_path": s.output_path,
                    }
                    for s in chapter_segments
                ],
                "beats": [
                    {
                        "id": b.id,
                        "index": b.index,
                        "global_index": b.global_index,
                        "role": b.role,
                        "colour": ROLE_COLOURS.get(b.role, ROLE_COLOURS["body"]),
                        "start_seconds": b.start_seconds,
                        "duration_seconds": b.duration_seconds,
                        "narration": b.narration,
                        "visual": b.visual,
                        "words": count_words(b.narration),
                        "word_budget": tier.word_budget(b.duration_seconds),
                        "loopable": b.loopable,
                        "key_moment": b.key_moment,
                        "expensive": b.expensive,
                        "plate_ref": b.plate_ref,
                        "framing": b.framing,
                        "segment_id": b.segment_id,
                        "status": b.status,
                        "accept_path": b.accept_path,
                        "error": b.error,
                    }
                    for b in chapter_beats
                ],
            }
        )

    return {
        "project_id": project.id,
        "tier": project.tier,
        "status": project.status,
        "render_mode": project.render_mode,
        "target_seconds": project.target_seconds,
        "planned_seconds": round(total_seconds, 2),
        "percent": round(100.0 * done_seconds / total_seconds, 1) if total_seconds else 0.0,
        "chapters_total": len(chapters),
        "chapters_complete": sum(1 for c in chapters if c.status == UnitStatus.COMPLETE),
        "segments_total": len(segments),
        "segments_complete": sum(1 for s in segments if s.status == UnitStatus.COMPLETE),
        "segments_failed": sum(1 for s in segments if s.status == UnitStatus.FAILED),
        "seams": (project.plan or {}).get("seams", []),
        "chapters": chapter_views,
        "output_path": project.output_path,
        "cost_actual": round(project.cost_actual, 4),
        "estimate": project.estimate,
        "validation": project.validation,
        "error": project.error,
        "disk_mb": storage.disk_usage_mb(storage.get_layout(), project.id),
    }


# ------------------------------------------------------------------ variants
def create_recut(
    db: Session, source: Project, *, hook: str, name: str | None = None, settings: Settings | None = None
) -> Project:
    """Resubmit with a different hook, body unchanged."""
    spec = dict(source.spec or {})
    beats = [dict(b) for b in (spec.get("beats") or [])]
    if beats:
        beats[0] = {**beats[0], "narration": hook}
        spec["beats"] = beats
    elif spec.get("chapters"):
        chapters = [dict(c) for c in spec["chapters"]]
        first = dict(chapters[0])
        first_beats = [dict(b) for b in (first.get("beats") or [])]
        if not first_beats:
            raise ServiceError("source project has no beats to re-cut")
        first_beats[0] = {**first_beats[0], "narration": hook}
        first["beats"] = first_beats
        chapters[0] = first
        spec["chapters"] = chapters
    else:
        raise ServiceError("source project has no structured beats; nothing to re-cut")

    spec["recut_of"] = source.id
    return create_project(
        db,
        name=name or f"{source.name} (re-cut)",
        target_seconds=source.target_seconds,
        spec=spec,
        tier=source.tier,
        render_mode=source.render_mode,
        source_project_id=source.id,
        settings=settings,
    )


def create_hook_variants(db: Session, project: Project, hooks: list[str]) -> list[HookVariant]:
    from .format.tiers import HOOK_MAX_WORDS

    db.execute(delete(HookVariant).where(HookVariant.project_id == project.id))
    variants: list[HookVariant] = []
    for i, text in enumerate(hooks):
        words = count_words(text)
        valid = words <= HOOK_MAX_WORDS
        variant = HookVariant(
            project_id=project.id,
            index=i,
            text=text.strip(),
            word_count=words,
            valid=valid,
            validation={}
            if valid
            else {
                "code": "hook_too_long",
                "message": f"{words} words, cap is {HOOK_MAX_WORDS}",
            },
        )
        db.add(variant)
        variants.append(variant)
    db.flush()
    return variants


# ---------------------------------------------------------------------- jobs
def create_job(
    db: Session,
    *,
    step: str,
    provider: str = "",
    project_id: str | None = None,
    chapter_id: str | None = None,
    segment_id: str | None = None,
    beat_id: str | None = None,
    parent_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> Job:
    job = Job(
        step=step,
        provider=provider,
        project_id=project_id,
        chapter_id=chapter_id,
        segment_id=segment_id,
        beat_id=beat_id,
        parent_id=parent_id,
        payload=payload or {},
        status=JobStatus.PENDING,
    )
    db.add(job)
    db.flush()
    return job


def job_view(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "parent_id": job.parent_id,
        "project_id": job.project_id,
        "chapter_id": job.chapter_id,
        "segment_id": job.segment_id,
        "beat_id": job.beat_id,
        "step": job.step,
        "provider": job.provider,
        "status": job.status,
        "attempts": job.attempts,
        "provider_job_id": job.provider_job_id,
        "cost": round(job.cost, 4),
        "output_path": job.output_path,
        "error": job.error,
        "payload": job.payload,
        "response": job.response,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


__all__ = [
    "ServiceError",
    "PlanError",
    "build_plan",
    "create_project",
    "replan_project",
    "materialise_plan",
    "preflight",
    "can_start",
    "project_progress",
    "create_recut",
    "create_hook_variants",
    "create_job",
    "job_view",
]
