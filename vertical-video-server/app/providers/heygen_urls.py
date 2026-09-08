"""Every HeyGen URL lives here. One module, one place to change.

Version note
------------
v2 is HeyGen's legacy Studio API. HeyGen has said it is supported until
1 Oct 2026. v3 is the current API but does not yet cover templates, and
templates are how this server drives HeyGen, so segment rendering stays on v2
until v3 grows template support. V3_BASE is defined so the migration is a diff
in this file rather than a search across the codebase.

Video status is a v1 endpoint and has no v2 equivalent.
"""

from __future__ import annotations

from urllib.parse import urlencode

V1_BASE = "https://api.heygen.com/v1"
V2_BASE = "https://api.heygen.com/v2"
V3_BASE = "https://api.heygen.com/v3"  # no template support yet; do not switch blindly
UPLOAD_BASE = "https://upload.heygen.com/v1"

API_KEY_HEADER = "X-Api-Key"  # not Authorization: Bearer


def template_generate(template_id: str) -> str:
    """TEMPLATE mode — the primary path. Named placeholders filled per segment."""
    return f"{V2_BASE}/template/{template_id}/generate"


def template_detail(template_id: str) -> str:
    return f"{V2_BASE}/template/{template_id}"


def template_list() -> str:
    return f"{V2_BASE}/templates"


def video_generate() -> str:
    """AGENT mode fallback — prompt in, video out, less control."""
    return f"{V2_BASE}/video/generate"


def video_status(video_id: str) -> str:
    return f"{V1_BASE}/video_status.get?{urlencode({'video_id': video_id})}"


def video_delete() -> str:
    return f"{V1_BASE}/video.delete"


def avatar_list() -> str:
    return f"{V2_BASE}/avatars"


def voice_list() -> str:
    return f"{V2_BASE}/voices"


def remaining_quota() -> str:
    return f"{V2_BASE}/user/remaining_quota"


def asset_upload() -> str:
    return f"{UPLOAD_BASE}/asset"
