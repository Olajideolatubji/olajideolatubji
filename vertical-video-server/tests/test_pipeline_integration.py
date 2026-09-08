"""A whole short, end to end: plan -> submit -> poll -> stitch -> grade -> caption.

The renderer is faked (it writes a real MP4 with ffmpeg instead of calling
HeyGen) but everything else is the production path: the job table, the driver
task, the ffmpeg assembly and the cost ledger.
"""

import os
import shutil
import subprocess

import pytest

from app.celery_app import celery_app
from app.db import init_db, session_scope
from app.media import ffmpeg
from app.models import Chapter, Job, JobStatus, Project, ProjectStatus, Segment, Step, UnitStatus
from app.providers import get_registry
from app.providers.base import CompositionProvider, RemoteStatus, RemoteSubmission
from app.service import create_project

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


class FakeRenderer(CompositionProvider):
    """Stands in for HeyGen: accepts a spec, hands back an MP4 of the right length."""

    name = "fake"

    def __init__(self, tmp_path):
        self.tmp = tmp_path
        self.submitted: list[dict] = []
        self.polls = 0

    def submit(self, spec):
        self.submitted.append({"narration": spec.narration, "seconds": spec.duration_seconds})
        return RemoteSubmission(
            provider_job_id=f"vid-{len(self.submitted)}",
            payload={"body": {"variables": {"script": spec.narration}}},
            response={"data": {"video_id": f"vid-{len(self.submitted)}"}},
        )

    def poll(self, provider_job_id):
        self.polls += 1
        index = int(provider_job_id.split("-")[1]) - 1
        seconds = self.submitted[index]["seconds"]
        path = os.path.join(self.tmp, f"{provider_job_id}.mp4")
        if not os.path.exists(path):
            subprocess.run(
                [
                    "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=teal:s=180x320:r=15:d={seconds}",
                    "-f", "lavfi", "-i", f"sine=frequency=330:duration={seconds}",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", path,
                ],
                check=True,
                capture_output=True,
            )
        return RemoteStatus(state="completed", url=path, duration_seconds=seconds, raw={"data": {"status": "completed"}})

    def download(self, url, dest):
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(url, dest)
        return dest

    def estimate_cost(self, seconds, test=None):
        return round(seconds * 0.01, 4)


class _DummyLock:
    def acquire(self, blocking=False):
        return True

    def release(self):
        return None


class _DummyRedis:
    def lock(self, *_a, **_k):
        return _DummyLock()


@pytest.fixture
def rendered(tmp_path, monkeypatch):
    """Run the real task graph synchronously with a faked renderer."""
    import app.tasks as tasks

    init_db()
    monkeypatch.setattr(tasks, "_redis", _DummyRedis())
    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    monkeypatch.setattr(celery_app.conf, "task_eager_propagates", True)
    # Keep the encodes small; the pipeline is what is under test.
    for key, value in {"video_width": 180, "video_height": 320, "video_fps": 15, "video_preset": "ultrafast", "video_crf": 34}.items():
        monkeypatch.setattr(tasks.settings, key, value, raising=False)
        monkeypatch.setattr(ffmpeg.default_settings, key, value, raising=False)

    renderer = FakeRenderer(str(tmp_path))
    registry = get_registry()
    registry.register("fake", renderer)
    monkeypatch.setitem(registry._chains, Step.SEGMENT_RENDER, ["fake"])
    return tasks, renderer


def test_short_renders_end_to_end(rendered):
    tasks, renderer = rendered
    with session_scope() as db:
        project = create_project(
            db,
            name="integration short",
            target_seconds=15,
            spec={
                "beats": [
                    {"narration": "Stop scrolling right now"},
                    {"narration": "Most teams ship this backwards"},
                    {"narration": "Flip the order and it works"},
                    {"narration": "That is the trick"},
                ],
                "test": True,
            },
        )
        project.status = ProjectStatus.QUEUED
        project_id = project.id

    tasks.advance_project(project_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        assert project.status == ProjectStatus.COMPLETE, project.error
        assert os.path.exists(project.output_path)
        # One segment for a short: no stitching needed, but the grade and the
        # caption burn still run over the joined output.
        assert len(renderer.submitted) == 1
        segments = db.query(Segment).filter_by(project_id=project_id).all()
        assert [s.status for s in segments] == [UnitStatus.COMPLETE]
        chapters = db.query(Chapter).filter_by(project_id=project_id).all()
        assert chapters[0].checkpoint["assembled"] is True
        steps = {j.step: j.status for j in db.query(Job).filter_by(project_id=project_id).all()}
        assert steps[Step.SEGMENT_RENDER] == JobStatus.SUCCEEDED
        assert steps[Step.CHAPTER_ASSEMBLE] == JobStatus.SUCCEEDED
        assert steps[Step.FINAL_ASSEMBLE] == JobStatus.SUCCEEDED
        # The payload we sent is kept for diffing later.
        render_job = db.query(Job).filter_by(project_id=project_id, step=Step.SEGMENT_RENDER).one()
        assert render_job.payload["request"]["body"]["variables"]["script"]

    assert ffmpeg.probe_duration(project.output_path) == pytest.approx(15.0, abs=1.0)


def test_multi_segment_video_is_stitched_with_seams(rendered):
    tasks, renderer = rendered
    with session_scope() as db:
        project = create_project(
            db,
            name="integration chaptered",
            target_seconds=240,
            tier="mid",
            spec={
                "chapters": [
                    {"title": "one", "beats": [{"narration": "Short hook"}, {"duration_seconds": 10}]},
                    {"title": "two", "beats": [{"duration_seconds": 10}, {"duration_seconds": 10}]},
                ]
            },
        )
        project.status = ProjectStatus.QUEUED
        project_id = project.id
        planned = project.plan["counts"]["segments"]

    tasks.advance_project(project_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        assert project.status == ProjectStatus.COMPLETE, project.error
        chapters = db.query(Chapter).filter_by(project_id=project_id).order_by(Chapter.index).all()
        # Every chapter was concatenated as it finished, then the chapters joined.
        assert all(c.status == UnitStatus.COMPLETE and os.path.exists(c.output_path) for c in chapters)
        assert len(renderer.submitted) == planned
        assert project.cost_actual > 0

    total = sum(c.duration_seconds for c in chapters)
    crossfades = (planned - 1) * (tasks.settings.crossfade_ms / 1000.0)
    assert ffmpeg.probe_duration(project.output_path) == pytest.approx(total - crossfades, abs=1.5)


def test_resume_picks_up_after_the_last_completed_chapter(rendered, tmp_path):
    """A crash mid-build must not re-render what is already done."""
    tasks, renderer = rendered
    with session_scope() as db:
        project = create_project(
            db,
            name="resumed",
            target_seconds=240,
            tier="mid",
            spec={
                "chapters": [
                    {"title": "done", "beats": [{"narration": "Short hook"}, {"duration_seconds": 10}]},
                    {"title": "todo", "beats": [{"duration_seconds": 10}, {"duration_seconds": 10}]},
                ]
            },
        )
        project.status = ProjectStatus.RENDERING
        project_id = project.id

        first = db.query(Chapter).filter_by(project_id=project_id, index=0).one()
        # Pretend chapter 0 finished before the crash, checkpoint and all.
        done_file = str(tmp_path / "chapter0.mp4")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=180x320:r=15:d=2",
             "-f", "lavfi", "-i", "sine=frequency=220:duration=2",
             "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-shortest", done_file],
            check=True, capture_output=True,
        )
        first.status = UnitStatus.COMPLETE
        first.output_path = done_file
        first.checkpoint = {"assembled": True, "assembly_dispatched": True}
        for segment in db.query(Segment).filter_by(chapter_id=first.id).all():
            segment.status = UnitStatus.COMPLETE
            segment.output_path = done_file
        remaining = (
            db.query(Segment)
            .filter(Segment.project_id == project_id, Segment.chapter_id != first.id)
            .count()
        )

    tasks.advance_project(project_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        assert project.status == ProjectStatus.COMPLETE, project.error
        # Only the unfinished chapter was submitted to the renderer.
        assert len(renderer.submitted) == remaining


def test_rerendering_one_chapter_leaves_the_others_alone(rendered):
    tasks, renderer = rendered
    with session_scope() as db:
        project = create_project(
            db,
            name="rerender",
            target_seconds=240,
            tier="mid",
            spec={
                "chapters": [
                    {"title": "one", "beats": [{"narration": "Short hook"}, {"duration_seconds": 10}]},
                    {"title": "two", "beats": [{"duration_seconds": 10}, {"duration_seconds": 10}]},
                ]
            },
        )
        project.status = ProjectStatus.QUEUED
        project_id = project.id

    tasks.advance_project(project_id)
    first_pass = len(renderer.submitted)

    with session_scope() as db:
        second = db.query(Chapter).filter_by(project_id=project_id, index=1).one()
        second_id = second.id
        first_output = db.query(Chapter).filter_by(project_id=project_id, index=0).one().output_path
        first_mtime = os.path.getmtime(first_output)
        rerendered_segments = db.query(Segment).filter_by(chapter_id=second_id).count()

    tasks.rerender_chapter(second_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        assert project.status == ProjectStatus.COMPLETE, project.error
    assert len(renderer.submitted) == first_pass + rerendered_segments
    assert os.path.getmtime(first_output) == first_mtime, "chapter 0 was rebuilt"


def test_a_failed_render_stops_the_project_with_the_provider_text(rendered, monkeypatch):
    tasks, renderer = rendered

    def boom(spec):
        from app.providers.base import ProviderError

        raise ProviderError("heygen error: duration exceeds plan limit", retryable=False)

    monkeypatch.setattr(renderer, "submit", boom)
    monkeypatch.setattr(tasks.settings, "max_retries", 0, raising=False)

    with session_scope() as db:
        project = create_project(
            db,
            name="doomed",
            target_seconds=15,
            spec={"beats": [{"narration": "Stop now"}, {"narration": "b"}, {"narration": "c"}, {"narration": "d"}]},
        )
        project.status = ProjectStatus.QUEUED
        project_id = project.id

    tasks.advance_project(project_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        assert project.status == ProjectStatus.FAILED
        # The provider's own words, not a sanitised summary.
        assert "duration exceeds plan limit" in project.error
        job = db.query(Job).filter_by(project_id=project_id, step=Step.SEGMENT_RENDER).one()
        assert job.status == JobStatus.FAILED
        assert "duration exceeds plan limit" in job.error
