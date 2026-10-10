import secrets
import string
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .config import settings

_ph = PasswordHasher()
_DUMMY_HASH = _ph.hash("dummy-password-for-timing")
ALGO = "HS256"
_ALPHABET = string.ascii_letters + string.digits


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(pw_hash: str | None, pw: str) -> bool:
    """Always does one argon2 verify so unknown emails cost the same as wrong passwords."""
    try:
        return _ph.verify(pw_hash or _DUMMY_HASH, pw) and pw_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def _encode(typ: str, sub: str, ttl: timedelta, **extra: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"typ": typ, "sub": sub, "iat": now, "exp": now + ttl, **extra}, settings.secret_key, algorithm=ALGO)


def _decode(token: str, typ: str) -> dict | None:
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[ALGO], options={"require": ["exp", "sub", "typ"]})
    except jwt.PyJWTError:
        return None
    return claims if claims.get("typ") == typ else None


def create_session_token(user_id: int) -> str:
    return _encode("session", str(user_id), timedelta(days=settings.session_days))


def read_session_token(token: str) -> int | None:
    claims = _decode(token, "session")
    try:
        return int(claims["sub"]) if claims else None
    except ValueError:
        return None


def create_upload_token(user_id: int, source_public_id: str) -> str:
    """Short-lived bearer token that only authorises chunk uploads to one source.

    Chunks go straight to the API origin (the web proxy can't carry large bodies and the session
    cookie is first-party to the web origin), so they authenticate with this token instead.
    """
    return _encode("upload", str(user_id), timedelta(hours=settings.upload_token_hours), sid=source_public_id)


def read_upload_token(token: str, source_public_id: str) -> int | None:
    claims = _decode(token, "upload")
    if not claims or claims.get("sid") != source_public_id:
        return None
    try:
        return int(claims["sub"])
    except ValueError:
        return None


def new_public_id(length: int = 12) -> str:
    """~71 bits of entropy, alphanumeric. Always has an uppercase letter so a random id can never
    equal a vanity slug (slugs are lowercase-only); see services/slugs.py."""
    while True:
        value = "".join(secrets.choice(_ALPHABET) for _ in range(length))
        if any(c.isupper() for c in value):
            return value
