from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str = Field(min_length=32)
    cookie_secure: bool = False
    session_days: int = 7
    cors_origins: str = "http://localhost:3000"
    # Optional regex for extra allowed web origins, e.g. Vercel previews: https://.*\.vercel\.app
    cors_origin_regex: str = ""
    public_base_url: str = "http://localhost:8000"  # origin that serves /g/<name>.gif
    # Origin the browser uploads video chunks to. Must reach the API directly (not through Vercel). Defaults to public_base_url.
    upload_base_url: str = ""
    web_base_url: str = ""  # web app origin; /g/<name> on the API redirects there when set
    trust_proxy: bool = False  # honour X-Forwarded-For for rate limiting

    storage_backend: str = "local"
    storage_dir: Path = Path("/data/media")  # finished GIFs and posters (swap for S3/CDN)
    source_dir: Path = Path("/data/sources")  # uploaded videos; FFmpeg needs a local path
    tmp_dir: Path = Path("/data/tmp")

    ffmpeg_bin: str = "ffmpeg"
    ffprobe_bin: str = "ffprobe"
    ffmpeg_threads: int = 2
    ffmpeg_timeout_s: int = 900  # hard cap per FFmpeg pass
    ffmpeg_stall_s: int = 120  # kill the encode pass if it makes no progress for this long
    conversion_concurrency: int = 2
    max_queue: int = 50
    max_active_per_user: int = 2

    # Uploads
    max_upload_mb: int = 2048
    max_chunk_mb: int = 16  # server-side cap per chunk request
    chunk_mb: int = 8  # chunk size the web client uses
    upload_token_hours: int = 12
    max_uploading_per_user: int = 3
    max_source_storage_mb_per_user: int = 8192
    source_retention_hours: int = 72  # how long a source video stays editable after last use
    upload_stale_hours: int = 24

    # Input limits (0 = unlimited)
    max_input_duration_s: int = 0
    max_input_side_px: int = 3840
    max_input_fps: int = 120
    # Output limits
    min_clip_s: float = 0.2
    max_clip_s: int = 60
    max_output_width: int = 1280
    max_gif_mb: int = 125

    # Rate limits
    source_limit_per_hour: int = 30
    chunk_limit_per_hour: int = 6000
    convert_limit_per_hour: int = 60
    frame_limit_per_minute: int = 240
    login_limit_per_15min: int = 10
    signup_limit_per_hour: int = 10

    @model_validator(mode="after")
    def resolve_storage_paths(self) -> "Settings":
        # FFmpeg/ffprobe run with their working directory changed, so relative storage paths
        # would point somewhere else (and fail to find uploaded files).
        self.storage_dir = self.storage_dir.expanduser().resolve()
        self.source_dir = self.source_dir.expanduser().resolve()
        self.tmp_dir = self.tmp_dir.expanduser().resolve()
        return self

    @property
    def upload_origin(self) -> str:
        return (self.upload_base_url or self.public_base_url).rstrip("/")

    @property
    def cors_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_chunk_bytes(self) -> int:
        return self.max_chunk_mb * 1024 * 1024

    @property
    def chunk_bytes(self) -> int:
        return min(self.chunk_mb, self.max_chunk_mb) * 1024 * 1024

    @property
    def max_gif_bytes(self) -> int:
        return self.max_gif_mb * 1024 * 1024

    @property
    def source_quota_bytes(self) -> int:
        return self.max_source_storage_mb_per_user * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
