from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, Index, Integer, JSON, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

ID_TYPE = BigInteger().with_variant(Integer, "sqlite")
JSON_TYPE = JSON().with_variant(JSONB(), "postgresql")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    gifs: Mapped[list["Gif"]] = relationship(back_populates="owner", cascade="all, delete-orphan", passive_deletes=True)
    sources: Mapped[list["Source"]] = relationship(cascade="all, delete-orphan", passive_deletes=True)


class Source(Base):
    """An uploaded video. Kept for a while after use so GIFs can be edited and regenerated."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)  # internal only
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(BigInteger)  # declared total size
    status: Mapped[str] = mapped_column(String(12), index=True, default="uploading")  # uploading|probing|ready|failed
    error: Mapped[str | None] = mapped_column(Text)
    storage_name: Mapped[str] = mapped_column(String(64), unique=True)  # file name inside SOURCE_DIR

    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    fps: Mapped[float | None] = mapped_column(Float)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class Gif(Base):
    __tablename__ = "gifs"
    __table_args__ = (Index("ix_gifs_user_updated", "user_id", "updated_at"),)

    id: Mapped[int] = mapped_column(ID_TYPE, primary_key=True)  # internal only, never exposed
    public_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # permanent random URL id
    slug: Mapped[str | None] = mapped_column(String(40), unique=True, index=True)  # optional vanity URL name
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    original_filename: Mapped[str] = mapped_column(String(255))

    # Job state. A GIF with storage_key set keeps serving while a regeneration runs or fails.
    status: Mapped[str] = mapped_column(String(12), index=True, default="queued")  # queued|processing|done|failed
    stage: Mapped[str] = mapped_column(String(16), default="queued")  # queued|analyzing|encoding|finalizing|done|failed
    progress: Mapped[int] = mapped_column(SmallInteger, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(Integer, default=1)

    settings: Mapped[dict] = mapped_column(JSON_TYPE)  # settings of the file currently served
    pending_settings: Mapped[dict | None] = mapped_column(JSON_TYPE)  # settings of the running/failed job
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    source_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

    storage_key: Mapped[str | None] = mapped_column(String(255))
    poster_key: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # reserved: NULL = permanent

    owner: Mapped[User] = relationship(back_populates="gifs")
