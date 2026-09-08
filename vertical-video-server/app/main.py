"""FastAPI app: the operator dashboard and the API behind it."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import settings
from .db import init_db

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    os.makedirs(settings.storage_root, exist_ok=True)
    # The stack comes up without a .env so `docker compose up` just works; say
    # so loudly rather than sitting on the shipped defaults in silence.
    if settings.operator_password == "change-me" or settings.secret_key == "change-me-too":
        log.warning(
            "running on the DEFAULT operator password and/or secret key. "
            "Copy .env.example to .env and set OPERATOR_PASSWORD and SECRET_KEY."
        )
    if not settings.heygen_api_key:
        log.warning("HEYGEN_API_KEY is not set: planning works, rendering will fail.")
    yield


app = FastAPI(title="Vertical Video Server", version="1.0.0", lifespan=lifespan)
app.include_router(router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, bool]:
    return {"ok": True}
