import logging
import re
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import migrate, models
from .config import settings
from .db import engine
from .routers import auth, gifs, public, sources
from .services import jobs, maintenance

logging.basicConfig(level=logging.INFO)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


class OriginGuard:
    """Reject state-changing /api requests whose Origin header isn't ours (CSRF defence in depth)."""

    def __init__(self, app, allowed: list[str], pattern: str = "") -> None:
        self.app, self.allowed = app, set(allowed)
        self.pattern = re.compile(pattern) if pattern else None

    def _ok(self, origin: str) -> bool:
        origin = origin.rstrip("/")
        return origin in self.allowed or bool(self.pattern and self.pattern.fullmatch(origin))

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] in UNSAFE and scope["path"].startswith("/api/"):
            origin = next((v.decode() for k, v in scope["headers"] if k == b"origin"), None)
            if origin is not None and not self._ok(origin):
                return await JSONResponse({"detail": "Origin not allowed"}, 403)(scope, receive, send)
        await self.app(scope, receive, send)


_stop = threading.Event()


@asynccontextmanager
async def lifespan(_: FastAPI):
    for d in (settings.source_dir, settings.tmp_dir):
        d.mkdir(parents=True, exist_ok=True)
    models.Base.metadata.create_all(engine)
    migrate.run(engine)
    jobs.recover_on_startup()
    maintenance.sweep_once()
    maintenance.start(_stop)
    yield
    _stop.set()


app = FastAPI(title="Loop", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(OriginGuard, allowed=settings.cors_list, pattern=settings.cors_origin_regex)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_list, allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(auth.router)
app.include_router(sources.router)
app.include_router(gifs.router)
app.include_router(gifs.config_router)
app.include_router(public.router)


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"ok": True}
