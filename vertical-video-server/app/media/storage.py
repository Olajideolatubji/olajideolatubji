"""Where files live, and what gets thrown away.

Superseded takes are pruned automatically. The accepted output and the full
payload history are what survive.
"""

from __future__ import annotations

import json
import os
import shutil
import time
from dataclasses import dataclass
from typing import Any

from ..config import Settings, settings as default_settings


@dataclass
class Layout:
    root: str

    def project(self, project_id: str) -> str:
        return os.path.join(self.root, "projects", project_id)

    def _sub(self, project_id: str, name: str) -> str:
        path = os.path.join(self.project(project_id), name)
        os.makedirs(path, exist_ok=True)
        return path

    def segments(self, project_id: str) -> str:
        return self._sub(project_id, "segments")

    def chapters(self, project_id: str) -> str:
        return self._sub(project_id, "chapters")

    def beats(self, project_id: str) -> str:
        return self._sub(project_id, "beats")

    def tts(self, project_id: str) -> str:
        return self._sub(project_id, "tts")

    def takes(self, project_id: str) -> str:
        return self._sub(project_id, "takes")

    def work(self, project_id: str) -> str:
        return self._sub(project_id, "work")

    def final(self, project_id: str) -> str:
        return self._sub(project_id, "final")

    def variants(self, project_id: str) -> str:
        return self._sub(project_id, "variants")

    # -------------------------------------------------------------- naming
    def segment_take(self, project_id: str, segment_index: int, attempt: int) -> str:
        return os.path.join(
            self.takes(project_id), f"segment_{segment_index:04d}_take{attempt:02d}.mp4"
        )

    def segment_accepted(self, project_id: str, segment_index: int) -> str:
        return os.path.join(self.segments(project_id), f"segment_{segment_index:04d}.mp4")

    def chapter_output(self, project_id: str, chapter_index: int) -> str:
        return os.path.join(self.chapters(project_id), f"chapter_{chapter_index:04d}.mp4")

    def beat_dir(self, project_id: str, beat_id: str) -> str:
        path = os.path.join(self.beats(project_id), beat_id)
        os.makedirs(path, exist_ok=True)
        return path

    def final_output(self, project_id: str, name: str = "final.mp4") -> str:
        return os.path.join(self.final(project_id), name)


def get_layout(settings: Settings | None = None) -> Layout:
    s = settings or default_settings
    return Layout(root=s.storage_root)


# ---------------------------------------------------------------- accepting
def accept_beat(layout: Layout, project_id: str, beat_id: str, take_path: str, meta: dict[str, Any]) -> str:
    """Per-beat accept file, so re-rolling one beat never re-renders the others."""
    directory = layout.beat_dir(project_id, beat_id)
    accepted = os.path.join(directory, "accepted.mp4")
    if os.path.abspath(take_path) != os.path.abspath(accepted):
        shutil.copy2(take_path, accepted)
    with open(os.path.join(directory, "accepted.json"), "w", encoding="utf-8") as fh:
        json.dump({"beat_id": beat_id, "take": take_path, "accepted_at": time.time(), **meta}, fh, indent=2)
    return accepted


def accepted_beat_path(layout: Layout, project_id: str, beat_id: str) -> str | None:
    path = os.path.join(layout.beat_dir(project_id, beat_id), "accepted.mp4")
    return path if os.path.exists(path) else None


# ----------------------------------------------------------------- pruning
def prune_superseded_takes(
    layout: Layout, project_id: str, keep_paths: set[str], settings: Settings | None = None
) -> list[str]:
    """Delete takes nothing points at any more. Accepted output and payload
    history in the database are untouched."""
    s = settings or default_settings
    if not s.prune_superseded_takes:
        return []
    takes_dir = layout.takes(project_id)
    keep = {os.path.abspath(p) for p in keep_paths if p}
    removed: list[str] = []
    for name in sorted(os.listdir(takes_dir)):
        path = os.path.abspath(os.path.join(takes_dir, name))
        if path in keep or not os.path.isfile(path):
            continue
        try:
            os.remove(path)
            removed.append(path)
        except OSError:
            continue
    return removed


def prune_work_dir(layout: Layout, project_id: str) -> None:
    work = layout.work(project_id)
    for name in os.listdir(work):
        path = os.path.join(work, name)
        try:
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
        except OSError:
            continue


def disk_usage_mb(layout: Layout, project_id: str) -> float:
    total = 0
    for dirpath, _dirs, files in os.walk(layout.project(project_id)):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                continue
    return round(total / (1024 * 1024), 2)
