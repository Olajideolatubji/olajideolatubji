"""Celery wiring. Nothing synchronous ever happens in the request cycle."""

from __future__ import annotations

from celery import Celery
from celery.schedules import schedule

from .config import settings

celery_app = Celery(
    "vvs",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_track_started=True,
    result_expires=60 * 60 * 24 * 7,
    broker_connection_retry_on_startup=True,
    timezone="UTC",
    beat_schedule={
        # A 3-hour build has to survive a crash and a restart. This sweep walks
        # every active project and pushes it forward from its last checkpoint.
        "resume-sweep": {
            "task": "app.tasks.resume_sweep",
            "schedule": schedule(run_every=settings.resume_sweep_seconds),
        }
    },
)
