"""In-process job queues: source probing and GIF conversion. See README "Scaling" for the worker upgrade path.

Jobs are rebuilt from the database on startup (`recover_on_startup`), so a restart only delays
them: source videos stay on disk and every job input lives in a DB row.
"""
import logging
import shutil
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update

from ..config import settings
from ..db import SessionLocal
from ..models import Gif, Source
from ..storage import get_storage
from . import media
from .sources import delete_source_file, source_path

log = logging.getLogger("loop.jobs")
_pool = ThreadPoolExecutor(max_workers=settings.conversion_concurrency, thread_name_prefix="convert")
_probe_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="probe")
_cancel: dict[int, threading.Event] = {}  # gif id -> cancel flag, present while queued or running
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- source probing

def submit_probe(source_id: int) -> None:
    _probe_pool.submit(_probe, source_id)


def _fail_source(source_id: int, message: str) -> None:
    with SessionLocal() as db:
        src = db.get(Source, source_id)
        if src is None:
            return
        delete_source_file(src)  # a rejected upload shouldn't keep eating disk
        src.status, src.error = "failed", message
        src.expires_at = _now() + timedelta(hours=1)  # row lingers briefly so the client can read the error
        db.commit()


def _probe(source_id: int) -> None:
    with SessionLocal() as db:
        src = db.get(Source, source_id)
        if src is None or src.status != "probing":
            return
        path = source_path(src)
    try:
        info = media.validate_source(path)
    except media.MediaError as e:
        _fail_source(source_id, e.message)
        return
    except Exception:
        log.exception("probe crashed")
        _fail_source(source_id, "Couldn't read this video.")
        return
    with SessionLocal() as db:
        src = db.get(Source, source_id)
        if src is None:
            return
        src.status, src.error = "ready", None
        src.duration_ms, src.width, src.height, src.fps = int(round(info.duration * 1000)), info.width, info.height, info.fps
        src.expires_at = _now() + timedelta(hours=settings.source_retention_hours)
        db.commit()


# ---------------------------------------------------------------- GIF conversion

def submit(gif_id: int) -> None:
    with _lock:
        if gif_id in _cancel:
            return  # already queued or running
        _cancel[gif_id] = threading.Event()
    _pool.submit(_run, gif_id)


def cancel(gif_id: int) -> bool:
    """Ask a queued/running job to stop. False if no job is registered (e.g. stale row)."""
    with _lock:
        ev = _cancel.get(gif_id)
    if ev is None:
        return False
    ev.set()
    return True


def _set(gif_id: int, **values: object) -> None:
    with SessionLocal() as db:
        db.execute(update(Gif).where(Gif.id == gif_id).values(**values))
        db.commit()


def _fail(gif_id: int, message: str) -> None:
    _set(gif_id, status="failed", stage="failed", error=message)


def _delete_keys(keys: list[str]) -> None:
    storage = get_storage()
    for k in keys:
        try:
            storage.delete(k)
        except Exception:
            log.exception("couldn't delete %s", k)


def finish_cancelled(gif: Gif) -> None:
    """Apply a cancel to a row: drop a never-finished GIF, or restore a live one whose regeneration was stopped."""
    from sqlalchemy.orm import object_session

    db = object_session(gif)
    assert db is not None
    if gif.storage_key is None:
        db.delete(gif)
    else:
        gif.status, gif.stage, gif.progress, gif.error, gif.pending_settings = "done", "done", 100, None, None
    db.commit()


def _run(gif_id: int) -> None:
    with _lock:
        cancel_ev = _cancel.get(gif_id) or threading.Event()
    job_dir = settings.tmp_dir / uuid4().hex
    new_keys: list[str] = []
    try:
        with SessionLocal() as db:
            gif = db.get(Gif, gif_id)
            if gif is None:
                return
            if cancel_ev.is_set():
                finish_cancelled(gif)
                return
            src = db.get(Source, gif.source_id) if gif.source_id else None
            if src is None or src.status != "ready" or not source_path(src).is_file():
                _fail(gif_id, "The original video is no longer available. Upload it again.")
                return
            cfg = dict(gif.pending_settings or gif.settings)
            if "end" not in cfg:  # rows written by the first version stored a duration instead of an end time
                cfg["end"] = float(cfg.get("start", 0)) + float(cfg.get("duration", 5))
            src_path = source_path(src)
            gif.status, gif.stage, gif.progress, gif.error = "processing", "analyzing", 0, None
            db.commit()

        job_dir.mkdir(parents=True)
        out, poster = job_dir / "out.gif", job_dir / "poster.jpg"
        last = {"stage": "", "pct": -1}

        def progress(stage: str, frac: float) -> None:
            pct = 0 if stage == "analyzing" else 8 + int(frac * 90)
            if stage != last["stage"] or pct != last["pct"]:
                last.update(stage=stage, pct=pct)
                _set(gif_id, stage=stage, progress=pct)

        result = media.convert_to_gif(src_path, out, cfg, progress, cancel_ev)
        _set(gif_id, stage="finalizing", progress=98)
        media.make_poster(out, poster, at=result.duration_ms / 2000)

        gif_key, poster_key = f"gif/{uuid4().hex}.gif", f"poster/{uuid4().hex}.jpg"
        storage = get_storage()
        new_keys = [gif_key, poster_key]
        storage.put_file(gif_key, out)
        storage.put_file(poster_key, poster)

        with SessionLocal() as db:
            gif = db.get(Gif, gif_id)
            if gif is None:  # deleted while converting: don't leave orphans
                _delete_keys(new_keys)
                return
            old = [k for k in (gif.storage_key, gif.poster_key) if k]
            gif.storage_key, gif.poster_key = gif_key, poster_key
            gif.revision += 1
            gif.settings, gif.pending_settings = cfg, None
            gif.width, gif.height = result.width, result.height
            gif.duration_ms, gif.size_bytes = result.duration_ms, result.size_bytes
            gif.status, gif.stage, gif.progress, gif.error = "done", "done", 100, None
            gif.completed_at = _now()
            src = db.get(Source, gif.source_id) if gif.source_id else None
            if src is not None:  # using a source keeps it editable for another retention period
                src.expires_at = _now() + timedelta(hours=settings.source_retention_hours)
            db.commit()
        new_keys = []
        _delete_keys(old)  # the previous revision, only after the new one is live
    except media.Cancelled:
        _delete_keys(new_keys)
        with SessionLocal() as db:
            gif = db.get(Gif, gif_id)
            if gif is not None:
                finish_cancelled(gif)
    except media.MediaError as e:
        _delete_keys(new_keys)
        _fail(gif_id, e.message)
    except Exception:
        log.exception("conversion job crashed")
        _delete_keys(new_keys)
        _fail(gif_id, "Conversion failed. Try again.")
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
        with _lock:
            _cancel.pop(gif_id, None)


def recover_on_startup() -> None:
    """Re-queue work that a restart interrupted. Uploads resume on their own (chunks are on disk)."""
    shutil.rmtree(settings.tmp_dir, ignore_errors=True)  # no job is running yet, so every job dir is stale
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        gif_ids = list(db.scalars(select(Gif.id).where(Gif.status.in_(("queued", "processing"))).order_by(Gif.id)))
        if gif_ids:
            db.execute(update(Gif).where(Gif.id.in_(gif_ids)).values(status="queued", stage="queued", progress=0))
        probing = list(db.scalars(select(Source.id).where(Source.status == "probing")))
        db.commit()
    for sid in probing:
        submit_probe(sid)
    for gid in gif_ids:
        submit(gid)
