"""In-process pub/sub feeding SSE /api/stream.

`publish` may be called from any thread (SimChain subscriber callbacks are plain sync callables):
it hops to the bound event loop with call_soon_threadsafe, so asyncio queues are only touched
from the loop thread. Slow subscribers drop events instead of blocking producers.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

EventItem = tuple[str, dict[str, Any]]


class EventBus:
    def __init__(self, queue_size: int = 1000) -> None:
        self._subs: set[asyncio.Queue[EventItem]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._queue_size = queue_size

    def bind_loop(self, loop: asyncio.AbstractEventLoop | None) -> None:
        self._loop = loop

    def subscribe(self) -> asyncio.Queue[EventItem]:
        q: asyncio.Queue[EventItem] = asyncio.Queue(self._queue_size)
        self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[EventItem]) -> None:
        self._subs.discard(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)

    def publish(self, event_type: str, data: dict[str, Any]) -> None:
        item = (event_type, data)
        try:
            running: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        loop = self._loop
        if loop is not None and running is not loop and not loop.is_closed():
            loop.call_soon_threadsafe(self._fanout, item)
        else:
            self._fanout(item)

    def _fanout(self, item: EventItem) -> None:
        for q in list(self._subs):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait(item)
