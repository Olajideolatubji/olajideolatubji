"""The second path: RENDER_MODE=beats against a local ComfyUI.

The ComfyUI HTTP calls are faked; everything else — the per-beat accept files,
the TTS-per-beat rule, the join into a segment, the re-roll isolation — is the
production path.
"""

import os
import shutil
import subprocess

import pytest

from app.celery_app import celery_app
from app.db import init_db, session_scope
from app.media import ffmpeg
from app.models import Beat, Project, ProjectStatus, Step, UnitStatus
from app.providers import get_registry
from app.providers.base import ImageProvider, TTSProvider, VideoProvider
from app.service import can_start, create_project

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")

SPEC = {
    "beats": [
        {"narration": "Stop scrolling right now", "visual": "a lighthouse at dusk"},
        {"narration": "Most teams ship this backwards", "visual": "a whiteboard"},
        {"narration": "Flip the order and it works", "visual": "a green build"},
        {"narration": "That is the trick", "visual": "the logo"},
    ]
}


class FakeComfy(ImageProvider, VideoProvider):
    name = "fake-comfy"

    def __init__(self, tmp):
        self.tmp = tmp
        self.image_calls: list[dict] = []
        self.video_calls: list[str] = []

    def generate_image(self, spec, dest):
        self.image_calls.append(
            {"beat": spec.beat_id, "prompt": spec.prompt, "references": list(spec.references)}
        )
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=purple:s=180x320", "-frames:v", "1", dest],
            check=True, capture_output=True,
        )
        return dest

    def image_to_video(self, image_path, spec, dest):
        self.video_calls.append(spec.beat_id)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loop", "1", "-i", image_path, "-t", f"{spec.duration_seconds:.2f}",
             "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p",
             "-r", "15", "-vf", "scale=180:320", dest],
            check=True, capture_output=True,
        )
        return dest


class FakeTTS(TTSProvider):
    name = "fake-tts"

    def __init__(self):
        self.calls: list[str] = []

    def synthesize(self, text, dest, voice_id=None):
        self.calls.append(text)
        seconds = max(0.6, len(text.split()) / 2.6)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=300:duration={seconds:.2f}",
             "-c:a", "libmp3lame", dest],
            check=True, capture_output=True,
        )
        return dest


class _DummyLock:
    def acquire(self, blocking=False):
        return True

    def release(self):
        return None


class _DummyRedis:
    def lock(self, *_a, **_k):
        return _DummyLock()


@pytest.fixture
def beats_stack(tmp_path, monkeypatch):
    import app.tasks as tasks

    init_db()
    monkeypatch.setattr(tasks, "_redis", _DummyRedis())
    monkeypatch.setattr(celery_app.conf, "task_always_eager", True)
    monkeypatch.setattr(celery_app.conf, "task_eager_propagates", True)
    for key, value in {"video_width": 180, "video_height": 320, "video_fps": 15,
                       "video_preset": "ultrafast", "video_crf": 34}.items():
        monkeypatch.setattr(tasks.settings, key, value, raising=False)
        monkeypatch.setattr(ffmpeg.default_settings, key, value, raising=False)

    comfy, tts = FakeComfy(str(tmp_path)), FakeTTS()
    registry = get_registry()
    registry.register("fake-comfy", comfy)
    registry.register("fake-tts", tts)
    monkeypatch.setitem(registry._chains, Step.BEAT_IMAGE, ["fake-comfy"])
    monkeypatch.setitem(registry._chains, Step.BEAT_VIDEO, ["fake-comfy"])
    monkeypatch.setitem(registry._chains, Step.TTS, ["fake-tts"])
    return tasks, comfy, tts


def test_beats_mode_renders_every_beat_and_joins_them(beats_stack):
    tasks, comfy, tts = beats_stack
    with session_scope() as db:
        project = create_project(db, name="beats short", target_seconds=15, spec=SPEC,
                                 render_mode="beats")
        project.status = ProjectStatus.QUEUED
        project_id = project.id

    tasks.advance_project(project_id)

    with session_scope() as db:
        project = db.get(Project, project_id)
        assert project.status == ProjectStatus.COMPLETE, project.error
        assert os.path.exists(project.output_path)
        beats = db.query(Beat).filter_by(project_id=project_id).order_by(Beat.global_index).all()
        assert [b.status for b in beats] == [UnitStatus.COMPLETE] * 4
        # Each beat keeps its own accepted take.
        for beat in beats:
            assert beat.accept_path.endswith(f"{beat.id}/accepted.mp4")
            assert os.path.exists(beat.accept_path)
            assert os.path.exists(beat.accept_path.replace(".mp4", ".json"))

    assert len(comfy.image_calls) == 4
    assert len(comfy.video_calls) == 4
    # Narration is synthesised per beat, never per chapter.
    assert tts.calls == [b["narration"] for b in SPEC["beats"]]


def test_rerolling_one_beat_leaves_the_others_untouched(beats_stack):
    tasks, comfy, _tts = beats_stack
    with session_scope() as db:
        project = create_project(db, name="beats reroll", target_seconds=15, spec=SPEC,
                                 render_mode="beats")
        project.status = ProjectStatus.QUEUED
        project_id = project.id

    tasks.advance_project(project_id)

    with session_scope() as db:
        beats = db.query(Beat).filter_by(project_id=project_id).order_by(Beat.global_index).all()
        target = beats[2]
        target_id = target.id
        others = {b.id: os.path.getmtime(b.accept_path) for b in beats if b.id != target_id}

    calls_before = len(comfy.video_calls)
    tasks.reroll_beat(target_id)

    assert comfy.video_calls[calls_before:] == [target_id], "only the re-rolled beat re-rendered"
    with session_scope() as db:
        for beat_id, mtime in others.items():
            assert os.path.getmtime(db.get(Beat, beat_id).accept_path) == mtime


def test_beats_mode_refuses_to_start_without_a_narration_provider(beats_stack, monkeypatch):
    """TTS_PROVIDER=heygen means the renderer speaks — and on this path there is
    no renderer. Say so before spending anything."""
    import app.service as service

    monkeypatch.setattr(service.default_settings, "tts_provider", "heygen", raising=False)
    with session_scope() as db:
        project = create_project(db, name="beats no tts", target_seconds=15, spec=SPEC,
                                 render_mode="beats")
        ok, reason = can_start(db, project)
    assert not ok
    assert "TTS_PROVIDER=elevenlabs" in reason


def test_character_references_reach_every_image_call(beats_stack, tmp_path):
    tasks, comfy, _tts = beats_stack
    sheet = tmp_path / "sheet.png"
    sheet.write_bytes(b"not really a png")
    with session_scope() as db:
        project = create_project(
            db,
            name="beats refs",
            target_seconds=15,
            spec={**SPEC, "references": [str(sheet)]},
            render_mode="beats",
        )
        project.status = ProjectStatus.QUEUED
        project_id = project.id

    tasks.advance_project(project_id)
    assert all(str(sheet) in call["references"] for call in comfy.image_calls[-4:])
