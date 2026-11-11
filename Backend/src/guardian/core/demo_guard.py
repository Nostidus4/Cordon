"""DEMO_MODE guard for signing endpoints: mode check, in-memory rate limit, audit log (spec §8.6)."""

from __future__ import annotations

import logging
import time
from collections import deque
from collections.abc import Callable
from typing import Any

from guardian.core.config import Settings
from guardian.core.errors import ApiError

log = logging.getLogger("guardian.demo_guard")
WINDOW_SECONDS = 60.0


class DemoGuard:
    def __init__(self, settings: Settings, clock: Callable[[], float] = time.monotonic) -> None:
        self.settings = settings
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self.audit: list[dict[str, Any]] = []

    def check(self, action: str, client: str, path: str = "", method: str = "POST") -> None:
        """Raise ApiError 403 (not demo) / 429 (rate limit); otherwise append an audit entry."""
        if not self.settings.demo_enabled:
            raise ApiError(403, "DEMO_MODE_REQUIRED", "Chức năng này chỉ có ở chế độ demo.")
        now = self._clock()
        q = self._hits.setdefault(client, deque())
        while q and now - q[0] > WINDOW_SECONDS:
            q.popleft()
        if len(q) >= self.settings.rate_limit_per_minute:
            raise ApiError(429, "RATE_LIMITED", "Quá nhiều yêu cầu ký, vui lòng thử lại sau.")
        q.append(now)
        entry = {
            "ts": int(time.time()),
            "action": action,
            "client": client,
            "path": path,
            "method": method,
        }
        self.audit.append(entry)
        log.info("demo-sign %s", entry)
