from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import current_user
from ..models import Gif, Source, User
from ..ratelimit import limiter
from ..schemas import (GifCreate, GifList, GifOut, GifPatch, GifRegenerate, PublicConfig, SlugCheck, SourceBrief)
from ..security import new_public_id
from ..services import jobs
from ..services.slugs import SLUG_MAX, SLUG_MIN, SlugError, validate_slug
from ..services.sources import source_path
from ..services.urls import gif_urls
from ..storage import get_storage
from ..timeutils import is_expired

router = APIRouter(prefix="/api/gifs", tags=["gifs"])
config_router = APIRouter(prefix="/api", tags=["config"])
ACTIVE = ("queued", "processing")


def gif_out(g: Gif, src: Source | None) -> GifOut:
    brief = None
    if src is not None and src.status == "ready" and not is_expired(src.expires_at) \
            and source_path(src).is_file():
        brief = SourceBrief(id=src.public_id, filename=src.filename,
                            duration=src.duration_ms / 1000 if src.duration_ms else None,
                            width=src.width, height=src.height, fps=src.fps, expires_at=src.expires_at)
    return GifOut(
        id=g.public_id, title=g.title, slug=g.slug, status=g.status, stage=g.stage, progress=g.progress, error=g.error,
        has_file=bool(g.storage_key), revision=g.revision, width=g.width, height=g.height, duration_ms=g.duration_ms,
        size_bytes=g.size_bytes, source_size_bytes=g.source_size_bytes, settings=g.settings,
        created_at=g.created_at, updated_at=g.updated_at, completed_at=g.completed_at, expires_at=g.expires_at,
        source=brief, **gif_urls(g),
    )


def _sources_for(db: Session, gifs: list[Gif]) -> dict[int, Source]:
    ids = {g.source_id for g in gifs if g.source_id}
    if not ids:
        return {}
    return {s.id: s for s in db.scalars(select(Source).where(Source.id.in_(ids)))}


def _owned(db: Session, user: User, public_id: str) -> Gif:
    gif = db.scalar(select(Gif).where(Gif.public_id == public_id, Gif.user_id == user.id))
    if gif is None:  # same 404 for "missing" and "someone else's"
        raise HTTPException(404, "GIF not found.")
    return gif


def _out(db: Session, gif: Gif) -> GifOut:
    return gif_out(gif, db.get(Source, gif.source_id) if gif.source_id else None)


@config_router.get("/config", response_model=PublicConfig)
def public_config():
    return PublicConfig(
        public_base_url=settings.public_base_url.rstrip("/"), max_upload_bytes=settings.max_upload_bytes, chunk_bytes=settings.chunk_bytes,
        max_input_duration_s=settings.max_input_duration_s, max_input_side_px=settings.max_input_side_px,
        min_clip_s=settings.min_clip_s, max_clip_s=settings.max_clip_s, max_output_width=settings.max_output_width,
        max_gif_mb=settings.effective_max_gif_mb, source_retention_hours=settings.source_retention_hours,
        slug_min=SLUG_MIN, slug_max=SLUG_MAX, formats=["MP4", "MOV", "WebM", "MKV", "AVI"],
    )


@config_router.get("/slugs/check", response_model=SlugCheck)
def check_slug(slug: str = Query("", max_length=60), gif_id: str | None = Query(None, max_length=32),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    limiter.check(f"slug:{user.id}", 120, 60)
    try:
        clean = validate_slug(slug)
    except SlugError as e:
        return SlugCheck(slug=slug, available=False, reason=e.message)
    if clean is None:
        return SlugCheck(slug="", available=False, reason="Enter a name for the URL.")
    owner = db.scalar(select(Gif.public_id).where(Gif.slug == clean))
    if owner is None or (gif_id and owner == gif_id):
        return SlugCheck(slug=clean, available=True)
    return SlugCheck(slug=clean, available=False, reason="That URL is already taken.")


def _check_capacity(db: Session, user: User) -> None:
    mine = db.scalar(select(func.count(Gif.id)).where(Gif.user_id == user.id, Gif.status.in_(ACTIVE)))
    if (mine or 0) >= settings.max_active_per_user:
        raise HTTPException(429, "You already have conversions running. Wait for one to finish.")
    total = db.scalar(select(func.count(Gif.id)).where(Gif.status.in_(ACTIVE)))
    if (total or 0) >= settings.max_queue:
        raise HTTPException(503, "The converter is busy. Try again in a minute.")


def _ready_source(db: Session, user: User, public_id: str) -> Source:
    src = db.scalar(select(Source).where(Source.public_id == public_id, Source.user_id == user.id))
    if src is None:
        raise HTTPException(404, "Video not found. It may have expired. Upload it again.")
    if src.status in ("uploading", "probing"):
        raise HTTPException(409, "The video is still being processed.")
    if src.status != "ready":
        raise HTTPException(422, src.error or "This video can't be used.")
    if is_expired(src.expires_at) or not source_path(src).is_file():
        raise HTTPException(410, "This video has expired. Upload it again.")
    return src


def _build_cfg(src: Source, *, start: float, end: float, fps: int, width: int, quality: str) -> dict:
    """Validate a range against the real video and return the settings the encoder will use."""
    duration = (src.duration_ms or 0) / 1000
    start, end = max(0.0, start), min(end, duration)
    eps = 1e-6
    if start >= duration:
        raise HTTPException(422, "The start is past the end of the video.")
    length = end - start
    if length < settings.min_clip_s - eps:
        raise HTTPException(422, f"Clips must be at least {settings.min_clip_s:g} seconds.")
    if length > settings.max_clip_s + eps:
        raise HTTPException(422, f"Clips can be at most {settings.max_clip_s} seconds. Shorten the range.")
    out_w = min(width, src.width or width)
    out_w = max(2, out_w - out_w % 2)
    return {"start": round(start, 3), "end": round(end, 3), "fps": fps, "width": out_w, "quality": quality}


def _slug_or_422(raw: str | None) -> str | None:
    try:
        return validate_slug(raw)
    except SlugError as e:
        raise HTTPException(422, e.message) from None


def _slug_taken(db: Session, slug: str) -> bool:
    return db.scalar(select(Gif.id).where(Gif.slug == slug)) is not None


@router.post("", response_model=GifOut, status_code=202)
def create_gif(body: GifCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    limiter.check(f"convert:{user.id}", settings.convert_limit_per_hour, 3600)
    src = _ready_source(db, user, body.source_id)
    cfg = _build_cfg(src, start=body.start, end=body.end, fps=body.fps, width=body.width, quality=body.quality)
    slug = _slug_or_422(body.slug)
    if slug and _slug_taken(db, slug):
        raise HTTPException(409, "That URL is already taken.")
    _check_capacity(db, user)
    title = (body.title or "").strip()[:200] or Path(src.filename).stem[:200] or "Untitled"

    for _ in range(5):
        gif = Gif(public_id=new_public_id(), slug=slug, user_id=user.id, source_id=src.id, title=title,
                  original_filename=src.filename, status="queued", stage="queued", progress=0, settings=cfg,
                  pending_settings=cfg, source_size_bytes=src.size_bytes)
        db.add(gif)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            if slug and _slug_taken(db, slug):  # lost a race for the name
                raise HTTPException(409, "That URL is already taken.") from None
    else:
        raise HTTPException(500, "Couldn't allocate an ID. Try again.")
    jobs.submit(gif.id)
    return gif_out(gif, src)


@router.get("", response_model=GifList)
def list_gifs(
    q: str | None = Query(None, max_length=100),
    status: Literal["all", "ready", "processing", "failed"] = "all",
    sort: Literal["recent", "created", "oldest", "name", "size"] = "recent",
    limit: int = Query(48, ge=1, le=100), offset: int = Query(0, ge=0),
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    where = [Gif.user_id == user.id]
    if q and q.strip():
        like = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(or_(Gif.title.ilike(like, escape="\\"), Gif.slug.ilike(like, escape="\\")))
    if status == "ready":
        where += [Gif.storage_key.is_not(None), Gif.status == "done"]
    elif status == "processing":
        where.append(Gif.status.in_(ACTIVE))
    elif status == "failed":
        where.append(Gif.status == "failed")
    order = {
        "recent": [Gif.updated_at.desc(), Gif.id.desc()],
        "created": [Gif.created_at.desc(), Gif.id.desc()],
        "oldest": [Gif.created_at.asc(), Gif.id.asc()],
        "name": [func.lower(Gif.title).asc(), Gif.id.asc()],
        "size": [Gif.size_bytes.desc().nulls_last(), Gif.id.desc()],
    }[sort]
    total = db.scalar(select(func.count(Gif.id)).where(*where)) or 0
    rows = list(db.scalars(select(Gif).where(*where).order_by(*order).limit(limit).offset(offset)))
    counts = {s: n for s, n in db.execute(select(Gif.status, func.count(Gif.id)).where(Gif.user_id == user.id)
                                           .group_by(Gif.status))}
    sources = _sources_for(db, rows)
    return GifList(items=[gif_out(g, sources.get(g.source_id or -1)) for g in rows], total=total, counts=counts)


@router.get("/{public_id}", response_model=GifOut)
def get_gif(public_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(db, _owned(db, user, public_id))


@router.patch("/{public_id}", response_model=GifOut)
def update_gif(public_id: str, body: GifPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    gif = _owned(db, user, public_id)
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(422, "The name can't be empty.")
        gif.title = body.title.strip()
    if "slug" in body.model_fields_set:
        slug = _slug_or_422(body.slug)  # empty or null removes the custom URL (the random-id URL keeps working)
        if slug and slug != gif.slug and _slug_taken(db, slug):
            raise HTTPException(409, "That URL is already taken.")
        gif.slug = slug
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "That URL is already taken.") from None
    return _out(db, gif)


@router.post("/{public_id}/regenerate", response_model=GifOut, status_code=202)
def regenerate(public_id: str, body: GifRegenerate | None = None, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Re-encode from the stored source into the same URL. The current GIF keeps serving until the new one is ready."""
    gif = _owned(db, user, public_id)
    if gif.status in ACTIVE:
        raise HTTPException(409, "This GIF is already being converted.")
    src = db.get(Source, gif.source_id) if gif.source_id else None
    if src is None:
        raise HTTPException(409, "The original video isn't stored any more. Upload it again to edit this GIF.")
    src = _ready_source(db, user, src.public_id)
    limiter.check(f"convert:{user.id}", settings.convert_limit_per_hour, 3600)
    _check_capacity(db, user)

    cur, b = gif.settings or {}, body or GifRegenerate()
    start = b.start if b.start is not None else float(cur.get("start", 0))
    old_end = cur.get("end") if cur.get("end") is not None else float(cur.get("start", 0)) + float(cur.get("duration", 5))
    cfg = _build_cfg(src, start=start, end=b.end if b.end is not None else float(old_end),
                     fps=b.fps or int(cur.get("fps", 15)), width=b.width or int(cur.get("width", 480)),
                     quality=b.quality or str(cur.get("quality", "balanced")))
    gif.pending_settings = cfg
    gif.status, gif.stage, gif.progress, gif.error = "queued", "queued", 0, None
    db.commit()
    jobs.submit(gif.id)
    return gif_out(gif, src)


@router.post("/{public_id}/cancel", status_code=204)
def cancel_gif(public_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Stop a running conversion. A GIF that never finished is removed; a live one reverts to its current version."""
    gif = _owned(db, user, public_id)
    if gif.status not in ACTIVE:
        return Response(status_code=204)
    if not jobs.cancel(gif.id):  # no live job behind this row (stale), so settle it here
        jobs.finish_cancelled(gif)
    return Response(status_code=204)


@router.delete("/{public_id}", status_code=204)
def delete_gif(public_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The row goes first, in its own commit, so the public URL stops resolving immediately."""
    gif = _owned(db, user, public_id)
    keys = [k for k in (gif.storage_key, gif.poster_key) if k]
    jobs.cancel(gif.id)
    db.delete(gif)
    db.commit()
    storage = get_storage()
    for k in keys:
        storage.delete(k)
    return Response(status_code=204)
