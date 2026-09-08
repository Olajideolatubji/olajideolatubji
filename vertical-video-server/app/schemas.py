"""Request/response shapes for the API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    password: str


class BeatInput(BaseModel):
    narration: str = ""
    visual: str = ""
    duration_seconds: Optional[float] = None
    key_moment: bool = False
    loopable: bool = False


class ChapterInput(BaseModel):
    title: str = ""
    beats: list[BeatInput] = Field(default_factory=list)


class ProjectCreate(BaseModel):
    name: str
    target_seconds: float
    tier: Optional[Literal["short", "mid", "long"]] = None
    render_mode: Optional[Literal["composition", "beats"]] = None
    script: str = ""
    beats: Optional[list[BeatInput]] = None
    chapters: Optional[list[ChapterInput]] = None
    template_id: Optional[str] = None
    avatar_id: Optional[str] = None
    voice_id: Optional[str] = None
    background: Optional[str] = None
    music_path: Optional[str] = None
    references: list[str] = Field(default_factory=list)
    captions: bool = True
    test: Optional[bool] = None
    extra: dict[str, Any] = Field(default_factory=dict)

    def to_spec(self) -> dict[str, Any]:
        spec: dict[str, Any] = {
            "script": self.script,
            "captions": self.captions,
            "references": self.references,
            **self.extra,
        }
        if self.beats:
            spec["beats"] = [b.model_dump() for b in self.beats]
        if self.chapters:
            spec["chapters"] = [
                {"title": c.title, "beats": [b.model_dump() for b in c.beats]} for c in self.chapters
            ]
        for key in ("template_id", "avatar_id", "voice_id", "background", "music_path"):
            value = getattr(self, key)
            if value:
                spec[key] = value
        if self.test is not None:
            spec["test"] = self.test
        return spec


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    target_seconds: Optional[float] = None
    spec: Optional[dict[str, Any]] = None
    render_mode: Optional[Literal["composition", "beats"]] = None


class RecutRequest(BaseModel):
    hook: str
    name: Optional[str] = None
    start: bool = False


class HookVariantsRequest(BaseModel):
    hooks: list[str] = Field(default_factory=list, max_length=32)


class RenderHooksRequest(BaseModel):
    top_n: int = 3
    variant_ids: list[str] = Field(default_factory=list)


class BatchItem(BaseModel):
    name: str
    script: str = ""
    beats: Optional[list[BeatInput]] = None
    target_seconds: float = 15.0
    template_id: Optional[str] = None


class BatchCreate(BaseModel):
    name: str
    items: list[BatchItem]
    start: bool = False
    test: Optional[bool] = None


class ExportCreate(BaseModel):
    project_id: str
    platform: Literal["tiktok", "reels", "shorts", "other"] = "tiktok"
    title: str = ""
    description: str = ""
    hashtags: list[str] = Field(default_factory=list)
    notes: str = ""


class ExportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    hashtags: Optional[list[str]] = None
    status: Optional[Literal["pending", "published"]] = None
    notes: Optional[str] = None


class PauseRequest(BaseModel):
    reason: str = ""
