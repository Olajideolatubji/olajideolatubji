"""Database model. The JOB row is the spine: every generation of any kind is a job."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list: JSON}


# --------------------------------------------------------------------- status
class JobStatus:
    PENDING = "pending"
    RUNNING = "running"
    POLLING = "polling"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TERMINAL = {SUCCEEDED, FAILED, CANCELLED}


class ProjectStatus:
    DRAFT = "draft"
    PLANNED = "planned"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    QUEUED = "queued"
    RENDERING = "rendering"
    ASSEMBLING = "assembling"
    PAUSED = "paused"
    COMPLETE = "complete"
    FAILED = "failed"
    CANCELLED = "cancelled"
    ACTIVE = {QUEUED, RENDERING, ASSEMBLING}


class UnitStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"
    SKIPPED = "skipped"


class Step:
    PLAN = "plan"
    TTS = "tts"
    SEGMENT_RENDER = "segment_render"
    BEAT_IMAGE = "beat_image"
    BEAT_VIDEO = "beat_video"
    CHAPTER_ASSEMBLE = "chapter_assemble"
    FINAL_ASSEMBLE = "final_assemble"
    GRADE = "grade"
    CAPTIONS = "captions"
    HOOK_VARIANT = "hook_variant"
    EXPORT = "export"


# -------------------------------------------------------------------- project
class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    tier: Mapped[str] = mapped_column(String(16), default="short")
    target_seconds: Mapped[float] = mapped_column(Float, default=15.0)
    render_mode: Mapped[str] = mapped_column(String(16), default="composition")
    status: Mapped[str] = mapped_column(String(32), default=ProjectStatus.DRAFT, index=True)

    # Free-form creative spec: concept, hook, script, voice, template overrides.
    spec: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # Frozen plan produced by the planner (chapters, beats, segments, seams).
    plan: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    validation: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    estimate: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    output_path: Mapped[Optional[str]] = mapped_column(Text)
    cost_actual: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[Optional[str]] = mapped_column(Text)

    batch_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("batches.id"), index=True)
    batch_index: Mapped[Optional[int]] = mapped_column(Integer)
    # A re-cut points back at the project it was cut from.
    source_project_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Chapter.index"
    )
    segments: Mapped[list["Segment"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Segment.index"
    )


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(300), default="")
    start_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(16), default=UnitStatus.PENDING, index=True)
    # Chapter-level checkpoint: a resumed build starts at the first chapter that
    # is not complete, never at the beginning.
    checkpoint: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_path: Mapped[Optional[str]] = mapped_column(Text)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[Optional[str]] = mapped_column(Text)
    # Pool of background plates / shots this chapter recomposes rather than
    # regenerating per beat.
    asset_pool: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    project: Mapped[Project] = relationship(back_populates="chapters")
    beats: Mapped[list["Beat"]] = relationship(
        back_populates="chapter", cascade="all, delete-orphan", order_by="Beat.index"
    )


class Segment(Base):
    """One HeyGen render. Never longer than HEYGEN_MAX_SEGMENT_SECONDS."""

    __tablename__ = "segments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id"), index=True)
    chapter_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("chapters.id"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    index_in_chapter: Mapped[int] = mapped_column(Integer, default=0)
    start_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    narration: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default=UnitStatus.PENDING, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(64))
    provider_video_id: Mapped[Optional[str]] = mapped_column(String(128))
    output_path: Mapped[Optional[str]] = mapped_column(Text)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="segments")


class Beat(Base):
    __tablename__ = "beats"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(32), index=True)
    chapter_id: Mapped[str] = mapped_column(String(32), ForeignKey("chapters.id"), index=True)
    segment_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("segments.id"), index=True)
    index: Mapped[int] = mapped_column(Integer)
    global_index: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str] = mapped_column(String(24), default="body")
    start_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    narration: Mapped[str] = mapped_column(Text, default="")
    visual: Mapped[str] = mapped_column(Text, default="")
    # Long tier: render once, loop under long narration.
    loopable: Mapped[bool] = mapped_column(Boolean, default=False)
    key_moment: Mapped[bool] = mapped_column(Boolean, default=False)
    expensive: Mapped[bool] = mapped_column(Boolean, default=False)
    # Long tier reuse: which plate from the chapter pool, and how it is framed.
    plate_ref: Mapped[Optional[str]] = mapped_column(String(64))
    framing: Mapped[Optional[str]] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default=UnitStatus.PENDING)
    tts_path: Mapped[Optional[str]] = mapped_column(Text)
    # beats render mode: an accepted take for this beat. Re-rolling one beat
    # never re-renders the others.
    accept_path: Mapped[Optional[str]] = mapped_column(Text)
    image_path: Mapped[Optional[str]] = mapped_column(Text)
    video_path: Mapped[Optional[str]] = mapped_column(Text)
    error: Mapped[Optional[str]] = mapped_column(Text)

    chapter: Mapped[Chapter] = relationship(back_populates="beats")


# ------------------------------------------------------------------------ job
class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    parent_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("jobs.id"), index=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    chapter_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    segment_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    beat_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    step: Mapped[str] = mapped_column(String(32), index=True)
    provider: Mapped[str] = mapped_column(String(64), default="")
    # The FULL payload we sent, so a video that lands can be diffed against one
    # that does not.
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    response: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default=JobStatus.PENDING, index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    provider_job_id: Mapped[Optional[str]] = mapped_column(String(128), index=True)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    output_path: Mapped[Optional[str]] = mapped_column(Text)
    # The real provider error text. Never swallowed, never rewritten.
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


Index("ix_jobs_project_step", Job.project_id, Job.step)


# ---------------------------------------------------------------------- batch
class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(24), default="shorts")
    status: Mapped[str] = mapped_column(String(16), default=UnitStatus.PENDING)
    spec: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HookVariant(Base):
    """8 hooks per concept; the top N get their opening rendered for real."""

    __tablename__ = "hook_variants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(32), index=True)
    index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    rank: Mapped[Optional[int]] = mapped_column(Integer)
    rendered: Mapped[bool] = mapped_column(Boolean, default=False)
    chosen: Mapped[bool] = mapped_column(Boolean, default=False)
    rejected: Mapped[bool] = mapped_column(Boolean, default=False)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    valid: Mapped[bool] = mapped_column(Boolean, default=True)
    validation: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    job_id: Mapped[Optional[str]] = mapped_column(String(32))
    output_path: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default=UnitStatus.PENDING)
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# --------------------------------------------------------------------- ledger
class CostEntry(Base):
    __tablename__ = "cost_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    segment_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    job_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    amount_usd: Mapped[float] = mapped_column(Float, default=0.0)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ExportItem(Base):
    __tablename__ = "export_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(32), index=True)
    platform: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    hashtags: Mapped[list] = mapped_column(JSON, default=list)
    file_path: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|published
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class Setting(Base):
    """Runtime switches the operator flips: queue pause, cap override."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
