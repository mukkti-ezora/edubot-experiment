"""In-memory fixed-window rate limiter.

MVP-appropriate (single instance per service). Horizontal scale moves this to a
shared store — noted in the architecture tradeoffs.
"""

from __future__ import annotations

import time
from collections import defaultdict


class FixedWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))

    def check(self, key: str, *, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.monotonic()
        count, window_start = self._hits[key]
        if now - window_start > window_seconds:
            count, window_start = 0, now
        count += 1
        self._hits[key] = (count, window_start)
        if count > limit:
            return False, int(window_seconds - (now - window_start))
        return True, 0

    def reset(self, key: str | None = None) -> None:
        if key is None:
            self._hits.clear()
        else:
            self._hits.pop(key, None)
