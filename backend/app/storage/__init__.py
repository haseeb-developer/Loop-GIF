from functools import lru_cache

from ..config import settings
from .base import Storage
from .local import LocalStorage


@lru_cache
def get_storage() -> Storage:
    if settings.storage_backend == "local":
        return LocalStorage(settings.storage_dir)
    raise RuntimeError(f"Unknown STORAGE_BACKEND: {settings.storage_backend}")
