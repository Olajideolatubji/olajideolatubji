"""Celery tasks: the queue that actually spends money.

Shape of the thing: `advance_project` is the only driver. It reads the database,
works out what the next unit of work is, dispatches it, and returns. Every unit
of work calls `advance_project` again when it finishes. That makes the whole
pipeline resumable by construction — a crash loses at most one in-flight unit,
and `resume_sweep` restarts from the last completed chapter, never from the
beginning.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

import redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from .celery_app import celery_app
from .config import settings
from .cost import record_cost
from .db import queue_is_paused, session_scope
from .media import captions as caption_tools
from .media import ffmpeg, storage
from .models import (
    Beat,
    Chapter,
    HookVariant,
    Job,
    JobStatus,
    Project,
    ProjectStatus,
    Segment,
    Step,
    UnitStatus,
    utcnow,
)
from .providers import BeatSpec, ProviderError, SegmentSpec, get_registry
from .service import create_job

log = logging.getLogger(__name__)

_redis = redis.Redis.from_url(settings.redis_url)
_layout = storage.get_layout()


# --------------------------------------------------------------------- utils
@contextmanager
def project_lock(project_id: str, ttl: int = 120) -> Iterator[bool]:
    """One advance at a time per project. A missed lock is not an error: the
    holder will do the work, and every unit of work advances again on finish."""
    lock = _redis.lock(f"vvs:advance:{project_id}", timeout=ttl, blocking_timeout=0)
    acquired = lock.acquire(blocking=False)
    try:
        yield acquired
    finally:
        if acquired:
            try:
                lock.release()
            except redis.exceptions.LockError:
                pass


def _aware(value: datetime | None) -> datetime:
    """Timestamps come back naive from some drivers; treat them as UTC."""
    if value is None:
        return datetime.now(timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def backoff_seconds(attempts: int) -> int:
    return min(
        settings.retry_backoff_max_seconds,
        settings.retry_backoff_seconds * (2 ** max(0, attempts - 1)),
    )


def _fail_job(db: Session, job: Job, error: str) -> None:
    job.status = JobStatus.FAILED
    job.error = error
    job.finished_at = utcnow()
    db.flush()


def _finish_job(db: Session, job: Job, *, output_path: str | None = None, cost: float = 0.0) -> None:
    job.status = JobStatus.SUCCEEDED
    job.output_path = output_path
    job.cost = cost
    job.finished_at = utcnow()
    db.flush()


def _project_failed(db: Session, project: Project, error: str) -> None:
    project.status = ProjectStatus.FAILED
    project.error = error
    db.flush()
    log.error("project %s failed: %s", project.id, error)


def _segment_spec(project: Project, segment: Segment, chapter: Chapter | None) -> SegmentSpec:
    spec = project.spec or {}
    title_bits = [project.name]
    if chapter is not None and project.tier != "short":
        title_bits.append(f"ch{chapter.index + 1:02d}")
    title_bits.append(f"seg{segment.index + 1:03d}")
    return SegmentSpec(
        segment_id=segment.id,
        project_id=project.id,
        index=segment.index,
        narration=segment.narration,
        duration_seconds=segment.duration_seconds,
        title=" ".join(title_bits),
        width=settings.heygen_dimension_width,
        height=settings.heygen_dimension_height,
        template_id=spec.get("template_id") or None,
        avatar_id=spec.get("avatar_id") or None,
        voice_id=spec.get("voice_id") or None,
        background=spec.get("background") or None,
        test=bool(spec.get("test", settings.heygen_test)),
        extra=spec.get("provider_extra") or {},
    )


# ----------------------------------------------------------------- the driver
@celery_app.task(name="app.tasks.advance_project")
def advance_project(project_id: str) -> dict[str, Any]:
    """Look at the project, dispatch whatever comes next, return."""
    with project_lock(project_id) as acquired:
        if not acquired:
            return {"project_id": project_id, "skipped": "locked"}

        dispatch: list[tuple[str, str]] = []
        with session_scope() as db:
            project = db.get(Project, project_id)
            if project is None:
                return {"error": "no such project"}
            if project.status in {
                ProjectStatus.COMPLETE,
                ProjectStatus.FAILED,
                ProjectStatus.CANCELLED,
                ProjectStatus.DRAFT,
                ProjectStatus.AWAITING_CONFIRMATION,
                # An operator pause sticks until they press Start again.
                ProjectStatus.PAUSED,
            }:
                return {"project_id": project_id, "status": project.status, "idle": True}

            if queue_is_paused(db):
                # Leave the project where it is: the resume sweep picks it back
                # up when the queue is released.
                return {"project_id": project_id, "status": project.status, "queue": "paused"}

            if project.status in {ProjectStatus.QUEUED, ProjectStatus.PLANNED}:
                project.status = ProjectStatus.RENDERING

            chapters = db.execute(
                select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.index)
            ).scalars().all()
            segments = db.execute(
                select(Segment).where(Segment.project_id == project_id).order_by(Segment.index)
            ).scalars().all()

            failed = [s for s in segments if s.status == UnitStatus.FAILED]
            if failed:
                _project_failed(
                    db,
                    project,
                    f"segment {failed[0].index} failed: {failed[0].error or 'unknown error'}",
                )
                return {"project_id": project_id, "status": "failed"}

            running = sum(1 for s in segments if s.status == UnitStatus.RUNNING)
            slots = max(0, settings.max_concurrent_segment_jobs - running)
            by_chapter: dict[str | None, list[Segment]] = {}
            for segment in segments:
                by_chapter.setdefault(segment.chapter_id, []).append(segment)

            beats_mode = project.render_mode == "beats"

            for chapter in chapters:
                if chapter.status == UnitStatus.COMPLETE:
                    continue
                chapter_segments = by_chapter.get(chapter.id, [])
                if not chapter_segments:
                    chapter.status = UnitStatus.COMPLETE
                    continue

                if all(s.status == UnitStatus.COMPLETE for s in chapter_segments):
                    # Incremental assembly: this chapter is concatenated the
                    # moment it finishes, not at the end of a 3-hour build.
                    if not (chapter.checkpoint or {}).get("assembly_dispatched"):
                        chapter.checkpoint = {**(chapter.checkpoint or {}), "assembly_dispatched": True}
                        chapter.status = UnitStatus.RUNNING
                        dispatch.append(("assemble_chapter", chapter.id))
                    continue

                for segment in chapter_segments:
                    if slots <= 0:
                        break
                    if segment.status != UnitStatus.PENDING:
                        continue
                    segment.status = UnitStatus.RUNNING
                    chapter.status = UnitStatus.RUNNING
                    slots -= 1
                    dispatch.append(
                        ("render_segment_beats" if beats_mode else "submit_segment", segment.id)
                    )

            if chapters and all(c.status == UnitStatus.COMPLETE for c in chapters):
                if project.status != ProjectStatus.ASSEMBLING:
                    project.status = ProjectStatus.ASSEMBLING
                    dispatch.append(("assemble_final", project.id))

        for task_name, target in dispatch:
            globals()[task_name].delay(target)
        return {"project_id": project_id, "dispatched": [d[0] for d in dispatch]}


# ------------------------------------------------------- composition (HeyGen)
@celery_app.task(name="app.tasks.submit_segment")
def submit_segment(segment_id: str) -> dict[str, Any]:
    registry = get_registry()
    with session_scope() as db:
        segment = db.get(Segment, segment_id)
        if segment is None or segment.status == UnitStatus.COMPLETE:
            return {"segment_id": segment_id, "skipped": True}
        if queue_is_paused(db):
            segment.status = UnitStatus.PENDING
            return {"segment_id": segment_id, "skipped": "queue paused"}

        project = db.get(Project, segment.project_id)
        chapter = db.get(Chapter, segment.chapter_id) if segment.chapter_id else None
        spec = _segment_spec(project, segment, chapter)
        job = create_job(
            db,
            step=Step.SEGMENT_RENDER,
            project_id=project.id,
            chapter_id=segment.chapter_id,
            segment_id=segment.id,
            payload={"spec": spec.__dict__},
        )
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        job.attempts = segment.attempts + 1
        segment.attempts = job.attempts
        db.flush()
        job_id, attempt = job.id, job.attempts

    try:
        submission, provider = registry.run_with_failover(
            Step.SEGMENT_RENDER, lambda p: p.submit(spec), attempt=attempt - 1
        )
    except ProviderError as exc:
        return _handle_segment_error(segment_id, job_id, str(exc), exc.retryable)

    with session_scope() as db:
        job = db.get(Job, job_id)
        segment = db.get(Segment, segment_id)
        job.provider = provider.name
        job.provider_job_id = submission.provider_job_id
        # The FULL payload, kept so a video that lands can be diffed against
        # one that does not.
        job.payload = {**job.payload, "request": submission.payload}
        job.response = submission.response
        job.status = JobStatus.POLLING
        segment.provider = provider.name
        segment.provider_video_id = submission.provider_job_id
        db.flush()

    poll_segment.apply_async(args=[job_id], countdown=settings.poll_seconds)
    return {"segment_id": segment_id, "job_id": job_id, "provider_job_id": submission.provider_job_id}


@celery_app.task(name="app.tasks.poll_segment")
def poll_segment(job_id: str) -> dict[str, Any]:
    """Poll, never faster than every 20 seconds (enforced in Settings)."""
    registry = get_registry()
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None or job.status in JobStatus.TERMINAL:
            return {"job_id": job_id, "skipped": True}
        provider_name, provider_job_id = job.provider, job.provider_job_id
        started = job.started_at or job.created_at
        segment_id = job.segment_id
        project_id = job.project_id

    if not provider_job_id:
        return _handle_segment_error(segment_id, job_id, "no provider job id to poll", False)

    age = datetime.now(timezone.utc) - _aware(started)
    if age > timedelta(minutes=settings.heygen_max_poll_minutes):
        return _handle_segment_error(
            segment_id,
            job_id,
            f"gave up after {settings.heygen_max_poll_minutes} minutes waiting on "
            f"{provider_name} video {provider_job_id}",
            True,
        )

    try:
        provider = registry.get(provider_name)
        status = provider.poll(provider_job_id)
    except ProviderError as exc:
        if not exc.retryable:
            return _handle_segment_error(segment_id, job_id, str(exc), False)
        poll_segment.apply_async(args=[job_id], countdown=settings.poll_seconds)
        return {"job_id": job_id, "transient": str(exc)}

    if status.state in {"pending", "processing"}:
        with session_scope() as db:
            job = db.get(Job, job_id)
            job.response = status.raw
            db.flush()
        poll_segment.apply_async(args=[job_id], countdown=settings.poll_seconds)
        return {"job_id": job_id, "state": status.state}

    if status.state == "failed":
        return _handle_segment_error(
            segment_id, job_id, status.error or f"provider reported failure: {status.raw}", True
        )

    # completed
    with session_scope() as db:
        job = db.get(Job, job_id)
        segment = db.get(Segment, segment_id)
        attempt = job.attempts
        take_path = _layout.segment_take(project_id, segment.index, attempt)
        accepted_path = _layout.segment_accepted(project_id, segment.index)
        duration = segment.duration_seconds
        job.response = status.raw

    try:
        provider.download(status.url, take_path)
        ffmpeg.normalize(take_path, accepted_path)
        real_duration = ffmpeg.probe_duration(accepted_path)
    except (ProviderError, ffmpeg.FFmpegError) as exc:
        return _handle_segment_error(segment_id, job_id, str(exc), True)

    cost = 0.0
    with session_scope() as db:
        job = db.get(Job, job_id)
        segment = db.get(Segment, segment_id)
        project = db.get(Project, project_id)
        cost = getattr(provider, "estimate_cost", lambda *_a, **_k: 0.0)(
            real_duration or duration, test=bool((project.spec or {}).get("test", settings.heygen_test))
        )
        segment.output_path = accepted_path
        segment.status = UnitStatus.COMPLETE
        segment.cost = cost
        segment.error = None
        _finish_job(db, job, output_path=accepted_path, cost=cost)
        record_cost(
            db,
            kind="render",
            amount_usd=cost,
            project_id=project_id,
            segment_id=segment_id,
            job_id=job_id,
            detail={"seconds": real_duration, "provider": provider.name, "video_id": provider_job_id},
        )
        if segment.chapter_id:
            chapter = db.get(Chapter, segment.chapter_id)
            chapter.cost = round((chapter.cost or 0.0) + cost, 4)
        keep = {
            s.output_path
            for s in db.execute(
                select(Segment).where(Segment.project_id == project_id)
            ).scalars().all()
            if s.output_path
        }
    storage.prune_superseded_takes(_layout, project_id, keep)

    advance_project.delay(project_id)
    return {"job_id": job_id, "segment_id": segment_id, "state": "completed", "cost": cost}


def _handle_segment_error(
    segment_id: str | None, job_id: str, error: str, retryable: bool
) -> dict[str, Any]:
    """Store the provider's own text, then retry with backoff or fail for real."""
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is not None:
            _fail_job(db, job, error)
        segment = db.get(Segment, segment_id) if segment_id else None
        if segment is None:
            return {"job_id": job_id, "error": error}
        segment.error = error
        attempts = segment.attempts
        project_id = segment.project_id
        project = db.get(Project, project_id)
        beats_mode = project is not None and project.render_mode == "beats"
        if retryable and attempts < settings.max_retries:
            segment.status = UnitStatus.PENDING
            retry_in = backoff_seconds(attempts)
        else:
            segment.status = UnitStatus.FAILED
            retry_in = None
        db.flush()

    if retry_in is not None:
        log.warning("segment %s attempt %s failed, retrying in %ss: %s", segment_id, attempts, retry_in, error)
        # Retry down the path the project actually renders on.
        retry_task = render_segment_beats if beats_mode else submit_segment
        retry_task.apply_async(args=[segment_id], countdown=retry_in)
        return {"segment_id": segment_id, "retry_in": retry_in, "error": error}

    advance_project.delay(project_id)
    return {"segment_id": segment_id, "failed": True, "error": error}


# ------------------------------------------------------------ beats (ComfyUI)
@celery_app.task(name="app.tasks.render_segment_beats")
def render_segment_beats(segment_id: str) -> dict[str, Any]:
    """RENDER_MODE=beats: render every beat of the segment that is not already
    accepted, then join them into the segment."""
    with session_scope() as db:
        segment = db.get(Segment, segment_id)
        if segment is None:
            return {"segment_id": segment_id, "skipped": True}
        beats = db.execute(
            select(Beat).where(Beat.segment_id == segment_id).order_by(Beat.global_index)
        ).scalars().all()
        pending = [b.id for b in beats if b.status != UnitStatus.COMPLETE or not b.accept_path]

    for beat_id in pending:
        try:
            render_beat(beat_id)
        except Exception as exc:  # noqa: BLE001 — the error text is the point
            return _handle_segment_error(segment_id, _beat_job_id(beat_id), str(exc), True)

    return assemble_segment_from_beats(segment_id)


def _beat_job_id(beat_id: str) -> str:
    with session_scope() as db:
        job = db.execute(
            select(Job).where(Job.beat_id == beat_id).order_by(Job.created_at.desc())
        ).scalars().first()
        return job.id if job else ""


@celery_app.task(name="app.tasks.render_beat")
def render_beat(beat_id: str) -> dict[str, Any]:
    """One beat: still -> image-to-video -> narration -> accepted take.

    Re-rolling one beat never re-renders the others: this writes only inside the
    beat's own directory and only touches its own accept file.
    """
    registry = get_registry()
    with session_scope() as db:
        beat = db.get(Beat, beat_id)
        project = db.get(Project, beat.project_id)
        chapter = db.get(Chapter, beat.chapter_id)
        spec = BeatSpec(
            beat_id=beat.id,
            project_id=beat.project_id,
            chapter_index=chapter.index if chapter else 0,
            index=beat.global_index,
            prompt=beat.visual or beat.narration,
            negative_prompt=(project.spec or {}).get("negative_prompt", ""),
            duration_seconds=beat.duration_seconds,
            references=(project.spec or {}).get("references", []),
            plate_ref=beat.plate_ref,
            framing=beat.framing,
            loopable=beat.loopable,
            width=settings.video_width,
            height=settings.video_height,
            fps=settings.video_fps,
        )
        narration = beat.narration
        job = create_job(
            db,
            step=Step.BEAT_VIDEO,
            project_id=beat.project_id,
            chapter_id=beat.chapter_id,
            segment_id=beat.segment_id,
            beat_id=beat.id,
            payload={"spec": spec.__dict__},
        )
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        job.attempts += 1
        db.flush()
        job_id = job.id
        beat_dir = _layout.beat_dir(beat.project_id, beat.id)
        project_id = beat.project_id
        duration = beat.duration_seconds

    image_path = os.path.join(beat_dir, "still.png")
    clip_path = os.path.join(beat_dir, "clip.mp4")
    voiced_path = os.path.join(beat_dir, "voiced.mp4")
    audio_path = os.path.join(_layout.tts(project_id), f"{beat_id}.mp3")

    try:
        image_provider = registry.primary(Step.BEAT_IMAGE)
        image_provider.generate_image(spec, image_path)
        video_provider = registry.primary(Step.BEAT_VIDEO)
        video_provider.image_to_video(image_path, spec, clip_path)

        if spec.loopable or ffmpeg.probe_duration(clip_path) < duration - 0.1:
            looped = os.path.join(beat_dir, "looped.mp4")
            ffmpeg.loop_to_length(clip_path, looped, duration)
            clip_path = looped

        if narration.strip():
            # Per beat. Never per chapter.
            registry.tts().synthesize(narration, audio_path)
            ffmpeg.mux_audio(clip_path, audio_path, voiced_path)
        else:
            ffmpeg.normalize(clip_path, voiced_path)

        accepted = storage.accept_beat(
            _layout,
            project_id,
            beat_id,
            voiced_path,
            {"job_id": job_id, "prompt": spec.prompt, "framing": spec.framing},
        )
    except Exception as exc:  # noqa: BLE001
        with session_scope() as db:
            job = db.get(Job, job_id)
            beat = db.get(Beat, beat_id)
            _fail_job(db, job, str(exc))
            beat.status = UnitStatus.FAILED
            beat.error = str(exc)
        raise

    with session_scope() as db:
        job = db.get(Job, job_id)
        beat = db.get(Beat, beat_id)
        beat.image_path = image_path
        beat.video_path = clip_path
        beat.tts_path = audio_path if narration.strip() else None
        beat.accept_path = accepted
        beat.status = UnitStatus.COMPLETE
        beat.error = None
        _finish_job(db, job, output_path=accepted)
    return {"beat_id": beat_id, "accepted": accepted}


@celery_app.task(name="app.tasks.assemble_segment_from_beats")
def assemble_segment_from_beats(segment_id: str) -> dict[str, Any]:
    with session_scope() as db:
        segment = db.get(Segment, segment_id)
        project_id = segment.project_id
        beats = db.execute(
            select(Beat).where(Beat.segment_id == segment_id).order_by(Beat.global_index)
        ).scalars().all()
        paths = [b.accept_path for b in beats if b.accept_path]
        missing = [b.global_index for b in beats if not b.accept_path]
        index = segment.index

    if missing:
        return _handle_segment_error(
            segment_id, "", f"beats {missing} have no accepted take", True
        )

    dest = _layout.segment_accepted(project_id, index)
    try:
        ffmpeg.join(paths, dest, crossfade_ms=settings.crossfade_ms)
    except ffmpeg.FFmpegError as exc:
        return _handle_segment_error(segment_id, "", str(exc), True)

    with session_scope() as db:
        segment = db.get(Segment, segment_id)
        segment.output_path = dest
        segment.status = UnitStatus.COMPLETE
    advance_project.delay(project_id)
    return {"segment_id": segment_id, "output": dest}


# ------------------------------------------------------------------ assembly
@celery_app.task(name="app.tasks.assemble_chapter")
def assemble_chapter(chapter_id: str) -> dict[str, Any]:
    """Concat this chapter's segments as soon as the chapter finishes.

    Seams inside a chapter get a real audio crossfade; the colour grade is NOT
    applied here — it is applied once over the joined output at the end.
    """
    with session_scope() as db:
        chapter = db.get(Chapter, chapter_id)
        if chapter is None:
            return {"chapter_id": chapter_id, "skipped": True}
        project_id = chapter.project_id
        segments = db.execute(
            select(Segment)
            .where(Segment.chapter_id == chapter_id)
            .order_by(Segment.index)
        ).scalars().all()
        paths = [s.output_path for s in segments if s.output_path]
        job = create_job(
            db,
            step=Step.CHAPTER_ASSEMBLE,
            provider="ffmpeg",
            project_id=project_id,
            chapter_id=chapter_id,
            payload={"segments": paths, "crossfade_ms": settings.crossfade_ms},
        )
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        db.flush()
        job_id = job.id
        index = chapter.index

    dest = _layout.chapter_output(project_id, index)
    try:
        ffmpeg.join(paths, dest, crossfade_ms=settings.crossfade_ms)
        duration = ffmpeg.probe_duration(dest)
    except ffmpeg.FFmpegError as exc:
        with session_scope() as db:
            _fail_job(db, db.get(Job, job_id), exc.stderr or str(exc))
            chapter = db.get(Chapter, chapter_id)
            chapter.status = UnitStatus.FAILED
            chapter.error = str(exc)
            _project_failed(db, db.get(Project, project_id), f"chapter {index} assembly: {exc}")
        return {"chapter_id": chapter_id, "error": str(exc)}

    with session_scope() as db:
        chapter = db.get(Chapter, chapter_id)
        chapter.output_path = dest
        chapter.status = UnitStatus.COMPLETE
        chapter.completed_at = utcnow()
        # The checkpoint: a resumed build starts after this chapter.
        chapter.checkpoint = {
            **(chapter.checkpoint or {}),
            "assembled": True,
            "output_path": dest,
            "duration_seconds": duration,
            "segments": paths,
        }
        _finish_job(db, db.get(Job, job_id), output_path=dest)

    advance_project.delay(project_id)
    return {"chapter_id": chapter_id, "output": dest, "duration": duration}


@celery_app.task(name="app.tasks.assemble_final")
def assemble_final(project_id: str) -> dict[str, Any]:
    """Join the chapters, grade once, burn captions, done."""
    with session_scope() as db:
        project = db.get(Project, project_id)
        chapters = db.execute(
            select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.index)
        ).scalars().all()
        beats = db.execute(
            select(Beat).where(Beat.project_id == project_id).order_by(Beat.global_index)
        ).scalars().all()
        paths = [c.output_path for c in chapters if c.output_path]
        beat_rows = [
            {
                "start_seconds": b.start_seconds,
                "duration_seconds": b.duration_seconds,
                "narration": b.narration,
            }
            for b in beats
        ]
        job = create_job(
            db,
            step=Step.FINAL_ASSEMBLE,
            provider="ffmpeg",
            project_id=project_id,
            payload={"chapters": paths, "crossfade_ms": settings.crossfade_ms},
        )
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        db.flush()
        job_id = job.id
        burn = settings.burn_captions and bool((project.spec or {}).get("captions", True))
        music = (project.spec or {}).get("music_path")

    if not paths:
        with session_scope() as db:
            _fail_job(db, db.get(Job, job_id), "no chapter outputs to assemble")
            _project_failed(db, db.get(Project, project_id), "no chapter outputs to assemble")
        return {"project_id": project_id, "error": "nothing to assemble"}

    work = _layout.work(project_id)
    joined = os.path.join(work, "joined.mp4")
    graded = os.path.join(work, "graded.mp4")
    final = _layout.final_output(project_id)

    try:
        ffmpeg.join(paths, joined, crossfade_ms=settings.crossfade_ms)
        # Grade applied ONCE over the joined output, not per segment.
        current = ffmpeg.apply_grade(joined, graded)
        if music and os.path.exists(music):
            ducked = os.path.join(work, "ducked.mp4")
            current = ffmpeg.duck_music(current, music, ducked)
        if burn:
            srt = caption_tools.write_srt(
                os.path.join(work, "captions.srt"), caption_tools.beats_to_srt(beat_rows)
            )
            if os.path.getsize(srt):
                current = ffmpeg.burn_captions(current, srt, os.path.join(work, "captioned.mp4"))
        ffmpeg.copy_file(current, final)
        duration = ffmpeg.probe_duration(final)
    except ffmpeg.FFmpegError as exc:
        with session_scope() as db:
            _fail_job(db, db.get(Job, job_id), exc.stderr or str(exc))
            _project_failed(db, db.get(Project, project_id), f"final assembly: {exc}")
        return {"project_id": project_id, "error": str(exc)}

    with session_scope() as db:
        project = db.get(Project, project_id)
        project.output_path = final
        project.status = ProjectStatus.COMPLETE
        project.error = None
        _finish_job(db, db.get(Job, job_id), output_path=final)
        keep = {c.output_path for c in project.chapters if c.output_path} | {final}
        keep |= {s.output_path for s in project.segments if s.output_path}
    storage.prune_superseded_takes(_layout, project_id, keep)
    storage.prune_work_dir(_layout, project_id)
    return {"project_id": project_id, "output": final, "duration": duration}


# ------------------------------------------------------------- hook variants
def _opening_seconds(project: Project) -> float:
    """How long the opening beat is, so a hook test renders the real opening."""
    chapters = (project.plan or {}).get("chapters") or []
    beats = (chapters[0].get("beats") if chapters else None) or []
    return float(beats[0].get("duration_seconds", 3.0)) if beats else 3.0


@celery_app.task(name="app.tasks.render_hook_variant")
def render_hook_variant(variant_id: str) -> dict[str, Any]:
    """Render just the opening for one hook, so the pick is made from real
    output rather than from text."""
    registry = get_registry()
    with session_scope() as db:
        variant = db.get(HookVariant, variant_id)
        project = db.get(Project, variant.project_id)
        opening_seconds = min(settings.heygen_max_segment_seconds, max(3.0, _opening_seconds(project)))
        spec = SegmentSpec(
            segment_id=f"hook-{variant.id}",
            project_id=project.id,
            index=variant.index,
            narration=variant.text,
            duration_seconds=opening_seconds,
            title=f"{project.name} hook {variant.index + 1}",
            width=settings.heygen_dimension_width,
            height=settings.heygen_dimension_height,
            template_id=(project.spec or {}).get("template_id") or None,
            avatar_id=(project.spec or {}).get("avatar_id") or None,
            voice_id=(project.spec or {}).get("voice_id") or None,
            test=bool((project.spec or {}).get("test", settings.heygen_test)),
        )
        job = create_job(
            db,
            step=Step.HOOK_VARIANT,
            project_id=project.id,
            payload={"spec": spec.__dict__, "variant_id": variant_id},
        )
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        db.flush()
        job_id = job.id
        variant.status = UnitStatus.RUNNING
        variant.job_id = job_id
        dest = os.path.join(_layout.variants(project.id), f"hook_{variant.index:02d}.mp4")

    try:
        submission, provider = registry.run_with_failover(
            Step.HOOK_VARIANT, lambda p: p.submit(spec)
        )
    except ProviderError as exc:
        with session_scope() as db:
            _fail_job(db, db.get(Job, job_id), str(exc))
            variant = db.get(HookVariant, variant_id)
            variant.status = UnitStatus.FAILED
            variant.error = str(exc)
        return {"variant_id": variant_id, "error": str(exc)}

    with session_scope() as db:
        job = db.get(Job, job_id)
        job.provider = provider.name
        job.provider_job_id = submission.provider_job_id
        job.payload = {**job.payload, "request": submission.payload}
        job.response = submission.response
        job.status = JobStatus.POLLING

    poll_hook_variant.apply_async(args=[job_id, dest], countdown=settings.poll_seconds)
    return {"variant_id": variant_id, "job_id": job_id}


@celery_app.task(name="app.tasks.poll_hook_variant")
def poll_hook_variant(job_id: str, dest: str) -> dict[str, Any]:
    registry = get_registry()
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None or job.status in JobStatus.TERMINAL:
            return {"job_id": job_id, "skipped": True}
        variant_id = (job.payload or {}).get("variant_id")
        provider = registry.get(job.provider)
        provider_job_id = job.provider_job_id

    try:
        status = provider.poll(provider_job_id)
    except ProviderError as exc:
        poll_hook_variant.apply_async(args=[job_id, dest], countdown=settings.poll_seconds)
        return {"job_id": job_id, "transient": str(exc)}

    if status.state in {"pending", "processing"}:
        poll_hook_variant.apply_async(args=[job_id, dest], countdown=settings.poll_seconds)
        return {"job_id": job_id, "state": status.state}

    with session_scope() as db:
        job = db.get(Job, job_id)
        variant = db.get(HookVariant, variant_id)
        job.response = status.raw
        if status.state == "failed":
            _fail_job(db, job, status.error or "hook render failed")
            variant.status = UnitStatus.FAILED
            variant.error = status.error
            return {"job_id": job_id, "error": status.error}

    provider.download(status.url, dest)
    with session_scope() as db:
        job = db.get(Job, job_id)
        variant = db.get(HookVariant, variant_id)
        cost = provider.estimate_cost(3.0)
        variant.output_path = dest
        variant.rendered = True
        variant.status = UnitStatus.COMPLETE
        _finish_job(db, job, output_path=dest, cost=cost)
        record_cost(
            db,
            kind="hook_variant",
            amount_usd=cost,
            project_id=job.project_id,
            job_id=job_id,
            detail={"variant_id": variant_id},
        )
    return {"job_id": job_id, "output": dest}


# ------------------------------------------------------------------- upkeep
@celery_app.task(name="app.tasks.resume_sweep")
def resume_sweep() -> dict[str, Any]:
    """Crash recovery. Re-arm anything that was mid-flight and push every active
    project forward from its last completed chapter."""
    resumed, repolled, requeued = [], [], []
    stale_before = datetime.now(timezone.utc) - timedelta(seconds=settings.poll_seconds * 4)
    with session_scope() as db:
        if queue_is_paused(db):
            return {"paused": True}
        for project in db.execute(
            select(Project).where(Project.status.in_(sorted(ProjectStatus.ACTIVE)))
        ).scalars().all():
            resumed.append(project.id)

            # A worker that died between claiming a segment and submitting it
            # leaves the segment RUNNING with nothing in flight. Hand it back.
            for segment in db.execute(
                select(Segment).where(
                    Segment.project_id == project.id, Segment.status == UnitStatus.RUNNING
                )
            ).scalars().all():
                in_flight = db.execute(
                    select(Job.id).where(
                        Job.segment_id == segment.id,
                        Job.status.in_([JobStatus.RUNNING, JobStatus.POLLING]),
                    )
                ).first()
                if in_flight is None:
                    segment.status = UnitStatus.PENDING
                    requeued.append(segment.id)

        for job in db.execute(
            select(Job).where(Job.status == JobStatus.POLLING, Job.updated_at < stale_before)
        ).scalars().all():
            repolled.append((job.id, job.step))

    for project_id in resumed:
        advance_project.delay(project_id)
    for job_id, step in repolled:
        if step == Step.SEGMENT_RENDER:
            poll_segment.delay(job_id)
    return {"resumed": resumed, "repolled": [j for j, _ in repolled], "requeued": requeued}


@celery_app.task(name="app.tasks.reroll_beat")
def reroll_beat(beat_id: str) -> dict[str, Any]:
    """Re-render one beat and rebuild only its segment and chapter."""
    with session_scope() as db:
        beat = db.get(Beat, beat_id)
        beat.status = UnitStatus.PENDING
        beat.accept_path = None
        segment_id = beat.segment_id
    render_beat(beat_id)
    return assemble_segment_from_beats(segment_id)


@celery_app.task(name="app.tasks.rerender_chapter")
def rerender_chapter(chapter_id: str) -> dict[str, Any]:
    """Re-render one chapter. Never touches the others."""
    with session_scope() as db:
        chapter = db.get(Chapter, chapter_id)
        chapter.status = UnitStatus.PENDING
        chapter.output_path = None
        chapter.error = None
        chapter.checkpoint = {}
        project_id = chapter.project_id
        for segment in db.execute(
            select(Segment).where(Segment.chapter_id == chapter_id)
        ).scalars().all():
            segment.status = UnitStatus.PENDING
            segment.output_path = None
            segment.provider_video_id = None
            segment.error = None
            segment.attempts = 0
        project = db.get(Project, project_id)
        if project.status in {ProjectStatus.COMPLETE, ProjectStatus.FAILED}:
            project.status = ProjectStatus.RENDERING
            project.error = None
    advance_project.delay(project_id)
    return {"chapter_id": chapter_id, "requeued": True}
