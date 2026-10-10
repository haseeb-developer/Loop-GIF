"""Source videos: resumable chunked upload, background probing, scrub-preview frames.

Flow: POST /api/sources (cookie) -> PUT .../chunk x N (bearer upload token, straight to the API origin)
      -> POST .../complete (cookie) -> poll GET .../{id} until status is "ready".
"""
import asyncio
import os
import secrets
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

import anyio
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal, get_db
from ..deps import current_user
from ..models import Gif, Source, User
from ..ratelimit import limiter
from ..schemas import ChunkAck, SourceCreate, SourceCreated, SourceOut
from ..security import create_upload_token, new_public_id, read_upload_token
from ..services import jobs, media
from ..services.sources import delete_source_file, received_bytes, source_path, used_bytes

router = APIRouter(prefix="/api/sources", tags=["sources"])
_locks: dict[str, asyncio.Lock] = {}  # one writer per source at a time (single API process)
MIN_FREE_BYTES = 512 * 1024 * 1024


def source_out(src: Source) -> SourceOut:
    return SourceOut(
        id=src.public_id, filename=src.filename, size_bytes=src.size_bytes,
        received=received_bytes(src) if src.status == "uploading" else src.size_bytes,
        status=src.status, error=src.error,
        duration=src.duration_ms / 1000 if src.duration_ms else None,
        width=src.width, height=src.height, fps=src.fps, created_at=src.created_at, expires_at=src.expires_at,
    )


def _owned(db: Session, user: User, pid: str) -> Source:
    src = db.scalar(select(Source).where(Source.public_id == pid, Source.user_id == user.id))
    if src is None:
        raise HTTPException(404, "Video not found. It may have expired.")
    return src


def _clean_filename(raw: str) -> str:
    name = Path(unquote(raw).replace("\\", "/")).name
    name = "".join(c for c in name if c.isprintable())[:255].strip()
    return name or "video"


@router.post("", response_model=SourceCreated, status_code=201)
def create_source(body: SourceCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    limiter.check(f"source:{user.id}", settings.source_limit_per_hour, 3600)
    if body.size > settings.max_upload_bytes:
        raise HTTPException(413, f"File is too large. The limit is {settings.max_upload_mb} MB.")
    uploading = db.scalar(select(func.count(Source.id)).where(Source.user_id == user.id, Source.status == "uploading"))
    if (uploading or 0) >= settings.max_uploading_per_user:
        raise HTTPException(429, "You have uploads in progress. Wait for them to finish or cancel one.")
    if used_bytes(db, user.id) + body.size > settings.source_quota_bytes:
        raise HTTPException(413, "Your stored videos are using all of your space. Delete one from your library, "
                                 "or wait for them to expire.")
    settings.source_dir.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(settings.source_dir).free < body.size + MIN_FREE_BYTES:
        raise HTTPException(507, "The server is out of storage space. Try again later.")

    storage_name = secrets.token_hex(16) + ".bin"
    path = settings.source_dir / storage_name
    with open(path, "xb"):
        pass
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.upload_stale_hours)
    for _ in range(5):
        src = Source(public_id=new_public_id(), user_id=user.id, filename=_clean_filename(body.filename),
                     size_bytes=body.size, status="uploading", storage_name=storage_name, expires_at=expires)
        db.add(src)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
    else:
        path.unlink(missing_ok=True)
        raise HTTPException(500, "Couldn't start the upload. Try again.")
    return SourceCreated(
        source=source_out(src),
        upload_url=f"{settings.upload_origin}/api/sources/{src.public_id}/chunk",
        upload_token=create_upload_token(user.id, src.public_id),
        chunk_size=settings.chunk_bytes,
    )


def _uploading_target(uid: int, pid: str) -> tuple[Path, int]:
    with SessionLocal() as db:
        src = db.scalar(select(Source).where(Source.public_id == pid, Source.user_id == uid))
        if src is None:
            raise HTTPException(404, "This upload no longer exists.")
        if src.status != "uploading":
            raise HTTPException(409, "This upload is already complete.")
        return source_path(src), src.size_bytes


@router.put("/{pid}/chunk", response_model=ChunkAck)
async def put_chunk(pid: str, request: Request, offset: int = Query(..., ge=0),
                    authorization: str | None = Header(None)):
    """Append one chunk. `offset` must equal the bytes already stored; otherwise 409 says where to resume."""
    token = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    uid = read_upload_token(token, pid) if token else None
    if uid is None:
        raise HTTPException(401, "Upload session expired. Start the upload again.")
    limiter.check(f"chunk:{uid}", settings.chunk_limit_per_hour, 3600)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_chunk_bytes:
        raise HTTPException(413, "Chunk is too large.")

    async with _locks.setdefault(pid, asyncio.Lock()):
        path, total = await run_in_threadpool(_uploading_target, uid, pid)
        try:
            current = path.stat().st_size
        except FileNotFoundError:
            raise HTTPException(404, "This upload no longer exists.") from None
        if offset != current:
            return JSONResponse({"detail": "Upload is out of sync. Resuming.", "received": current}, status_code=409)
        written = 0
        try:
            async with await anyio.open_file(path, "r+b") as f:  # r+b: never recreates a deleted upload
                await f.seek(current)
                async for chunk in request.stream():
                    written += len(chunk)
                    if written > settings.max_chunk_bytes or current + written > total:
                        raise HTTPException(413, "Chunk is larger than expected.")
                    await f.write(chunk)
        except FileNotFoundError:
            raise HTTPException(404, "This upload no longer exists.") from None
        except BaseException:
            try:  # sync on purpose: awaiting inside a cancelled request would never run
                os.truncate(path, current)  # a broken chunk must not leave half-written bytes behind
            except OSError:
                pass
            raise
        return ChunkAck(received=current + written)


@router.post("/{pid}/complete", response_model=SourceOut, status_code=202)
def complete(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    src = _owned(db, user, pid)
    if src.status in ("probing", "ready", "failed"):  # idempotent: a retried request just reports state
        return source_out(src)
    got = received_bytes(src)
    if got != src.size_bytes:
        return JSONResponse({"detail": f"Upload is incomplete ({got} of {src.size_bytes} bytes).", "received": got},
                            status_code=409)
    src.status = "probing"
    db.commit()
    jobs.submit_probe(src.id)
    return source_out(src)


@router.get("/{pid}", response_model=SourceOut)
def get_source(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return source_out(_owned(db, user, pid))


@router.delete("/{pid}", status_code=204)
def delete_source(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    src = _owned(db, user, pid)
    busy = db.scalar(select(func.count(Gif.id)).where(Gif.source_id == src.id, Gif.status.in_(("queued", "processing"))))
    if busy:
        raise HTTPException(409, "A GIF is being made from this video. Cancel it first.")
    delete_source_file(src)
    db.delete(src)  # GIFs made from it keep working; they just can't be edited any more
    db.commit()
    _locks.pop(pid, None)


@router.get("/{pid}/frame")
def frame(pid: str, t: float = Query(0, ge=0, allow_inf_nan=False), w: int = Query(640, ge=120, le=1280),
          user: User = Depends(current_user), db: Session = Depends(get_db)):
    """A single JPEG frame, so videos the browser can't play (MKV, AVI, HEVC) can still be scrubbed."""
    limiter.check(f"frame:{user.id}", settings.frame_limit_per_minute, 60)
    src = _owned(db, user, pid)
    if src.status != "ready" or not src.duration_ms:
        raise HTTPException(409, "The video isn't ready yet.")
    t = min(t, max(0.0, src.duration_ms / 1000 - 0.05))
    try:
        data = media.frame_jpeg(source_path(src), t, w)
    except media.MediaError as e:
        raise HTTPException(e.status, e.message) from None
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
