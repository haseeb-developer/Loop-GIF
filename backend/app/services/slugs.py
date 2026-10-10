"""Vanity URL names (e.g. cat_edit). Global namespace, first come first served.

Slugs are lowercase-only and random public ids always contain an uppercase letter, so the two
can never collide and `/g/<name>` resolves unambiguously.
"""
import re

SLUG_MIN, SLUG_MAX = 3, 40
_RE = re.compile(r"^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$")
RESERVED = {
    "api", "g", "gif", "gifs", "new", "edit", "login", "logout", "signup", "register", "dashboard", "library",
    "admin", "root", "static", "assets", "public", "settings", "account", "profile", "me", "app", "www", "help",
    "support", "about", "terms", "privacy", "health", "healthz", "status", "null", "undefined", "download",
    "share", "embed", "upload", "uploads", "source", "sources", "favicon", "robots", "sitemap", "icon",
}


class SlugError(ValueError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def validate_slug(raw: str | None) -> str | None:
    """Return the normalised slug, or None when the input is empty (meaning: no custom URL)."""
    if raw is None:
        return None
    slug = raw.strip().lower()
    if not slug:
        return None
    if len(slug) < SLUG_MIN or len(slug) > SLUG_MAX:
        raise SlugError(f"Use {SLUG_MIN} to {SLUG_MAX} characters.")
    if not _RE.match(slug):
        raise SlugError("Use letters, numbers, hyphens and underscores. Start and end with a letter or number.")
    if slug in RESERVED:
        raise SlugError("That name is reserved. Try another.")
    return slug
