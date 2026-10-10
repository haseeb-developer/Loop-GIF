"""Periodic cleanup: expired GIFs, expired/stale source videos, leftover job directories."""
import logging
import shutil
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import select

from ..config import settings
from ..db import SessionLocal
from ..models import Gif, Source
from ..storage import get_storage
from .sources import delete_source_file

log = logging.getLogger("loop.maintenance")
INTERVAL_S = 600


def sweep_once() -> None:
    now = datetime.now(timezone.utc)
    storage = get_storage()
    dead_keys: list[str] = []
    with SessionLocal() as db:
        for gif in db.scalars(select(Gif).where(Gif.expires_at.is_not(None), Gif.expires_at <= now)):
            dead_keys += [k for k in (gif.storage_key, gif.poster_key) if k]
            db.delete(gif)

        in_use = select(Gif.source_id).where(Gif.status.in_(("queued", "processing")), Gif.source_id.is_not(None))
        for src in db.scalars(select(Source).where(Source.expires_at.is_not(None), Source.expires_at <= now,
                                                   Source.id.not_in(in_use))):
            delete_source_file(src)
            db.delete(src)
        db.commit()
    for key in dead_keys:  # after the rows are gone, so a public request can never find a half-deleted GIF
        storage.delete(key)

    cutoff = time.time() - 6 * 3600  # job dirs are removed by their job; anything this old is a crash leftover
    if settings.tmp_dir.is_dir():
        for d in settings.tmp_dir.iterdir():
            try:
                if d.is_dir() and d.stat().st_mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
            except OSError:
                pass


def start(stop: threading.Event) -> threading.Thread:
    def loop() -> None:
        while not stop.wait(INTERVAL_S):
            try:
                sweep_once()
            except Exception:
                log.exception("sweep failed")

    t = threading.Thread(target=loop, name="sweeper", daemon=True)
    t.start()
    return t
