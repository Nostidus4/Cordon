"""Liveness signals for /api/health: L1 block stall, event->SSE latency (API-004), worker heartbeat (API-006)."""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from typing import Any

HEARTBEAT_SECONDS = 5  # worker writes meta.worker_heartbeat_at this often (issue: N <= 10)


def worker_status(
    now: float, last_heartbeat: int | None, has_db: bool, every: float = HEARTBEAT_SECONDS
) -> str:
    """ "unknown" without a shared DB; "stale" when no heartbeat for 3x the interval (or never)."""
    if not has_db:
        return "unknown"
    if last_heartbeat is None or now - last_heartbeat > 3 * every:
        return "stale"
    return "running"


class BlockWatch:
    """Remembers when the observed L1 head last changed. `stall_after=None` disables the stall."""

    def __init__(self, clock: Callable[[], float], stall_after: float | None = 60.0) -> None:
        self.clock = clock
        self.stall_after = stall_after
        self._head: int | None = None
        self._advanced_at: float | None = None

    def observe(self, head: int) -> None:
        if head != self._head:
            self._head, self._advanced_at = head, self.clock()

    @property
    def last_block_at(self) -> int | None:
        return None if self._advanced_at is None else int(self._advanced_at)

    @property
    def stalled(self) -> bool:
        if self.stall_after is None or self._advanced_at is None:
            return False
        return self.clock() - self._advanced_at >= self.stall_after


class LatencyStats:
    """Last `window` event->SSE fan-out durations."""

    def __init__(self, window: int = 100) -> None:
        self._samples: deque[float] = deque(maxlen=window)

    def record(self, seconds: float) -> None:
        self._samples.append(seconds)

    def out(self) -> dict[str, Any]:
        s = list(self._samples)
        return {
            "lastMs": round(s[-1] * 1000, 1) if s else None,
            "maxMs": round(max(s) * 1000, 1) if s else None,
            "samples": len(s),
        }
