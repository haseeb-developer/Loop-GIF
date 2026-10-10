"""Idempotent schema upgrades for databases created by an earlier version.

`Base.metadata.create_all` creates missing tables (e.g. `sources`) but never alters existing ones,
so new columns on `gifs` are added here. Every statement is safe to run on every startup.
Replace with Alembic once the schema starts changing regularly.
"""
from sqlalchemy import text
from sqlalchemy.engine import Engine

STATEMENTS = [
    "ALTER TABLE gifs ADD COLUMN IF NOT EXISTS source_id BIGINT REFERENCES sources(id) ON DELETE SET NULL",
    "ALTER TABLE gifs ADD COLUMN IF NOT EXISTS slug VARCHAR(40)",
    "ALTER TABLE gifs ADD COLUMN IF NOT EXISTS stage VARCHAR(16) NOT NULL DEFAULT 'done'",
    "ALTER TABLE gifs ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE gifs ADD COLUMN IF NOT EXISTS pending_settings JSONB",
    "ALTER TABLE gifs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
    "ALTER TABLE gifs ALTER COLUMN source_size_bytes SET DEFAULT 0",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_gifs_slug ON gifs (slug)",
    "CREATE INDEX IF NOT EXISTS ix_gifs_source_id ON gifs (source_id)",
    "CREATE INDEX IF NOT EXISTS ix_gifs_user_updated ON gifs (user_id, updated_at)",
]


def run(engine: Engine) -> None:
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            conn.execute(text(stmt))
