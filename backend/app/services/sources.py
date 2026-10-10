"""Source-video file helpers. Sources live on local disk because FFmpeg needs a real path."""
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Source


def source_path(src: Source) -> Path:
    return settings.source_dir / src.storage_name


def delete_source_file(src: Source) -> None:
    try:
        source_path(src).unlink()
    except FileNotFoundError:
        pass


def received_bytes(src: Source) -> int:
    try:
        return source_path(src).stat().st_size
    except FileNotFoundError:
        return 0


def used_bytes(db: Session, user_id: int) -> int:
    """Disk a user's stored source videos count against their quota (failed sources are already deleted)."""
    return int(db.scalar(select(func.coalesce(func.sum(Source.size_bytes), 0))
                         .where(Source.user_id == user_id, Source.status != "failed")) or 0)
