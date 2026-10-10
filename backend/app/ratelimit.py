import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from .config import settings


class RateLimiter:
    """Sliding-window limiter, in-process. Swap for Redis when running more than one API process."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_s: int) -> None:
        now = time.monotonic()
        with self._lock:
            if len(self._hits) > 20000:  # drop idle keys
                for k in [k for k, q in self._hits.items() if not q or q[-1] < now - 3600]:
                    del self._hits[k]
            q = self._hits[key]
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                retry = max(1, int(q[0] + window_s - now))
                raise HTTPException(429, "Too many requests. Try again later.", headers={"Retry-After": str(retry)})
            q.append(now)


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    if settings.trust_proxy:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
