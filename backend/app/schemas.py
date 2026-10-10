from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .config import settings

Quality = Literal["low", "balanced", "high"]


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class UserOut(BaseModel):
    email: str
    display_name: str
    created_at: datetime
    gif_count: int = 0
    storage_bytes: int = 0  # finished GIFs
    source_bytes: int = 0  # stored source videos
    source_quota_bytes: int = 0


# ---- sources (uploaded videos)

class SourceCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=1024)
    size: int = Field(gt=0)


class SourceOut(BaseModel):
    id: str
    filename: str
    size_bytes: int
    received: int
    status: str  # uploading | probing | ready | failed
    error: str | None
    duration: float | None  # seconds, exact to the millisecond
    width: int | None
    height: int | None
    fps: float | None
    created_at: datetime
    expires_at: datetime | None


class SourceCreated(BaseModel):
    source: SourceOut
    upload_url: str  # absolute, on the API origin
    upload_token: str
    chunk_size: int


class ChunkAck(BaseModel):
    received: int


# ---- GIFs

class RangeSettings(BaseModel):
    """What to cut and how to encode it. Bounds that depend on the video are checked in the router."""

    model_config = ConfigDict(extra="forbid")

    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    fps: int = Field(15, ge=5, le=30)
    width: int = Field(480, ge=120, le=settings.max_output_width)
    quality: Quality = "balanced"
    speed: float = Field(1.0, ge=0.25, le=3.0)


class GifCreate(RangeSettings):
    source_id: str = Field(max_length=32)
    title: str | None = Field(None, max_length=200)
    slug: str | None = Field(None, max_length=60)


class GifRegenerate(BaseModel):
    """Every field optional: omitted ones keep the GIF's current settings."""

    model_config = ConfigDict(extra="forbid")

    start: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    end: float | None = Field(default=None, gt=0, allow_inf_nan=False)
    fps: int | None = Field(default=None, ge=5, le=30)
    width: int | None = Field(default=None, ge=120, le=settings.max_output_width)
    quality: Quality | None = None
    speed: float | None = Field(default=None, ge=0.25, le=3.0)


class GifPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, max_length=60)  # present + empty/null clears the custom URL


class SourceBrief(BaseModel):
    id: str
    filename: str
    duration: float | None
    width: int | None
    height: int | None
    fps: float | None
    expires_at: datetime | None


class GifOut(BaseModel):
    id: str
    title: str
    slug: str | None
    status: str  # queued | processing | done | failed (of the latest job)
    stage: str
    progress: int
    error: str | None
    has_file: bool  # a GIF is live at the URL, even while a regeneration runs or after one fails
    revision: int
    width: int | None
    height: int | None
    duration_ms: int | None
    size_bytes: int | None
    source_size_bytes: int
    settings: dict
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    expires_at: datetime | None
    url: str  # direct .gif (vanity name if set)
    permanent_url: str  # direct .gif by random id; never changes
    download_url: str
    poster_url: str | None
    share_path: str  # path of the share page on the web origin
    source: SourceBrief | None


class GifList(BaseModel):
    items: list[GifOut]
    total: int
    counts: dict[str, int]  # by job status, across the user's whole library


class SlugCheck(BaseModel):
    slug: str
    available: bool
    reason: str | None = None


class PublicGif(BaseModel):
    """What the public share page may know. No owner information."""

    id: str
    title: str
    slug: str | None
    width: int | None
    height: int | None
    duration_ms: int | None
    size_bytes: int | None
    created_at: datetime
    url: str
    permanent_url: str
    poster_url: str | None
    download_url: str


class PublicConfig(BaseModel):
    public_base_url: str
    max_upload_bytes: int
    chunk_bytes: int
    max_input_duration_s: int  # 0 = any length
    max_input_side_px: int
    min_clip_s: float
    max_clip_s: int
    max_output_width: int
    max_gif_mb: int
    source_retention_hours: int
    slug_min: int
    slug_max: int
    formats: list[str]
