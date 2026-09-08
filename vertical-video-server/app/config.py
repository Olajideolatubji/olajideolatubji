"""Configuration. Everything the operator can tune lives here and is read from env."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # ------------------------------------------------------------------ core
    app_name: str = "vertical-video-server"
    operator_password: str = "change-me"
    secret_key: str = "change-me-too"
    session_hours: int = 168
    # Set when the dashboard is served over HTTPS, so the session cookie is
    # never sent in the clear. The public deploy turns this on.
    cookie_secure: bool = False
    database_url: str = "postgresql+psycopg://vvs:vvs@postgres:5432/vvs"
    redis_url: str = "redis://redis:6379/0"
    storage_root: str = "/data"
    log_level: str = "INFO"

    # Which path renders pixels. "composition" hands a spec to HeyGen and gets one
    # MP4 back. "beats" drives a local ComfyUI for stills + image-to-video.
    render_mode: Literal["composition", "beats"] = "composition"

    # ---------------------------------------------------------------- heygen
    heygen_api_key: str = ""
    heygen_mode: Literal["template", "agent"] = "template"
    heygen_template_id: str = ""
    heygen_avatar_id: str = ""
    heygen_voice_id: str = ""
    heygen_background_color: str = "#000000"
    # Watermarked renders that do not consume credits. Default on, on purpose.
    heygen_test: bool = True
    heygen_poll_seconds: int = 20
    heygen_request_timeout: int = 60
    # Hard stop for a single segment poll loop.
    heygen_max_poll_minutes: int = 90
    # THE constraint. Renders fail past the plan's duration cap, so the planner
    # never emits a segment longer than this.
    heygen_max_segment_seconds: int = 300
    heygen_dimension_width: int = 1080
    heygen_dimension_height: int = 1920
    # Placeholder names in the HeyGen template. Text placeholders get the
    # narration, the rest are optional.
    heygen_placeholder_script: str = "script"
    heygen_placeholder_title: str = "title"
    heygen_placeholder_background: str = "background"

    # Optional per-step provider chain override, JSON. The first entry is
    # primary and the rest are failover, e.g.
    #   {"segment_render": ["heygen", "heygen_agent"], "tts": ["elevenlabs"]}
    provider_chains: str = ""

    # --------------------------------------------------------------- comfyui
    comfyui_url: str = "http://comfyui:8188"
    comfyui_image_workflow: str = "/srv/workflows/image.json"
    comfyui_video_workflow: str = "/srv/workflows/image_to_video.json"
    comfyui_poll_seconds: int = 5
    comfyui_timeout_seconds: int = 900
    comfyui_reference_dir: str = "/data/references"

    # ------------------------------------------------------------------- tts
    tts_provider: Literal["heygen", "elevenlabs", "none"] = "heygen"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    elevenlabs_model: str = "eleven_multilingual_v2"
    # Narration is synthesised per beat, never per chapter.
    tts_max_chars_per_call: int = 900

    # ---------------------------------------------------------------- ffmpeg
    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"
    video_width: int = 1080
    video_height: int = 1920
    video_fps: int = 30
    video_crf: int = 19
    video_preset: str = "medium"
    audio_bitrate: str = "192k"
    # Seam handling: segments are rendered independently and will not match.
    seam_crossfade_ms: int = 300  # clamped to 200..400
    # A join never feeds more than this many inputs to one ffmpeg call.
    ffmpeg_max_join_inputs: int = 8
    # Applied ONCE over the joined output, never per segment.
    color_grade_filter: str = "eq=contrast=1.05:saturation=1.08:gamma=0.98"
    burn_captions: bool = True
    caption_style: str = (
        "FontName=Arial,Fontsize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,"
        "BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=180"
    )
    music_duck_threshold: float = 0.05
    music_duck_ratio: int = 8

    # ------------------------------------------------------------------ cost
    cost_per_segment_usd: float = 0.0
    cost_per_render_minute_usd: float = 0.30
    cost_per_tts_1k_chars_usd: float = 0.18
    storage_cost_per_gb_month_usd: float = 0.02
    estimated_mb_per_minute: float = 18.0
    monthly_cost_cap_usd: float = 200.0
    # Long-tier renders always ask before spending.
    long_tier_requires_confirmation: bool = True

    # ----------------------------------------------------------------- queue
    max_concurrent_segment_jobs: int = 3
    max_retries: int = 4
    retry_backoff_seconds: int = 20
    retry_backoff_max_seconds: int = 900
    resume_sweep_seconds: int = 60

    # ------------------------------------------------------------- long form
    # Expensive treatment (fresh plates, key-moment art) is reserved for chapter
    # openers and marked key moments, capped per chapter.
    max_expensive_beats_per_chapter: int = 2
    plate_pool_per_chapter: int = 4
    loopable_min_seconds: float = 20.0
    prune_superseded_takes: bool = True

    # ------------------------------------------------------------ derived ---
    @property
    def poll_seconds(self) -> int:
        """Never poll HeyGen faster than every 20 seconds."""
        return max(20, int(self.heygen_poll_seconds))

    @property
    def crossfade_ms(self) -> int:
        return max(200, min(400, int(self.seam_crossfade_ms)))

    @property
    def crossfade_seconds(self) -> float:
        return self.crossfade_ms / 1000.0


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
