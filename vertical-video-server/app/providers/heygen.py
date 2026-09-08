"""HeyGen composition provider.

REST, not the MCP connector. Auth is an X-Api-Key header. Async by nature:
submit, get a video_id back, poll for status — never faster than every 20s.

TEMPLATE mode is primary: a template built once in HeyGen's dashboard with
named placeholders, filled per segment. AGENT mode is the fallback.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from ..config import Settings, settings as default_settings
from . import heygen_urls as urls
from .base import CompositionProvider, ProviderError, RemoteStatus, RemoteSubmission, SegmentSpec

log = logging.getLogger(__name__)

_STATE_MAP = {
    "pending": "pending",
    "waiting": "pending",
    "processing": "processing",
    "completed": "completed",
    "complete": "completed",
    "success": "completed",
    "failed": "failed",
    "error": "failed",
}


class HeyGenProvider(CompositionProvider):
    name = "heygen"

    def __init__(self, settings: Settings | None = None, client: httpx.Client | None = None):
        self.settings = settings or default_settings
        self._client = client

    # ------------------------------------------------------------------ http
    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self.settings.heygen_request_timeout)
        return self._client

    def _headers(self) -> dict[str, str]:
        if not self.settings.heygen_api_key:
            raise ProviderError("HEYGEN_API_KEY is not set", retryable=False)
        return {
            urls.API_KEY_HEADER: self.settings.heygen_api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _request(self, method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = self.client.request(method, url, headers=self._headers(), **kwargs)
        except httpx.HTTPError as exc:  # network-level: always worth a retry
            raise ProviderError(f"heygen transport error: {exc}", retryable=True) from exc

        text = response.text
        if response.status_code >= 400:
            raise ProviderError(
                f"heygen {method} {url} -> HTTP {response.status_code}: {text}",
                retryable=response.status_code in (408, 425, 429) or response.status_code >= 500,
                raw=text,
                status=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise ProviderError(f"heygen returned non-JSON: {text[:2000]}", retryable=False, raw=text) from exc

        # HeyGen puts failures in an `error` object with a 200 status.
        error = body.get("error")
        if error:
            raise ProviderError(f"heygen error: {error}", retryable=False, raw=body)
        return body

    # -------------------------------------------------------------- payloads
    def build_template_payload(self, spec: SegmentSpec) -> dict[str, Any]:
        s = self.settings
        variables: dict[str, Any] = {
            s.heygen_placeholder_script: {
                "name": s.heygen_placeholder_script,
                "type": "text",
                "properties": {"content": spec.narration},
            }
        }
        if spec.title:
            variables[s.heygen_placeholder_title] = {
                "name": s.heygen_placeholder_title,
                "type": "text",
                "properties": {"content": spec.title},
            }
        if spec.background:
            variables[s.heygen_placeholder_background] = {
                "name": s.heygen_placeholder_background,
                "type": "image",
                "properties": {"url": spec.background, "fit": "cover"},
            }
        for key, value in (spec.extra.get("variables") or {}).items():
            variables[key] = value

        return {
            "title": spec.title or f"{spec.project_id}-seg{spec.index:04d}",
            "caption": False,  # captions are burned in locally by ffmpeg
            "dimension": {"width": spec.width, "height": spec.height},
            "test": spec.test,
            "variables": variables,
        }

    def build_agent_payload(self, spec: SegmentSpec) -> dict[str, Any]:
        s = self.settings
        avatar_id = spec.avatar_id or s.heygen_avatar_id
        voice_id = spec.voice_id or s.heygen_voice_id
        if not avatar_id:
            raise ProviderError("agent mode needs HEYGEN_AVATAR_ID", retryable=False)
        if not voice_id:
            raise ProviderError("agent mode needs HEYGEN_VOICE_ID", retryable=False)
        return {
            "title": spec.title or f"{spec.project_id}-seg{spec.index:04d}",
            "caption": False,
            "dimension": {"width": spec.width, "height": spec.height},
            "test": spec.test,
            "video_inputs": [
                {
                    "character": {
                        "type": "avatar",
                        "avatar_id": avatar_id,
                        "avatar_style": spec.extra.get("avatar_style", "normal"),
                    },
                    "voice": {"type": "text", "input_text": spec.narration, "voice_id": voice_id},
                    "background": {
                        "type": "color",
                        "value": spec.background or s.heygen_background_color,
                    },
                }
            ],
        }

    # --------------------------------------------------------------- actions
    def submit(self, spec: SegmentSpec) -> RemoteSubmission:
        mode = spec.extra.get("mode") or self.settings.heygen_mode
        if mode == "template":
            template_id = spec.template_id or self.settings.heygen_template_id
            if not template_id:
                raise ProviderError(
                    "template mode needs HEYGEN_TEMPLATE_ID (or a per-project template_id)",
                    retryable=False,
                )
            url = urls.template_generate(template_id)
            payload = self.build_template_payload(spec)
        elif mode == "agent":
            url = urls.video_generate()
            payload = self.build_agent_payload(spec)
        else:
            raise ProviderError(f"unknown heygen mode {mode!r}", retryable=False)

        body = self._request("POST", url, json=payload)
        data = body.get("data") or {}
        video_id = data.get("video_id") or data.get("id")
        if not video_id:
            raise ProviderError(f"heygen accepted the job but returned no video_id: {body}", raw=body)

        return RemoteSubmission(
            provider_job_id=str(video_id),
            payload={"url": url, "mode": mode, "body": payload},
            response=body,
            estimated_cost=self.estimate_cost(spec.duration_seconds, test=spec.test),
        )

    def poll(self, provider_job_id: str) -> RemoteStatus:
        body = self._request("GET", urls.video_status(provider_job_id))
        data = body.get("data") or {}
        raw_status = str(data.get("status", "")).lower()
        state = _STATE_MAP.get(raw_status, "processing" if raw_status else "pending")
        error = data.get("error")
        if state == "failed" and not error:
            error = f"heygen reported status={raw_status!r} with no error body: {body}"
        return RemoteStatus(
            state=state,
            url=data.get("video_url") or data.get("video_url_caption"),
            error=None if error is None else str(error),
            duration_seconds=data.get("duration"),
            raw=body,
        )

    def download(self, url: str, dest: str) -> str:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = f"{dest}.part"
        try:
            with httpx.stream("GET", url, timeout=self.settings.heygen_request_timeout, follow_redirects=True) as r:
                if r.status_code >= 400:
                    raise ProviderError(
                        f"downloading {url} -> HTTP {r.status_code}", status=r.status_code
                    )
                with open(tmp, "wb") as fh:
                    for chunk in r.iter_bytes(1024 * 256):
                        fh.write(chunk)
        except httpx.HTTPError as exc:
            raise ProviderError(f"heygen download failed: {exc}", retryable=True) from exc
        os.replace(tmp, dest)
        return dest

    # ------------------------------------------------------------------ misc
    def estimate_cost(self, seconds: float, test: bool | None = None) -> float:
        """Test renders are watermarked and do not consume credits."""
        is_test = self.settings.heygen_test if test is None else test
        if is_test:
            return 0.0
        return round(
            (seconds / 60.0) * self.settings.cost_per_render_minute_usd
            + self.settings.cost_per_segment_usd,
            4,
        )

    def remaining_quota(self) -> dict[str, Any]:
        return self._request("GET", urls.remaining_quota())

    def health(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "kind": self.kind,
            "configured": bool(self.settings.heygen_api_key),
            "mode": self.settings.heygen_mode,
            "template_id": self.settings.heygen_template_id or None,
            "test": self.settings.heygen_test,
            "max_segment_seconds": self.settings.heygen_max_segment_seconds,
            "poll_seconds": self.settings.poll_seconds,
        }
