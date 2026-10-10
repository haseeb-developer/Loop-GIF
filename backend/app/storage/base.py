from collections.abc import Iterator
from pathlib import Path
from typing import Protocol


class Storage(Protocol):
    """Everything the app needs from a media store. Implement this for S3/R2/GCS.

    Keys are opaque, app-generated strings like "gif/aB3kQ9xT2mLp.gif" (never user input).
    """

    def put_file(self, key: str, src: Path) -> None: ...
    def delete(self, key: str) -> None: ...
    def size(self, key: str) -> int | None: ...
    def stream(self, key: str, chunk_size: int = 1024 * 256) -> Iterator[bytes]: ...

    def local_path(self, key: str) -> Path | None:
        """Filesystem path if the object lives on local disk (enables sendfile-style serving)."""
        ...

    def public_redirect(self, key: str) -> str | None:
        """CDN/presigned URL to 302 to, or None to serve bytes through the API."""
        ...
