from datetime import datetime, timezone


def is_expired(expires_at: datetime | None) -> bool:
    """Compare expiry timestamps consistently across PostgreSQL and SQLite.

    SQLite drops timezone information from DateTime columns; interpret those naive values as UTC.
    """
    if expires_at is None:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= datetime.now(timezone.utc)