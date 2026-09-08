"""The second path: a local ComfyUI doing per-beat stills and image-to-video.

Not in use yet — RENDER_MODE=beats switches to it and nothing else changes.
Character reference sheets are injected into every image call so the same
character survives across beats, and each beat keeps its own accepted take so
re-rolling one beat never re-renders the others.

Workflows are ordinary ComfyUI API-format JSON graphs with `{{token}}`
placeholders anywhere a string, int or float lives. Recognised tokens:

    {{prompt}} {{negative}} {{seed}} {{width}} {{height}} {{frames}} {{fps}}
    {{input_image}} {{reference_image}} {{reference_images}} {{beat_id}}
"""

from __future__ import annotations

import copy
import json
import os
import random
import re
import time
from typing import Any

import httpx

from ..config import Settings, settings as default_settings
from .base import BeatSpec, ImageProvider, ProviderError, VideoProvider

_TOKEN_RE = re.compile(r"\{\{(\w+)\}\}")


def _substitute(node: Any, values: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        return {k: _substitute(v, values) for k, v in node.items()}
    if isinstance(node, list):
        return [_substitute(v, values) for v in node]
    if isinstance(node, str):
        match = _TOKEN_RE.fullmatch(node.strip())
        if match:  # whole-value token keeps its native type
            return values.get(match.group(1), node)
        return _TOKEN_RE.sub(lambda m: str(values.get(m.group(1), m.group(0))), node)
    return node


class ComfyUIProvider(ImageProvider, VideoProvider):
    name = "comfyui"
    kind = "image+video"

    def __init__(self, settings: Settings | None = None, client: httpx.Client | None = None):
        self.settings = settings or default_settings
        self._client = client
        self.client_id = "vertical-video-server"

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self.settings.comfyui_timeout_seconds)
        return self._client

    # ----------------------------------------------------------- workflow io
    def load_workflow(self, path: str) -> dict[str, Any]:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except OSError as exc:
            raise ProviderError(f"comfyui workflow {path} unreadable: {exc}", retryable=False) from exc
        except json.JSONDecodeError as exc:
            raise ProviderError(f"comfyui workflow {path} is not valid JSON: {exc}", retryable=False) from exc

    def references_for(self, spec: BeatSpec) -> list[str]:
        """Character reference sheets, injected into every image call."""
        refs = list(spec.references)
        root = self.settings.comfyui_reference_dir
        project_dir = os.path.join(root, spec.project_id)
        for directory in (project_dir, root):
            if os.path.isdir(directory):
                refs.extend(
                    os.path.join(directory, f)
                    for f in sorted(os.listdir(directory))
                    if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
                )
                break
        # De-duplicate, keep order.
        seen: set[str] = set()
        return [r for r in refs if not (r in seen or seen.add(r))]

    def build_values(self, spec: BeatSpec, *, input_image: str | None = None) -> dict[str, Any]:
        refs = self.references_for(spec)
        framing = f", {spec.framing} framing" if spec.framing else ""
        plate = f", plate {spec.plate_ref}" if spec.plate_ref else ""
        return {
            "prompt": f"{spec.prompt}{framing}{plate}",
            "negative": spec.negative_prompt,
            "seed": spec.seed if spec.seed is not None else random.randint(1, 2**31 - 1),
            "width": spec.width,
            "height": spec.height,
            "fps": spec.fps,
            "frames": max(1, int(round(spec.duration_seconds * spec.fps))),
            "beat_id": spec.beat_id,
            "input_image": input_image or "",
            "reference_image": refs[0] if refs else "",
            "reference_images": refs,
        }

    # ---------------------------------------------------------------- calls
    def _post_prompt(self, graph: dict[str, Any]) -> str:
        try:
            response = self.client.post(
                f"{self.settings.comfyui_url.rstrip('/')}/prompt",
                json={"prompt": graph, "client_id": self.client_id},
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"comfyui transport error: {exc}", retryable=True) from exc
        if response.status_code >= 400:
            raise ProviderError(
                f"comfyui /prompt -> HTTP {response.status_code}: {response.text}",
                retryable=response.status_code >= 500,
                raw=response.text,
                status=response.status_code,
            )
        prompt_id = response.json().get("prompt_id")
        if not prompt_id:
            raise ProviderError(f"comfyui returned no prompt_id: {response.text}", raw=response.text)
        return str(prompt_id)

    def _await_outputs(self, prompt_id: str) -> dict[str, Any]:
        base = self.settings.comfyui_url.rstrip("/")
        deadline = time.monotonic() + self.settings.comfyui_timeout_seconds
        while time.monotonic() < deadline:
            try:
                response = self.client.get(f"{base}/history/{prompt_id}")
            except httpx.HTTPError as exc:
                raise ProviderError(f"comfyui transport error: {exc}", retryable=True) from exc
            if response.status_code < 400:
                history = response.json().get(prompt_id)
                if history:
                    status = (history.get("status") or {})
                    if status.get("status_str") == "error":
                        raise ProviderError(
                            f"comfyui workflow failed: {json.dumps(status)[:4000]}",
                            retryable=False,
                            raw=status,
                        )
                    if history.get("outputs"):
                        return history["outputs"]
            time.sleep(self.settings.comfyui_poll_seconds)
        raise ProviderError(
            f"comfyui prompt {prompt_id} did not finish within "
            f"{self.settings.comfyui_timeout_seconds}s",
            retryable=True,
        )

    def _download_first_output(self, outputs: dict[str, Any], dest: str) -> str:
        base = self.settings.comfyui_url.rstrip("/")
        for node_output in outputs.values():
            for key in ("gifs", "videos", "images"):
                for item in node_output.get(key, []) or []:
                    params = {
                        "filename": item.get("filename"),
                        "subfolder": item.get("subfolder", ""),
                        "type": item.get("type", "output"),
                    }
                    response = self.client.get(f"{base}/view", params=params)
                    if response.status_code >= 400:
                        continue
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, "wb") as fh:
                        fh.write(response.content)
                    return dest
        raise ProviderError(f"comfyui produced no downloadable output: {json.dumps(outputs)[:2000]}")

    # ------------------------------------------------------------ interface
    def generate_image(self, spec: BeatSpec, dest: str) -> str:
        graph = self.load_workflow(self.settings.comfyui_image_workflow)
        values = self.build_values(spec)
        prompt_id = self._post_prompt(_substitute(copy.deepcopy(graph), values))
        return self._download_first_output(self._await_outputs(prompt_id), dest)

    def image_to_video(self, image_path: str, spec: BeatSpec, dest: str) -> str:
        graph = self.load_workflow(self.settings.comfyui_video_workflow)
        values = self.build_values(spec, input_image=image_path)
        if spec.loopable:
            # Render one short loop and let ffmpeg repeat it under the narration.
            values["frames"] = min(values["frames"], spec.fps * 4)
        prompt_id = self._post_prompt(_substitute(copy.deepcopy(graph), values))
        return self._download_first_output(self._await_outputs(prompt_id), dest)

    def health(self) -> dict[str, Any]:
        try:
            response = self.client.get(f"{self.settings.comfyui_url.rstrip('/')}/system_stats", timeout=5)
            reachable = response.status_code < 400
        except httpx.HTTPError:
            reachable = False
        return {
            "name": self.name,
            "kind": self.kind,
            "configured": bool(self.settings.comfyui_url),
            "reachable": reachable,
            "image_workflow": self.settings.comfyui_image_workflow,
            "video_workflow": self.settings.comfyui_video_workflow,
        }
