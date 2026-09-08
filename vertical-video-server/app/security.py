"""One password, one operator. Signed cookie, nothing else."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Cookie, Header, HTTPException, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import settings

COOKIE_NAME = "vvs_session"
_serializer = URLSafeTimedSerializer(settings.secret_key, salt="vvs-operator")


def check_password(candidate: str) -> bool:
    return secrets.compare_digest(candidate or "", settings.operator_password)


def issue_session(response: Response, *, secure: bool | None = None) -> str:
    token = _serializer.dumps({"operator": True})
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure if secure is None else secure,
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return token


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def _valid_token(token: str) -> bool:
    try:
        _serializer.loads(token, max_age=settings.session_hours * 3600)
        return True
    except (BadSignature, SignatureExpired):
        return False


def require_operator(
    vvs_session: Optional[str] = Cookie(default=None),
    x_operator_password: Optional[str] = Header(default=None),
) -> bool:
    """Cookie for the dashboard, header for curl."""
    if vvs_session and _valid_token(vvs_session):
        return True
    if x_operator_password and check_password(x_operator_password):
        return True
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
