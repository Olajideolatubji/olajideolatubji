"""ffmpeg is a first-class part of this system, not an afterthought.

It does all stitching, grading, ducking and caption burn-in locally. The two
rules that shape this module:

* Segments are rendered independently and will not match perfectly, so every
  seam gets a real audio crossfade (200-400ms) with a matching video crossfade
  of the same length, which keeps audio and video in sync.
* A 3-hour build never goes through one giant ffmpeg call: joins are batched,
  and the colour grade is applied once over the joined output rather than per
  segment.
"""

from __future__ import annotations

import json
import logging
import os
import shlex
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Iterable, Sequence

from ..config import Settings, settings as default_settings

log = logging.getLogger(__name__)


class FFmpegError(RuntimeError):
    def __init__(self, message: str, *, cmd: Sequence[str] | None = None, stderr: str = ""):
        super().__init__(message)
        self.cmd = list(cmd or [])
        self.stderr = stderr

    @property
    def command_line(self) -> str:
        return " ".join(shlex.quote(c) for c in self.cmd)


@dataclass
class MediaInfo:
    path: str
    duration: float
    width: int | None
    height: int | None
    has_audio: bool
    fps: float | None


def run(cmd: Sequence[str], *, timeout: int | None = None) -> str:
    log.debug("ffmpeg: %s", " ".join(shlex.quote(c) for c in cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise FFmpegError(
            f"{os.path.basename(cmd[0])} exited {proc.returncode}: {proc.stderr[-4000:]}",
            cmd=cmd,
            stderr=proc.stderr,
        )
    return proc.stdout


# ----------------------------------------------------------------- inspection
def probe(path: str, settings: Settings | None = None) -> MediaInfo:
    s = settings or default_settings
    out = run(
        [
            s.ffprobe_bin, "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", path,
        ]
    )
    data = json.loads(out or "{}")
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = next((st for st in streams if st.get("codec_type") == "video"), None)
    audio = next((st for st in streams if st.get("codec_type") == "audio"), None)
    duration = float(fmt.get("duration") or (video or {}).get("duration") or 0.0)
    fps = None
    if video and video.get("avg_frame_rate", "0/0") not in ("0/0", None):
        num, _, den = video["avg_frame_rate"].partition("/")
        try:
            fps = float(num) / float(den or 1)
        except (ValueError, ZeroDivisionError):
            fps = None
    return MediaInfo(
        path=path,
        duration=duration,
        width=(video or {}).get("width"),
        height=(video or {}).get("height"),
        has_audio=audio is not None,
        fps=fps,
    )


def probe_duration(path: str, settings: Settings | None = None) -> float:
    return probe(path, settings).duration


# ------------------------------------------------------------- normalisation
def _encode_args(s: Settings) -> list[str]:
    return [
        "-c:v", "libx264", "-preset", s.video_preset, "-crf", str(s.video_crf),
        "-pix_fmt", "yuv420p", "-r", str(s.video_fps),
        "-c:a", "aac", "-b:a", s.audio_bitrate, "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart",
    ]


def _video_encode_args(s: Settings) -> list[str]:
    return [
        "-c:v", "libx264", "-preset", s.video_preset, "-crf", str(s.video_crf),
        "-pix_fmt", "yuv420p", "-r", str(s.video_fps), "-an", "-movflags", "+faststart",
    ]


def normalize(src: str, dest: str, settings: Settings | None = None) -> str:
    """Force one canonical vertical format so joins and crossfades are legal.

    Anything the renderer hands back gets scaled and padded to WIDTHxHEIGHT at
    a fixed fps, with a silent track added if it arrived without audio.
    """
    s = settings or default_settings
    info = probe(src, s)
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    vf = (
        f"scale={s.video_width}:{s.video_height}:force_original_aspect_ratio=decrease,"
        f"pad={s.video_width}:{s.video_height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"setsar=1,fps={s.video_fps}"
    )
    cmd = [s.ffmpeg_bin, "-y", "-i", src]
    if not info.has_audio:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest"]
    cmd += ["-vf", vf, *_encode_args(s), dest]
    run(cmd)
    return dest


# --------------------------------------------------------------------- joins
def build_crossfade_filter(durations: Sequence[float], crossfade_seconds: float) -> str:
    """The filter_complex for a crossfaded join of N inputs.

    Video uses xfade and audio uses acrossfade with the same duration, so both
    streams shorten by exactly the same amount at every seam and stay in sync.
    """
    n = len(durations)
    if n < 2:
        raise ValueError("crossfade needs at least two inputs")
    parts: list[str] = []
    v_label, a_label = "0:v", "0:a"
    acc = durations[0]
    for i in range(1, n):
        offset = max(0.0, acc - crossfade_seconds)
        out_v, out_a = f"v{i}", f"a{i}"
        parts.append(
            f"[{v_label}][{i}:v]xfade=transition=fade:"
            f"duration={crossfade_seconds:.3f}:offset={offset:.3f}[{out_v}]"
        )
        parts.append(
            f"[{a_label}][{i}:a]acrossfade=d={crossfade_seconds:.3f}:c1=tri:c2=tri[{out_a}]"
        )
        v_label, a_label = out_v, out_a
        acc = acc + durations[i] - crossfade_seconds
    parts.append(f"[{v_label}]null[vout]")
    parts.append(f"[{a_label}]anull[aout]")
    return ";".join(parts)


def crossfade_join(
    paths: Sequence[str],
    dest: str,
    *,
    crossfade_ms: int | None = None,
    settings: Settings | None = None,
) -> str:
    """One ffmpeg call joining a bounded number of inputs with real crossfades."""
    s = settings or default_settings
    ms = s.crossfade_ms if crossfade_ms is None else crossfade_ms
    x = ms / 1000.0
    paths = list(paths)
    if not paths:
        raise ValueError("nothing to join")
    if len(paths) == 1:
        return copy_file(paths[0], dest)

    durations = [probe_duration(p, s) for p in paths]
    shortest = min(durations)
    # A crossfade can never be longer than the clips it joins.
    x = min(x, max(0.05, shortest / 3.0))

    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    cmd = [s.ffmpeg_bin, "-y"]
    for p in paths:
        cmd += ["-i", p]
    cmd += [
        "-filter_complex", build_crossfade_filter(durations, x),
        "-map", "[vout]", "-map", "[aout]",
        *_encode_args(s), dest,
    ]
    run(cmd)
    return dest


def join(
    paths: Sequence[str],
    dest: str,
    *,
    crossfade_ms: int | None = None,
    settings: Settings | None = None,
    workdir: str | None = None,
) -> str:
    """Join any number of clips, batching so no single ffmpeg call sees more
    than FFMPEG_MAX_JOIN_INPUTS inputs. This is what keeps a 3-hour assembly
    off one enormous command line."""
    s = settings or default_settings
    paths = list(paths)
    if not paths:
        raise ValueError("nothing to join")
    if len(paths) == 1:
        return copy_file(paths[0], dest)

    batch = max(2, s.ffmpeg_max_join_inputs)
    if len(paths) <= batch:
        return crossfade_join(paths, dest, crossfade_ms=crossfade_ms, settings=s)

    own_tmp = workdir is None
    tmp_root = workdir or tempfile.mkdtemp(prefix="vvs-join-", dir=os.path.dirname(dest) or None)
    os.makedirs(tmp_root, exist_ok=True)
    try:
        # Fold the list a level at a time. Each ffmpeg call sees at most `batch`
        # inputs, and every level writes into its own directory so a group can
        # never be both an input and an output.
        current = list(paths)
        level = 0
        while len(current) > batch:
            level_dir = os.path.join(tmp_root, f"level{level}")
            os.makedirs(level_dir, exist_ok=True)
            folded: list[str] = []
            for i in range(0, len(current), batch):
                chunk = current[i : i + batch]
                if len(chunk) == 1:
                    folded.append(chunk[0])
                    continue
                part = os.path.join(level_dir, f"group_{i // batch:04d}.mp4")
                crossfade_join(chunk, part, crossfade_ms=crossfade_ms, settings=s)
                folded.append(part)
            current, level = folded, level + 1
        return crossfade_join(current, dest, crossfade_ms=crossfade_ms, settings=s)
    finally:
        if own_tmp:
            shutil.rmtree(tmp_root, ignore_errors=True)


def concat_copy(paths: Sequence[str], dest: str, settings: Settings | None = None) -> str:
    """Hard-cut concat with no re-encode. Only for clips that already match."""
    s = settings or default_settings
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
        for p in paths:
            fh.write(f"file {shlex.quote(os.path.abspath(p))}\n")
        listfile = fh.name
    try:
        run([s.ffmpeg_bin, "-y", "-f", "concat", "-safe", "0", "-i", listfile, "-c", "copy", dest])
    finally:
        os.unlink(listfile)
    return dest


def copy_file(src: str, dest: str) -> str:
    if os.path.abspath(src) == os.path.abspath(dest):
        return dest
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    with open(src, "rb") as a, open(dest, "wb") as b:
        while chunk := a.read(1024 * 1024):
            b.write(chunk)
    return dest


# ------------------------------------------------------------------ finishing
def apply_grade(src: str, dest: str, *, grade: str | None = None, settings: Settings | None = None) -> str:
    """Applied ONCE over the joined output — never per segment, or the seams
    get worse instead of better."""
    s = settings or default_settings
    filter_str = grade if grade is not None else s.color_grade_filter
    if not filter_str:
        return copy_file(src, dest)
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    run([s.ffmpeg_bin, "-y", "-i", src, "-vf", filter_str, *_encode_args(s), dest])
    return dest


def burn_captions(src: str, srt_path: str, dest: str, settings: Settings | None = None) -> str:
    s = settings or default_settings
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    escaped = srt_path.replace("\\", "\\\\").replace(":", r"\:").replace("'", r"\'")
    vf = f"subtitles='{escaped}':force_style='{s.caption_style}'"
    run([s.ffmpeg_bin, "-y", "-i", src, "-vf", vf, *_encode_args(s), dest])
    return dest


def duck_music(
    video: str,
    music: str,
    dest: str,
    *,
    music_gain_db: float = -14.0,
    settings: Settings | None = None,
) -> str:
    """Sidechain the music under the narration instead of hoping the mix works."""
    s = settings or default_settings
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    filter_complex = (
        f"[1:a]volume={music_gain_db}dB,aloop=loop=-1:size=2e9[music];"
        f"[0:a]asplit=2[voice][key];"
        f"[music][key]sidechaincompress=threshold={s.music_duck_threshold}:"
        f"ratio={s.music_duck_ratio}:attack=20:release=350[ducked];"
        f"[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    )
    run(
        [
            s.ffmpeg_bin, "-y", "-i", video, "-i", music,
            "-filter_complex", filter_complex,
            "-map", "0:v", "-map", "[aout]", "-shortest",
            *_encode_args(s), dest,
        ]
    )
    return dest


def loop_to_length(src: str, dest: str, seconds: float, settings: Settings | None = None) -> str:
    """Loopable beats: render once, loop under long narration."""
    s = settings or default_settings
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    run(
        [
            s.ffmpeg_bin, "-y", "-stream_loop", "-1", "-i", src,
            "-t", f"{seconds:.3f}", *_video_encode_args(s), dest,
        ]
    )
    return dest


def still_to_clip(image: str, dest: str, seconds: float, settings: Settings | None = None) -> str:
    s = settings or default_settings
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    vf = (
        f"scale={s.video_width}:{s.video_height}:force_original_aspect_ratio=increase,"
        f"crop={s.video_width}:{s.video_height},setsar=1,fps={s.video_fps}"
    )
    run(
        [
            s.ffmpeg_bin, "-y", "-loop", "1", "-i", image,
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", f"{seconds:.3f}", "-vf", vf, *_encode_args(s), "-shortest", dest,
        ]
    )
    return dest


def mux_audio(video: str, audio: str, dest: str, settings: Settings | None = None) -> str:
    """Attach a beat's narration to its clip, padding video if the read is longer."""
    s = settings or default_settings
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    run(
        [
            s.ffmpeg_bin, "-y", "-i", video, "-i", audio,
            "-filter_complex", "[0:v]tpad=stop_mode=clone:stop_duration=3600[v]",
            "-map", "[v]", "-map", "1:a", "-shortest", *_encode_args(s), dest,
        ]
    )
    return dest


def file_size_mb(paths: Iterable[str]) -> float:
    total = 0
    for p in paths:
        try:
            total += os.path.getsize(p)
        except OSError:
            pass
    return round(total / (1024 * 1024), 3)
