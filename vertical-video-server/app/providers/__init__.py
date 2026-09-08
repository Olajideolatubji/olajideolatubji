"""Provider registry: which backend serves which step, and what it fails over to."""

from __future__ import annotations

import json
import logging
from dataclasses import replace as _dc_replace  # noqa: F401  (kept for symmetry)
from typing import Any, Callable, TypeVar

from ..config import Settings, settings as default_settings
from ..models import Step
from .base import (  # noqa: F401
    BeatSpec,
    CompositionProvider,
    ImageProvider,
    Provider,
    ProviderError,
    RemoteStatus,
    RemoteSubmission,
    SegmentSpec,
    TTSProvider,
    VideoProvider,
)
from .comfyui import ComfyUIProvider
from .heygen import HeyGenProvider
from .tts import ElevenLabsTTS, RendererTTS, SilentTTS, build_tts

log = logging.getLogger(__name__)

T = TypeVar("T")


def _agent_settings(s: Settings) -> Settings:
    """A HeyGen client pinned to AGENT mode — the fallback when a template
    render will not go through."""
    return s.model_copy(update={"heygen_mode": "agent"})


class Registry:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or default_settings
        self._named: dict[str, Provider] = {}
        self._chains: dict[str, list[str]] = {}
        self._build()

    # ----------------------------------------------------------------- build
    def _build(self) -> None:
        s = self.settings
        self._named = {
            "heygen": HeyGenProvider(s),
            "heygen_agent": HeyGenProvider(_agent_settings(s)),
            "comfyui": ComfyUIProvider(s),
            "elevenlabs": ElevenLabsTTS(s),
            "renderer_tts": RendererTTS(s),
            "silence": SilentTTS(s),
        }
        tts_name = {"elevenlabs": "elevenlabs", "heygen": "renderer_tts"}.get(s.tts_provider, "silence")
        self._chains = {
            Step.SEGMENT_RENDER: ["heygen", "heygen_agent"],
            Step.BEAT_IMAGE: ["comfyui"],
            Step.BEAT_VIDEO: ["comfyui"],
            Step.TTS: [tts_name] + (["silence"] if tts_name != "silence" else []),
            Step.HOOK_VARIANT: ["heygen", "heygen_agent"],
        }
        for step, names in self._parse_overrides(s.provider_chains).items():
            self._chains[step] = names

    @staticmethod
    def _parse_overrides(raw: str) -> dict[str, list[str]]:
        if not raw.strip():
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"PROVIDER_CHAINS is not valid JSON: {exc}") from exc
        return {str(k): [str(n) for n in v] for k, v in data.items()}

    # ------------------------------------------------------------------ use
    def register(self, name: str, provider: Provider) -> None:
        self._named[name] = provider

    def get(self, name: str) -> Provider:
        try:
            return self._named[name]
        except KeyError:
            raise ValueError(f"no provider named {name!r}; have {sorted(self._named)}") from None

    def chain(self, step: str) -> list[Provider]:
        names = self._chains.get(step, [])
        return [self._named[n] for n in names if n in self._named]

    def primary(self, step: str) -> Provider:
        chain = self.chain(step)
        if not chain:
            raise ValueError(f"no provider registered for step {step!r}")
        return chain[0]

    def composition(self) -> CompositionProvider:
        provider = self.primary(Step.SEGMENT_RENDER)
        assert isinstance(provider, CompositionProvider)
        return provider

    def tts(self) -> TTSProvider:
        provider = self.primary(Step.TTS)
        assert isinstance(provider, TTSProvider)
        return provider

    def health(self) -> dict[str, Any]:
        return {
            "render_mode": self.settings.render_mode,
            "chains": {step: names for step, names in self._chains.items()},
            "providers": {name: p.health() for name, p in self._named.items()},
        }

    # ------------------------------------------------------------- failover
    def run_with_failover(
        self, step: str, action: Callable[[Provider], T], *, attempt: int = 0
    ) -> tuple[T, Provider]:
        """Try the chain in order. `attempt` skips providers already burned by
        earlier retries so a repeated failure moves down the chain instead of
        hammering the same backend."""
        chain = self.chain(step)
        if not chain:
            raise ValueError(f"no provider registered for step {step!r}")
        start = min(attempt, len(chain) - 1)
        errors: list[str] = []
        for provider in chain[start:]:
            try:
                return action(provider), provider
            except ProviderError as exc:
                errors.append(f"{provider.name}: {exc}")
                log.warning("provider %s failed on step %s: %s", provider.name, step, exc)
                if not exc.retryable and provider is chain[-1]:
                    break
        raise ProviderError(
            "all providers failed for step " + step + " -> " + " | ".join(errors),
            retryable=True,
        )


_registry: Registry | None = None


def get_registry() -> Registry:
    global _registry
    if _registry is None:
        _registry = Registry()
    return _registry


def reset_registry() -> None:
    global _registry
    _registry = None


__all__ = [
    "Registry",
    "get_registry",
    "reset_registry",
    "build_tts",
    "HeyGenProvider",
    "ComfyUIProvider",
    "ProviderError",
    "SegmentSpec",
    "BeatSpec",
    "RemoteStatus",
    "RemoteSubmission",
    "CompositionProvider",
    "ImageProvider",
    "VideoProvider",
    "TTSProvider",
]
