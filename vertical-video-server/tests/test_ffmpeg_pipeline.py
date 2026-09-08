"""Exercises the real ffmpeg pipeline. Skipped when ffmpeg is not installed."""

import os
import shutil
import subprocess

import pytest

from app.config import Settings
from app.media import ffmpeg
from app.media.captions import beats_to_srt, write_srt

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")

# Small and fast: the point is the filter graph, not the encode quality.
SETTINGS = Settings(video_width=180, video_height=320, video_fps=15, video_preset="ultrafast", video_crf=32)


def make_clip(path: str, seconds: float, colour: str = "red") -> str:
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            f"color=c={colour}:s=180x320:r=15:d={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "32", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-shortest", path,
        ],
        check=True,
        capture_output=True,
    )
    return path


def test_probe_reads_duration_and_streams(tmp_path):
    clip = make_clip(str(tmp_path / "a.mp4"), 2.0)
    info = ffmpeg.probe(clip, SETTINGS)
    assert info.duration == pytest.approx(2.0, abs=0.2)
    assert (info.width, info.height) == (180, 320)
    assert info.has_audio is True


def test_crossfade_join_shortens_by_exactly_one_crossfade_per_seam(tmp_path):
    clips = [make_clip(str(tmp_path / f"c{i}.mp4"), 2.0, colour) for i, colour in enumerate(["red", "green", "blue"])]
    out = str(tmp_path / "joined.mp4")
    ffmpeg.crossfade_join(clips, out, crossfade_ms=300, settings=SETTINGS)
    # 3 clips of 2s with two 300ms seams
    assert ffmpeg.probe_duration(out, SETTINGS) == pytest.approx(6.0 - 0.6, abs=0.25)
    assert ffmpeg.probe(out, SETTINGS).has_audio is True


def test_large_join_is_batched_and_never_one_giant_call(tmp_path):
    settings = SETTINGS.model_copy(update={"ffmpeg_max_join_inputs": 2})
    clips = [make_clip(str(tmp_path / f"b{i}.mp4"), 1.5) for i in range(5)]
    out = str(tmp_path / "batched.mp4")

    calls: list[int] = []
    original = ffmpeg.run

    def counting_run(cmd, **kwargs):
        calls.append(sum(1 for c in cmd if c == "-i"))
        return original(cmd, **kwargs)

    ffmpeg.run = counting_run
    try:
        ffmpeg.join(clips, out, crossfade_ms=200, settings=settings)
    finally:
        ffmpeg.run = original

    assert max(calls) <= 2, "no ffmpeg call may exceed FFMPEG_MAX_JOIN_INPUTS inputs"
    assert ffmpeg.probe_duration(out, SETTINGS) == pytest.approx(5 * 1.5 - 4 * 0.2, abs=0.4)


def test_normalise_pads_to_vertical_and_adds_silence(tmp_path):
    src = str(tmp_path / "wide.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=15:d=1",
         "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-an", src],
        check=True, capture_output=True,
    )
    out = ffmpeg.normalize(src, str(tmp_path / "norm.mp4"), SETTINGS)
    info = ffmpeg.probe(out, SETTINGS)
    assert (info.width, info.height) == (180, 320)
    assert info.has_audio is True


def test_grade_and_caption_burn_in(tmp_path):
    clip = make_clip(str(tmp_path / "g.mp4"), 2.0)
    graded = ffmpeg.apply_grade(clip, str(tmp_path / "graded.mp4"), settings=SETTINGS)
    assert os.path.getsize(graded) > 0

    srt = write_srt(
        str(tmp_path / "cap.srt"),
        beats_to_srt([{"start_seconds": 0.0, "duration_seconds": 2.0, "narration": "Stop scrolling"}]),
    )
    burned = ffmpeg.burn_captions(graded, srt, str(tmp_path / "burned.mp4"), SETTINGS)
    assert ffmpeg.probe_duration(burned, SETTINGS) == pytest.approx(2.0, abs=0.3)


def test_loop_to_length_fills_a_long_beat(tmp_path):
    clip = make_clip(str(tmp_path / "loop.mp4"), 1.0)
    out = ffmpeg.loop_to_length(clip, str(tmp_path / "looped.mp4"), 4.0, SETTINGS)
    assert ffmpeg.probe_duration(out, SETTINGS) == pytest.approx(4.0, abs=0.3)


def test_ffmpeg_errors_carry_the_command_and_stderr(tmp_path):
    with pytest.raises(ffmpeg.FFmpegError) as exc:
        ffmpeg.probe(str(tmp_path / "missing.mp4"), SETTINGS)
    assert "missing.mp4" in exc.value.command_line
    assert exc.value.stderr
