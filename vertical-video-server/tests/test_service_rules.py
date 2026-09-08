"""Guard rails around spending, pausing and crash recovery."""

import pytest

from app.db import init_db, pause_queue, resume_queue, session_scope
from app.models import Job, JobStatus, Project, ProjectStatus, Segment, Step, UnitStatus
from app.service import can_start, create_project, replan_project


class _DummyLock:
    def acquire(self, blocking=False):
        return True

    def release(self):
        return None


class _DummyRedis:
    def lock(self, *_a, **_k):
        return _DummyLock()


@pytest.fixture
def tasks(monkeypatch):
    import app.tasks as tasks_module

    init_db()
    monkeypatch.setattr(tasks_module, "_redis", _DummyRedis())
    return tasks_module


@pytest.fixture
def sweep_tasks(tasks, monkeypatch):
    """resume_sweep dispatches follow-up work; stub the broker hop out."""

    class _Stub:
        def __init__(self):
            self.calls = []

        def delay(self, *args):
            self.calls.append(args)

    monkeypatch.setattr(tasks, "advance_project", _Stub())
    monkeypatch.setattr(tasks, "poll_segment", _Stub())
    return tasks


def _long_project(db, name="long"):
    return create_project(db, name=name, target_seconds=25 * 60, spec={})


def test_long_tier_will_not_start_until_it_is_confirmed(tasks):
    with session_scope() as db:
        project = _long_project(db, "needs confirming")
        assert project.status == ProjectStatus.AWAITING_CONFIRMATION
        ok, reason = can_start(db, project)
        assert not ok and "confirmation" in reason

        project.confirmed_at = __import__("app.models", fromlist=["utcnow"]).utcnow()
        project.status = ProjectStatus.PLANNED
        ok, _ = can_start(db, project)
        assert ok


def test_replanning_voids_an_earlier_confirmation(tasks):
    from app.models import utcnow

    with session_scope() as db:
        project = _long_project(db, "replanned")
        project.confirmed_at = utcnow()
        project.status = ProjectStatus.PLANNED

        project.target_seconds = 45 * 60
        replan_project(db, project)

        assert project.confirmed_at is None
        assert project.status == ProjectStatus.AWAITING_CONFIRMATION
        ok, reason = can_start(db, project)
        assert not ok and "confirmation" in reason


def test_a_paused_queue_leaves_the_project_where_it_is(tasks):
    with session_scope() as db:
        project = create_project(db, name="paused queue", target_seconds=15,
                                 spec={"script": "Stop now. It works. Try it. Done."})
        project.status = ProjectStatus.RENDERING
        project_id = project.id
        pause_queue(db, "cap reached")

    result = tasks.advance_project(project_id)
    assert result["queue"] == "paused"

    with session_scope() as db:
        # Still RENDERING, so the resume sweep picks it up when the queue frees.
        assert db.get(Project, project_id).status == ProjectStatus.RENDERING
        resume_queue(db)


def test_an_operator_pause_is_not_undone_by_an_advance(tasks):
    with session_scope() as db:
        project = create_project(db, name="operator pause", target_seconds=15,
                                 spec={"script": "Stop now. It works. Try it. Done."})
        project.status = ProjectStatus.PAUSED
        project_id = project.id

    assert tasks.advance_project(project_id)["idle"] is True
    with session_scope() as db:
        assert db.get(Project, project_id).status == ProjectStatus.PAUSED


def test_resume_sweep_requeues_a_segment_stranded_by_a_dead_worker(sweep_tasks):
    with session_scope() as db:
        project = create_project(db, name="stranded", target_seconds=15,
                                 spec={"script": "Stop now. It works. Try it. Done."})
        project.status = ProjectStatus.RENDERING
        project_id = project.id
        segment = db.query(Segment).filter_by(project_id=project_id).one()
        # Claimed, then the worker died before it could submit anything.
        segment.status = UnitStatus.RUNNING
        segment_id = segment.id

    result = sweep_tasks.resume_sweep()
    assert segment_id in result["requeued"]

    with session_scope() as db:
        assert db.get(Segment, segment_id).status == UnitStatus.PENDING


def test_resume_sweep_leaves_a_segment_with_a_live_job_alone(sweep_tasks):
    with session_scope() as db:
        project = create_project(db, name="in flight", target_seconds=15,
                                 spec={"script": "Stop now. It works. Try it. Done."})
        project.status = ProjectStatus.RENDERING
        project_id = project.id
        segment = db.query(Segment).filter_by(project_id=project_id).one()
        segment.status = UnitStatus.RUNNING
        segment_id = segment.id
        db.add(
            Job(
                project_id=project_id,
                segment_id=segment_id,
                step=Step.SEGMENT_RENDER,
                provider="heygen",
                status=JobStatus.POLLING,
                provider_job_id="vid-live",
            )
        )

    result = sweep_tasks.resume_sweep()
    assert segment_id not in result["requeued"]
    with session_scope() as db:
        assert db.get(Segment, segment_id).status == UnitStatus.RUNNING
