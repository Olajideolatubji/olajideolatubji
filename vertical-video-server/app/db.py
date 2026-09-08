"""Engine + session plumbing shared by the API and the workers."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from .config import settings
from .models import Base, Setting

_engine_kwargs: dict[str, Any] = {"pool_pre_ping": True, "future": True}
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs.update(pool_size=10, max_overflow=20)

engine = create_engine(settings.database_url, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def init_db() -> None:
    Base.metadata.create_all(engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------- kv settings
def get_setting(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(Setting, key)
    if row is None:
        return default
    return row.value.get("value", default) if isinstance(row.value, dict) else default


def set_setting(db: Session, key: str, value: Any) -> None:
    row = db.get(Setting, key)
    if row is None:
        row = Setting(key=key, value={"value": value})
        db.add(row)
    else:
        row.value = {"value": value}
    db.flush()


QUEUE_PAUSED = "queue_paused"


def queue_is_paused(db: Session) -> bool:
    return bool(get_setting(db, QUEUE_PAUSED, False))


def pause_queue(db: Session, reason: str = "") -> None:
    set_setting(db, QUEUE_PAUSED, True)
    set_setting(db, "queue_paused_reason", reason)


def resume_queue(db: Session) -> None:
    set_setting(db, QUEUE_PAUSED, False)
    set_setting(db, "queue_paused_reason", "")


__all__ = [
    "engine",
    "SessionLocal",
    "init_db",
    "session_scope",
    "get_db",
    "get_setting",
    "set_setting",
    "queue_is_paused",
    "pause_queue",
    "resume_queue",
    "select",
]
