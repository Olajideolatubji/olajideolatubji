"""Narration. Synthesised per beat, never per chapter — long single calls drift
in pace and fail expensively."""

from __future__ import annotations

import os
import subprocess
from typing import Any

import httpx

from ..config import Settings, settings as default_settings
from .base import ProviderError, TTSProvider

ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"


def elevenlabs_tts_url(voice_id: str) -> str:
    return f"{ELEVENLABS_BASE}/text-to-speech/{voice_id}"


class ElevenLabsTTS(TTSProvider):
    name = "elevenlabs"

    def __init__(self, settings: Settings | None = None, client: httpx.Client | None = None):
        self.settings = settings or default_settings
        self._client = client or httpx.Client(timeout=120)

    def synthesize(self, text: str, dest: str, voice_id: str | None = None) -> str:
        if not self.settings.elevenlabs_api_key:
            raise ProviderError("ELEVENLABS_API_KEY is not set", retryable=False)
        voice = voice_id or self.settings.elevenlabs_voice_id
        if not voice:
            raise ProviderError("ELEVENLABS_VOICE_ID is not set", retryable=False)
        if len(text) > self.settings.tts_max_chars_per_call:
            raise ProviderError(
                f"beat narration is {len(text)} characters, over the "
                f"{self.settings.tts_max_chars_per_call} per-call limit — split the beat",
                retryable=False,
            )
        try:
            response = self._client.post(
                elevenlabs_tts_url(voice),
                headers={"xi-api-key": self.settings.elevenlabs_api_key, "Accept": "audio/mpeg"},
                json={"text": text, "model_id": self.settings.elevenlabs_model},
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"elevenlabs transport error: {exc}", retryable=True) from exc
        if response.status_code >= 400:
            raise ProviderError(
                f"elevenlabs -> HTTP {response.status_code}: {response.text}",
                retryable=response.status_code in (429,) or response.status_code >= 500,
                raw=response.text,
                status=response.status_code,
            )
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(response.content)
        return dest

    def estimate_cost(self, characters: int) -> float:
        return round((characters / 1000.0) * self.settings.cost_per_tts_1k_chars_usd, 4)


class RendererTTS(TTSProvider):
    """The composition renderer speaks the script itself; no separate call."""

    name = "renderer"

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or default_settings

    def synthesize(self, text: str, dest: str, voice_id: str | None = None) -> str:
        raise ProviderError(
            "TTS_PROVIDER=heygen: narration is spoken by the renderer, so there is no "
            "separate TTS call. Set TTS_PROVIDER=elevenlabs for the beats path.",
            retryable=False,
        )

    def estimate_cost(self, characters: int) -> float:
        return 0.0  # bundled into the render


class SilentTTS(TTSProvider):
    """No narration provider configured: lay down silence so assembly still works."""

    name = "silence"

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or default_settings

    def synthesize(self, text: str, dest: str, voice_id: str | None = None) -> str:
        seconds = max(0.5, len(text.split()) / 2.6)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        cmd = [
            self.settings.ffmpeg_bin, "-y", "-f", "lavfi",
            "-i", f"anullsrc=r=44100:cl=stereo:d={seconds:.2f}",
            "-c:a", "aac", "-b:a", self.settings.audio_bitrate, dest,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise ProviderError(f"silence generation failed: {proc.stderr[-2000:]}", retryable=False)
        return dest

    def estimate_cost(self, characters: int) -> float:
        return 0.0


def build_tts(settings: Settings | None = None) -> TTSProvider:
    s = settings or default_settings
    if s.tts_provider == "elevenlabs":
        return ElevenLabsTTS(s)
    if s.tts_provider == "heygen":
        return RendererTTS(s)
    return SilentTTS(s)


def tts_health(provider: TTSProvider) -> dict[str, Any]:
    return provider.health()
