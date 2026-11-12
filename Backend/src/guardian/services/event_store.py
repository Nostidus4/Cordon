"""EventSink (the indexer writes) and EventStore (GET /api/events reads), API-001.

An L1 indexer implements/uses `EventSink`; the API only needs `EventStore`. The in-memory
implementation below backs both today; a DB-backed one replaces it without touching callers.
"""

from __future__ import annotations

from typing import Literal, Protocol

from guardian.chain.base import ChainEvent

Source = Literal["l1", "c"]


class EventSink(Protocol):
    """Write side, used by the indexer."""

    def write(self, ev: ChainEvent) -> bool:
        """Store one event. Idempotent on `(tx_hash, log_index)`: returns False (and stores
        nothing) if that key is already stored, True otherwise."""
        ...

    def last_block(self, source: Source) -> int:
        """Last block fully indexed for `source` (0 if none)."""
        ...

    def set_last_block(self, source: Source, block: int) -> None:
        """Record indexer progress for `source`."""
        ...


class EventStore(Protocol):
    """Read side, used by the API."""

    def list(
        self, since_block: int = 0, limit: int = 200, name: str | None = None
    ) -> list[ChainEvent]:
        """Events with `block > since_block`, oldest first (block, log_index), at most `limit`,
        optionally only those named `name`."""
        ...


class InMemoryEventStore:
    """Implements both `EventSink` and `EventStore`."""

    def __init__(self) -> None:
        self.clear()

    def clear(self) -> None:
        self._events: dict[tuple[str, int], ChainEvent] = {}
        self._last: dict[str, int] = {}

    def write(self, ev: ChainEvent) -> bool:
        key = (ev.tx_hash, ev.log_index)
        if key in self._events:
            return False
        self._events[key] = ev
        return True

    def last_block(self, source: Source) -> int:
        return self._last.get(source, 0)

    def set_last_block(self, source: Source, block: int) -> None:
        self._last[source] = block

    def list(
        self, since_block: int = 0, limit: int = 200, name: str | None = None
    ) -> list[ChainEvent]:
        out = sorted(
            (
                e
                for e in self._events.values()
                if e.block > since_block and (name is None or e.name == name)
            ),
            key=lambda e: (e.block, e.log_index),
        )
        return out[:limit]
