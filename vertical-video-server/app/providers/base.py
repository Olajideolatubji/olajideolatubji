"""Provider abstraction.

Two kinds of backend:

  CompositionProvider  — hand over a spec for a whole segment, get one MP4 back
                         (HeyGen).
  ImageProvider /      — per-beat stills and image-to-video (ComfyUI).
  VideoProvider

RENDER_MODE picks the path. Both ship; composition is the default.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


class ProviderError(RuntimeError):
    """Carries the provider's own error text, verbatim. Nothing is swallowed."""

    def __init__(self, message: str, *, retryable: bool = True, raw: Any = None, status: int | None = None):
        super().__init__(message)
        self.retryable = retryable
        self.raw = raw
        self.status = status

    def as_dict(self) -> dict[str, Any]:
        return {
            "message": str(self),
            "retryable": self.retryable,
            "status": self.status,
            "raw": self.raw,
        }


@dataclass
class SegmentSpec:
    """Everything one composition render needs."""

    segment_id: str
    project_id: str
    index: int
    narration: str
    duration_seconds: float
    title: str = ""
    visual: str = ""
    width: int = 1080
    height: int = 1920
    template_id: str | None = None
    avatar_id: str | None = None
    voice_id: str | None = None
    background: str | None = None
    audio_path: str | None = None
    test: bool = True
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class BeatSpec:
    """Everything one beat needs on the ComfyUI path."""

    beat_id: str
    project_id: str
    chapter_index: int
    index: int
    prompt: str
    duration_seconds: float
    negative_prompt: str = ""
    # Character reference sheets are injected into every image call.
    references: list[str] = field(default_factory=list)
    plate_ref: str | None = None
    framing: str | None = None
    loopable: bool = False
    seed: int | None = None
    width: int = 1080
    height: int = 1920
    fps: int = 30
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class RemoteSubmission:
    provider_job_id: str
    payload: dict[str, Any]
    response: dict[str, Any] = field(default_factory=dict)
    estimated_cost: float = 0.0


@dataclass
class RemoteStatus:
    state: str  # pending | processing | completed | failed
    url: str | None = None
    error: str | None = None
    duration_seconds: float | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def done(self) -> bool:
        return self.state in {"completed", "failed"}


class Provider(abc.ABC):
    name: str = "provider"
    kind: str = "generic"

    def health(self) -> dict[str, Any]:
        return {"name": self.name, "kind": self.kind, "configured": True}


class CompositionProvider(Provider):
    kind = "composition"

    @abc.abstractmethod
    def submit(self, spec: SegmentSpec) -> RemoteSubmission:
        """Submit one segment. Returns immediately with a provider job id."""

    @abc.abstractmethod
    def poll(self, provider_job_id: str) -> RemoteStatus:
        """Ask for status. Callers must not poll faster than the provider allows."""

    @abc.abstractmethod
    def download(self, url: str, dest: str) -> str:
        """Fetch the finished MP4 to a local path."""

    def estimate_cost(self, seconds: float) -> float:
        return 0.0


class ImageProvider(Provider):
    kind = "image"

    @abc.abstractmethod
    def generate_image(self, spec: BeatSpec, dest: str) -> str: ...


class VideoProvider(Provider):
    kind = "video"

    @abc.abstractmethod
    def image_to_video(self, image_path: str, spec: BeatSpec, dest: str) -> str: ...


class TTSProvider(Provider):
    kind = "tts"

    @abc.abstractmethod
    def synthesize(self, text: str, dest: str, voice_id: str | None = None) -> str:
        """Synthesise ONE beat. Never a whole chapter — long single calls drift
        in pace and fail expensively."""

    def estimate_cost(self, characters: int) -> float:
        return 0.0
