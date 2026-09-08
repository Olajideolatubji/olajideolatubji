"""The operator API. Nothing here blocks on a render — work goes to the queue."""

from __future__ import annotations

import os
import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .. import service, tasks
from ..config import settings
from ..cost import cost_summary, estimate_plan, month_to_date_usd
from ..db import get_db, get_setting, pause_queue, queue_is_paused, resume_queue
from ..format.planner import PlanError, expected_segment_count
from ..format.tiers import (
    HOOK_MAX_WORDS,
    HOOK_PATTERN_BREAK_SECONDS,
    ROLE_COLOURS,
    TIERS,
    short_windows,
    short_word_cap,
    tier_for_duration,
)
from ..models import (
    Batch,
    Beat,
    Chapter,
    CostEntry,
    ExportItem,
    HookVariant,
    Job,
    Project,
    ProjectStatus,
    Segment,
    UnitStatus,
    utcnow,
)
from ..providers import get_registry
from ..schemas import (
    BatchCreate,
    ExportCreate,
    ExportUpdate,
    HookVariantsRequest,
    LoginRequest,
    PauseRequest,
    ProjectCreate,
    ProjectUpdate,
    RecutRequest,
    RenderHooksRequest,
)
from ..security import check_password, clear_session, issue_session, require_operator

router = APIRouter(prefix="/api")
# Everything except login/logout/health sits behind the operator password.
guarded = APIRouter(dependencies=[Depends(require_operator)])


def _project_or_404(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(404, f"no project {project_id}")
    return project


def _project_view(project: Project) -> dict[str, Any]:
    return {
        "id": project.id,
        "name": project.name,
        "tier": project.tier,
        "target_seconds": project.target_seconds,
        "render_mode": project.render_mode,
        "status": project.status,
        "output_path": project.output_path,
        "cost_actual": round(project.cost_actual, 4),
        "estimate": project.estimate,
        "validation_ok": bool((project.validation or {}).get("ok", True)),
        "error": project.error,
        "batch_id": project.batch_id,
        "batch_index": project.batch_index,
        "source_project_id": project.source_project_id,
        "counts": (project.plan or {}).get("counts", {}),
        "confirmed": project.confirmed_at is not None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


# ------------------------------------------------------------------- session
@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response) -> dict[str, Any]:
    if not check_password(body.password):
        raise HTTPException(401, "wrong password")
    # Behind the deploy proxy uvicorn resolves the real scheme from
    # X-Forwarded-Proto, so an HTTPS session gets a Secure cookie either way.
    issue_session(response, secure=settings.cookie_secure or request.url.scheme == "https")
    return {"ok": True}


@router.post("/logout")
def logout(response: Response) -> dict[str, Any]:
    clear_session(response)
    return {"ok": True}


@router.get("/me")
def me(_: bool = Depends(require_operator)) -> dict[str, Any]:
    return {"operator": True}


# -------------------------------------------------------------------- config
@guarded.get("/config")
def config(db: Session = Depends(get_db)) -> dict[str, Any]:
    return {
        "render_mode": settings.render_mode,
        "heygen": {
            "mode": settings.heygen_mode,
            "test": settings.heygen_test,
            "max_segment_seconds": settings.heygen_max_segment_seconds,
            "poll_seconds": settings.poll_seconds,
            "template_id": settings.heygen_template_id or None,
        },
        "tiers": {
            name: {
                "min_seconds": t.min_seconds,
                "max_seconds": t.max_seconds,
                "chaptered": t.chaptered,
                "beat_min_seconds": t.beat_min_seconds,
                "beat_max_seconds": t.beat_max_seconds,
                "chapter_target_seconds": t.chapter_target_seconds,
                "words_per_second": t.words_per_second,
            }
            for name, t in TIERS.items()
        },
        "hook": {"max_words": HOOK_MAX_WORDS, "pattern_break_seconds": HOOK_PATTERN_BREAK_SECONDS},
        "role_colours": ROLE_COLOURS,
        "video": {
            "width": settings.video_width,
            "height": settings.video_height,
            "fps": settings.video_fps,
            "crossfade_ms": settings.crossfade_ms,
        },
        "queue": {
            "paused": queue_is_paused(db),
            "reason": get_setting(db, "queue_paused_reason", ""),
            "max_concurrent_segment_jobs": settings.max_concurrent_segment_jobs,
        },
        "cost": cost_summary(db),
    }


@guarded.get("/shape")
def shape(
    target_seconds: float = Query(..., gt=0),
    tier: Optional[str] = None,
) -> dict[str, Any]:
    """What a given length turns into, before anything is written down."""
    chosen = tier or tier_for_duration(target_seconds)
    spec = TIERS[chosen]
    out: dict[str, Any] = {
        "tier": chosen,
        "target_seconds": target_seconds,
        "segments": expected_segment_count(
            target_seconds, settings.heygen_max_segment_seconds, chosen
        ),
        "max_segment_seconds": settings.heygen_max_segment_seconds,
        "chaptered": spec.chaptered,
        "word_budget": spec.word_budget(target_seconds),
    }
    if chosen == "short":
        out["windows"] = [
            {"role": role, "start": lo, "end": hi, "word_budget": spec.word_budget(hi - lo)}
            for role, lo, hi in short_windows(target_seconds)
        ]
        out["word_cap"] = short_word_cap(target_seconds)
    else:
        out["chapters"] = max(1, round(target_seconds / spec.chapter_target_seconds))
    return out


@guarded.get("/providers")
def providers() -> dict[str, Any]:
    return get_registry().health()


# ------------------------------------------------------------------ projects
@guarded.get("/projects")
def list_projects(
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    batch_id: Optional[str] = None,
    limit: int = Query(100, le=500),
) -> dict[str, Any]:
    stmt = select(Project).order_by(desc(Project.created_at)).limit(limit)
    if status:
        stmt = stmt.where(Project.status == status)
    if batch_id:
        stmt = stmt.where(Project.batch_id == batch_id)
    rows = db.execute(stmt).scalars().all()
    return {"projects": [_project_view(p) for p in rows]}


@guarded.post("/projects", status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        project = service.create_project(
            db,
            name=body.name,
            target_seconds=body.target_seconds,
            spec=body.to_spec(),
            tier=body.tier,
            render_mode=body.render_mode,
        )
    except PlanError as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return {"project": _project_view(project), "plan": project.plan, "validation": project.validation}


@guarded.get("/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    return {
        "project": _project_view(project),
        "spec": project.spec,
        "plan": project.plan,
        "validation": project.validation,
        "progress": service.project_progress(db, project),
    }


@guarded.patch("/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    if project.status in ProjectStatus.ACTIVE:
        raise HTTPException(409, "project is running; pause it first")
    if body.name is not None:
        project.name = body.name
    if body.render_mode is not None:
        project.render_mode = body.render_mode
    if body.target_seconds is not None:
        project.target_seconds = body.target_seconds
    if body.spec is not None:
        project.spec = {**(project.spec or {}), **body.spec}
    try:
        service.replan_project(db, project)
    except (PlanError, service.ServiceError) as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return {"project": _project_view(project), "plan": project.plan, "validation": project.validation}


@guarded.post("/projects/{project_id}/replan")
def replan(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    try:
        service.replan_project(db, project)
    except (PlanError, service.ServiceError) as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    return {"plan": project.plan, "validation": project.validation, "estimate": project.estimate}


@guarded.get("/projects/{project_id}/preflight")
def preflight(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    estimate = service.preflight(db, project)
    ok, reason = service.can_start(db, project)
    return {"estimate": estimate.as_dict(), "can_start": ok, "reason": reason}


@guarded.post("/projects/{project_id}/confirm")
def confirm(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Explicit confirmation of the itemised estimate. Long tier needs it."""
    project = _project_or_404(db, project_id)
    estimate = estimate_plan(project.plan or {}, db=db)
    if estimate.over_monthly_cap:
        raise HTTPException(
            402,
            f"refused: ${estimate.month_to_date_usd:.2f} spent this month plus "
            f"${estimate.total_usd:.2f} estimated exceeds the ${estimate.monthly_cap_usd:.2f} cap",
        )
    project.confirmed_at = utcnow()
    project.estimate = estimate.as_dict()
    if project.status == ProjectStatus.AWAITING_CONFIRMATION:
        project.status = ProjectStatus.PLANNED
    db.commit()
    return {"confirmed": True, "estimate": project.estimate}


@guarded.post("/projects/{project_id}/start")
def start(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    if queue_is_paused(db):
        raise HTTPException(409, f"queue is paused: {get_setting(db, 'queue_paused_reason', '')}")
    ok, reason = service.can_start(db, project)
    if not ok:
        raise HTTPException(409, reason)
    project.status = ProjectStatus.QUEUED
    project.error = None
    db.commit()
    tasks.advance_project.delay(project.id)
    return {"started": True, "project": _project_view(project)}


@guarded.post("/projects/{project_id}/pause")
def pause_project(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    project.status = ProjectStatus.PAUSED
    db.commit()
    return {"paused": True}


@guarded.post("/projects/{project_id}/cancel")
def cancel_project(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    project.status = ProjectStatus.CANCELLED
    db.commit()
    return {"cancelled": True}


@guarded.get("/projects/{project_id}/progress")
def progress(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    return service.project_progress(db, project)


@guarded.delete("/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    db.delete(project)
    db.commit()
    return {"deleted": True}


# ----------------------------------------------------------- re-render units
@guarded.post("/chapters/{chapter_id}/rerender")
def rerender_chapter(chapter_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(404, "no such chapter")
    tasks.rerender_chapter.delay(chapter_id)
    return {"requeued": True, "chapter_id": chapter_id}


@guarded.post("/segments/{segment_id}/rerender")
def rerender_segment(segment_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    segment = db.get(Segment, segment_id)
    if segment is None:
        raise HTTPException(404, "no such segment")
    segment.status = UnitStatus.PENDING
    segment.output_path = None
    segment.provider_video_id = None
    segment.attempts = 0
    segment.error = None
    if segment.chapter_id:
        chapter = db.get(Chapter, segment.chapter_id)
        chapter.status = UnitStatus.PENDING
        chapter.output_path = None
        chapter.checkpoint = {}
    project = db.get(Project, segment.project_id)
    if project.status in {ProjectStatus.COMPLETE, ProjectStatus.FAILED}:
        project.status = ProjectStatus.RENDERING
    db.commit()
    tasks.advance_project.delay(segment.project_id)
    return {"requeued": True}


@guarded.post("/beats/{beat_id}/reroll")
def reroll_beat(beat_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    beat = db.get(Beat, beat_id)
    if beat is None:
        raise HTTPException(404, "no such beat")
    tasks.reroll_beat.delay(beat_id)
    return {"requeued": True, "beat_id": beat_id}


# ------------------------------------------------------------------ variants
@guarded.post("/projects/{project_id}/recut")
def recut(project_id: str, body: RecutRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    source = _project_or_404(db, project_id)
    try:
        project = service.create_recut(db, source, hook=body.hook, name=body.name)
    except (service.ServiceError, PlanError) as exc:
        raise HTTPException(400, str(exc)) from exc
    db.commit()
    if body.start:
        ok, reason = service.can_start(db, project)
        if not ok:
            raise HTTPException(409, reason)
        project.status = ProjectStatus.QUEUED
        db.commit()
        tasks.advance_project.delay(project.id)
    return {"project": _project_view(project)}


@guarded.get("/projects/{project_id}/hooks")
def list_hooks(project_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(
        select(HookVariant).where(HookVariant.project_id == project_id).order_by(HookVariant.index)
    ).scalars().all()
    return {
        "hooks": [
            {
                "id": h.id,
                "index": h.index,
                "text": h.text,
                "word_count": h.word_count,
                "valid": h.valid,
                "validation": h.validation,
                "rank": h.rank,
                "rendered": h.rendered,
                "chosen": h.chosen,
                "rejected": h.rejected,
                "status": h.status,
                "output_path": h.output_path,
                "error": h.error,
            }
            for h in rows
        ]
    }


@guarded.post("/projects/{project_id}/hooks")
def set_hooks(project_id: str, body: HookVariantsRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, project_id)
    variants = service.create_hook_variants(db, project, body.hooks)
    db.commit()
    return {"count": len(variants)}


@guarded.post("/projects/{project_id}/hooks/render")
def render_hooks(
    project_id: str, body: RenderHooksRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Render the opening for the top N hooks. Pick from real output, not text."""
    rows = db.execute(
        select(HookVariant).where(HookVariant.project_id == project_id).order_by(HookVariant.index)
    ).scalars().all()
    if body.variant_ids:
        chosen = [h for h in rows if h.id in set(body.variant_ids)]
    else:
        valid = [h for h in rows if h.valid]
        chosen = sorted(valid, key=lambda h: (h.rank if h.rank is not None else h.index))[: body.top_n]
    if not chosen:
        raise HTTPException(400, "no valid hooks to render")
    db.commit()
    for variant in chosen:
        tasks.render_hook_variant.delay(variant.id)
    return {"rendering": [h.id for h in chosen]}


@guarded.post("/hooks/{variant_id}/choose")
def choose_hook(variant_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    variant = db.get(HookVariant, variant_id)
    if variant is None:
        raise HTTPException(404, "no such hook variant")
    siblings = db.execute(
        select(HookVariant).where(HookVariant.project_id == variant.project_id)
    ).scalars().all()
    for sibling in siblings:
        # The rejects are kept, just marked.
        sibling.chosen = sibling.id == variant_id
        sibling.rejected = sibling.id != variant_id
    project = db.get(Project, variant.project_id)
    spec = dict(project.spec or {})
    if spec.get("beats"):
        beats = [dict(b) for b in spec["beats"]]
        beats[0] = {**beats[0], "narration": variant.text}
        spec["beats"] = beats
        project.spec = spec
        try:
            service.replan_project(db, project)
        except service.ServiceError as exc:
            raise HTTPException(409, str(exc)) from exc
    db.commit()
    return {"chosen": variant_id}


# ------------------------------------------------------------------- batches
@guarded.post("/batches", status_code=201)
def create_batch(body: BatchCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Queue N shorts at once and review them in a grid."""
    batch = Batch(name=body.name, kind="shorts", spec={"count": len(body.items)})
    db.add(batch)
    db.flush()
    created = []
    for i, item in enumerate(body.items):
        spec: dict[str, Any] = {"script": item.script}
        if item.beats:
            spec["beats"] = [b.model_dump() for b in item.beats]
        if item.template_id:
            spec["template_id"] = item.template_id
        if body.test is not None:
            spec["test"] = body.test
        try:
            project = service.create_project(
                db,
                name=item.name,
                target_seconds=item.target_seconds,
                spec=spec,
                tier="short",
                batch_id=batch.id,
                batch_index=i,
            )
        except PlanError as exc:
            raise HTTPException(400, f"item {i} ({item.name}): {exc}") from exc
        created.append(project)
    db.commit()

    started = []
    if body.start:
        for project in created:
            ok, _reason = service.can_start(db, project)
            if ok:
                project.status = ProjectStatus.QUEUED
                started.append(project.id)
        db.commit()
        for project_id in started:
            tasks.advance_project.delay(project_id)

    return {
        "batch": {"id": batch.id, "name": batch.name, "count": len(created)},
        "projects": [_project_view(p) for p in created],
        "started": started,
    }


@guarded.get("/batches")
def list_batches(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.execute(select(Batch).order_by(desc(Batch.created_at)).limit(100)).scalars().all()
    counts = dict(
        db.execute(
            select(Project.batch_id, func.count(Project.id)).group_by(Project.batch_id)
        ).all()
    )
    return {
        "batches": [
            {
                "id": b.id,
                "name": b.name,
                "kind": b.kind,
                "count": counts.get(b.id, 0),
                "created_at": b.created_at.isoformat(),
            }
            for b in rows
        ]
    }


@guarded.get("/batches/{batch_id}")
def get_batch(batch_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    batch = db.get(Batch, batch_id)
    if batch is None:
        raise HTTPException(404, "no such batch")
    projects = db.execute(
        select(Project).where(Project.batch_id == batch_id).order_by(Project.batch_index)
    ).scalars().all()
    return {
        "batch": {"id": batch.id, "name": batch.name},
        "projects": [_project_view(p) for p in projects],
    }


# ---------------------------------------------------------------------- jobs
@guarded.get("/jobs")
def list_jobs(
    db: Session = Depends(get_db),
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    step: Optional[str] = None,
    limit: int = Query(100, le=500),
) -> dict[str, Any]:
    stmt = select(Job).order_by(desc(Job.created_at)).limit(limit)
    if project_id:
        stmt = stmt.where(Job.project_id == project_id)
    if status:
        stmt = stmt.where(Job.status == status)
    if step:
        stmt = stmt.where(Job.step == step)
    rows = db.execute(stmt).scalars().all()
    return {"jobs": [service.job_view(j) for j in rows]}


@guarded.get("/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "no such job")
    return service.job_view(job)


# ---------------------------------------------------------------------- cost
@guarded.get("/cost")
def cost(db: Session = Depends(get_db)) -> dict[str, Any]:
    summary = cost_summary(db)
    per_project = db.execute(
        select(Project.id, Project.name, Project.cost_actual)
        .where(Project.cost_actual > 0)
        .order_by(desc(Project.cost_actual))
        .limit(50)
    ).all()
    recent = db.execute(
        select(CostEntry).order_by(desc(CostEntry.created_at)).limit(50)
    ).scalars().all()
    return {
        **summary,
        "per_project": [
            {"project_id": pid, "name": name, "cost_usd": round(cost or 0.0, 4)}
            for pid, name, cost in per_project
        ],
        "recent": [
            {
                "id": e.id,
                "kind": e.kind,
                "amount_usd": round(e.amount_usd, 4),
                "project_id": e.project_id,
                "segment_id": e.segment_id,
                "detail": e.detail,
                "created_at": e.created_at.isoformat(),
            }
            for e in recent
        ],
    }


@guarded.post("/queue/pause")
def queue_pause(body: PauseRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    pause_queue(db, body.reason or "paused by operator")
    db.commit()
    return {"paused": True}


@guarded.post("/queue/resume")
def queue_resume(db: Session = Depends(get_db)) -> dict[str, Any]:
    if month_to_date_usd(db) >= settings.monthly_cost_cap_usd:
        raise HTTPException(402, "monthly cost cap is still exceeded; raise MONTHLY_COST_CAP_USD")
    resume_queue(db)
    db.commit()
    tasks.resume_sweep.delay()
    return {"paused": False}


# -------------------------------------------------------------------- export
@guarded.get("/exports")
def list_exports(
    db: Session = Depends(get_db), status: Optional[str] = None
) -> dict[str, Any]:
    stmt = select(ExportItem).order_by(desc(ExportItem.created_at)).limit(200)
    if status:
        stmt = stmt.where(ExportItem.status == status)
    rows = db.execute(stmt).scalars().all()
    return {
        "exports": [
            {
                "id": e.id,
                "project_id": e.project_id,
                "platform": e.platform,
                "title": e.title,
                "description": e.description,
                "hashtags": e.hashtags,
                "file_path": e.file_path,
                "status": e.status,
                "notes": e.notes,
                "created_at": e.created_at.isoformat(),
                "published_at": e.published_at.isoformat() if e.published_at else None,
            }
            for e in rows
        ]
    }


@guarded.post("/exports", status_code=201)
def create_export(body: ExportCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    project = _project_or_404(db, body.project_id)
    item = ExportItem(
        project_id=project.id,
        platform=body.platform,
        title=body.title or project.name,
        description=body.description,
        hashtags=body.hashtags,
        notes=body.notes,
        file_path=project.output_path,
    )
    db.add(item)
    db.commit()
    return {"id": item.id}


@guarded.patch("/exports/{export_id}")
def update_export(export_id: str, body: ExportUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(ExportItem, export_id)
    if item is None:
        raise HTTPException(404, "no such export")
    if body.title is not None:
        item.title = body.title
    if body.description is not None:
        item.description = body.description
    if body.hashtags is not None:
        item.hashtags = body.hashtags
    if body.notes is not None:
        item.notes = body.notes
    if body.status is not None:
        item.status = body.status
        item.published_at = utcnow() if body.status == "published" else None
    db.commit()
    return {"ok": True}


@guarded.delete("/exports/{export_id}")
def delete_export(export_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    item = db.get(ExportItem, export_id)
    if item is None:
        raise HTTPException(404, "no such export")
    db.delete(item)
    db.commit()
    return {"deleted": True}


# --------------------------------------------------------------------- media
_RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@guarded.get("/media")
def media(path: str, request: Request) -> Response:
    """Serve a file from under STORAGE_ROOT, with Range support so the
    dashboard can scrub through a take."""
    root = os.path.realpath(settings.storage_root)
    full = os.path.realpath(path)
    if not full.startswith(root + os.sep):
        raise HTTPException(403, "path is outside the storage root")
    if not os.path.isfile(full):
        raise HTTPException(404, "no such file")

    size = os.path.getsize(full)
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(full, media_type="video/mp4")

    match = _RANGE_RE.match(range_header)
    if not match:
        raise HTTPException(416, "bad range")
    start = int(match.group(1) or 0)
    end = int(match.group(2)) if match.group(2) else size - 1
    end = min(end, size - 1)
    if start > end:
        raise HTTPException(416, "bad range")
    length = end - start + 1

    def chunks():
        with open(full, "rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                data = fh.read(min(1024 * 512, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(
        chunks(),
        status_code=206,
        media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
        },
    )


@router.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"ok": True, "app": settings.app_name})


router.include_router(guarded)
