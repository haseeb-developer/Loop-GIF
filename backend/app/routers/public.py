"""Public, unauthenticated routes.

  GET /g/<name>.gif | .jpg   the file (name = vanity slug or the 12-char random id)
  GET /g/<name>              redirect to the share page on the web app (if WEB_BASE_URL is set)
  GET /api/public/gifs/<n>   metadata for the share page's Open Graph tags

Every request looks the GIF up in the database, so deleting it stops the URL working immediately.
Responses use `no-cache` (store, but revalidate with the ETag every time) instead of a long max-age:
a deleted GIF can't linger in browsers or a CDN, while unchanged GIFs still cost only a 304.
"""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import Gif
from ..schemas import PublicGif
from ..services.urls import gif_urls
from ..storage import get_storage

router = APIRouter()
FILE_RE = re.compile(r"^([0-9A-Za-z_-]{3,40})\.(gif|jpg)$")
NAME_RE = re.compile(r"^[0-9A-Za-z_-]{3,40}$")
ID_RE = re.compile(r"^[0-9A-Za-z]{12}$")
SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")
MEDIA_TYPES = {"gif": "image/gif", "jpg": "image/jpeg"}
CORS = {"Access-Control-Allow-Origin": "*"}


def find_public(db: Session, name: str) -> Gif | None:
    """Resolve a URL name to a live GIF. Random ids contain an uppercase letter and slugs never do."""
    if ID_RE.match(name) and name != name.lower():
        cond = Gif.public_id == name
    else:
        cond = Gif.slug == name.lower()
    gif = db.scalar(select(Gif).where(cond, Gif.storage_key.is_not(None)))
    if gif is None or (gif.expires_at and gif.expires_at <= datetime.now(timezone.utc)):
        return None
    return gif


def _gone() -> Response:
    return Response("Not found", status_code=404, media_type="text/plain", headers={"Cache-Control": "no-store", **CORS})


@router.api_route("/g/{filename}", methods=["GET", "HEAD"], include_in_schema=False)
def serve(filename: str, request: Request, download: bool = False):
    m = FILE_RE.match(filename)
    if not m:
        if NAME_RE.match(filename) and settings.web_base_url:  # bare name: send people to the share page
            return RedirectResponse(f"{settings.web_base_url.rstrip('/')}/g/{filename}", status_code=302,
                                    headers={"Cache-Control": "no-store"})
        return _gone()
    name, ext = m.groups()
    with SessionLocal() as db:  # released before streaming starts
        gif = find_public(db, name)
        if gif is None:
            return _gone()
        key = gif.storage_key if ext == "gif" else gif.poster_key
        label = gif.slug or SAFE_RE.sub("-", gif.title).strip("-.")[:60] or gif.public_id
    if not key:
        return _gone()

    etag = f'"{key.rsplit("/", 1)[-1].rsplit(".", 1)[0]}"'  # keys are unique per revision, so this is a strong validator
    headers = {
        "Cache-Control": "public, no-cache",
        "ETag": etag,
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Disposition": f'{"attachment" if download else "inline"}; filename="{label}.{ext}"',
        **CORS,
    }
    if etag in (request.headers.get("if-none-match") or ""):
        return Response(status_code=304, headers=headers)

    storage = get_storage()
    redirect = storage.public_redirect(key)
    if redirect:
        return RedirectResponse(redirect, status_code=302, headers={"Cache-Control": "no-store", **CORS})
    path = storage.local_path(key)
    if path:  # FileResponse sets Content-Length and Last-Modified, and skips the body for HEAD
        return FileResponse(path, media_type=MEDIA_TYPES[ext], headers=headers)
    size = storage.size(key)
    if size is None:
        return _gone()
    return StreamingResponse(storage.stream(key), media_type=MEDIA_TYPES[ext],
                             headers={**headers, "Content-Length": str(size)})


@router.get("/api/public/gifs/{name}", response_model=PublicGif, include_in_schema=False)
def public_gif(name: str, response: Response):
    response.headers["Cache-Control"] = "no-store"
    if not NAME_RE.match(name):
        raise HTTPException(404, "Not found")
    with SessionLocal() as db:
        gif = find_public(db, name)
        if gif is None:
            raise HTTPException(404, "Not found")
        urls = gif_urls(gif)
        return PublicGif(
            id=gif.public_id, title=gif.title, slug=gif.slug, width=gif.width, height=gif.height,
            duration_ms=gif.duration_ms, size_bytes=gif.size_bytes, created_at=gif.created_at,
            url=urls["url"], permanent_url=urls["permanent_url"], poster_url=urls["poster_url"],
            download_url=urls["download_url"],
        )
