"""Index Guardian L1 events -> `EventSink` -> SSE; idempotent by (tx_hash, log_index) (IDX-001).

Each cycle re-reads a window of the last `reorg_window` blocks before the saved cursor, so a shallow
reorg is repaired (stale events removed, moved ones rewritten) and a failed cycle loses nothing:
the cursor (`meta.last_block_l1`) only advances after the events up to it were written. An empty
sink is rebuilt by replaying from the deployment block. Only events that were new to the sink are
published to the SSE bus, so re-reading a block never produces duplicates on the stream.

The source is read over HTTP, so "reconnect" is: any RPC error leaves the cursor untouched and the
next cycle retries after a back-off. An optional `LogWatcher` (websocket `eth_subscribe("logs")`, IDX-002)
only wakes the loop early; polling stays the safety net and takes over at the normal interval whenever
the socket is down. A second `Indexer` with `label="c"` follows the C-Chain top-up transfer (its cursor
is `meta.last_block_c`, reported as `IndexerStatus.last_block_c`).

Bounded cycles (`max_blocks_per_cycle`, opt-in; the C-Chain indexer uses it): one cycle reads at most that many
blocks and saves the cursor after every chunk the source yields (`event_chunks`), so a long backfill is spread over
cycles that run back to back and an error halfway keeps the chunks already written. An HTTP 429 / JSON-RPC rate
limit is not a failure: the cycle stops, keeps its progress and the loop waits 2s, 4s ... up to 60s (reset by the
next clean cycle); `IndexerStatus.rate_limited` is True meanwhile and `last_error` stays None.
"""

from __future__ import annotations

import logging
import signal
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any, Protocol

from guardian.chain.base import ChainEvent

log = logging.getLogger(__name__)

EventKey = tuple[str, int]  # (tx_hash, log_index)

RATE_LIMIT_BASE_S = 2.0
RATE_LIMIT_MAX_S = 60.0


def is_rate_limited(exc: BaseException) -> bool:
    """HTTP 429 (requests `HTTPError`) or a JSON-RPC rate-limit answer (-32005, "rate limit", "too many requests")."""
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        resp = getattr(cur, "response", None)
        if getattr(resp, "status_code", None) == 429:
            return True
        text = (" ".join(str(a) for a in cur.args) + " " + str(cur)).lower()
        if "too many requests" in text or "rate limit" in text or "-32005" in text:
            return True
        cur = cur.__cause__ or cur.__context__
    return False


class EventSink(Protocol):
    """Where the indexer writes (API_CONTRACT §8; defined here until API-001 lands it).

    `write` and `last_block` are the two frozen methods; the other three are what the reorg window
    and the cursor need and map onto one SQL statement each in the Postgres sink (DB-002).
    """

    def write(self, event: ChainEvent) -> bool:
        """Insert if (tx_hash, log_index) is unseen; True when inserted, False when a duplicate."""
        ...

    def last_block(self) -> int | None:
        """`meta.last_block_l1`; None while nothing was indexed (triggers the backfill)."""
        ...

    def set_last_block(self, block: int) -> None: ...

    def events_in_range(self, first: int, last: int) -> list[ChainEvent]: ...

    def remove(self, tx_hash: str, log_index: int) -> bool: ...


class InMemoryEventSink:
    """Reference sink for tests and the in-process worker. Reads are ordered by (block, log_index)."""

    def __init__(self) -> None:
        self._rows: dict[EventKey, ChainEvent] = {}
        self._last_block: int | None = None
        self._lock = threading.Lock()

    def write(self, event: ChainEvent) -> bool:
        key = (event.tx_hash, event.log_index)
        with self._lock:
            if key in self._rows:
                return False
            self._rows[key] = event
            return True

    def last_block(self) -> int | None:
        return self._last_block

    def set_last_block(self, block: int) -> None:
        self._last_block = block

    def events_in_range(self, first: int, last: int) -> list[ChainEvent]:
        return [e for e in self.all() if first <= e.block <= last]

    def remove(self, tx_hash: str, log_index: int) -> bool:
        with self._lock:
            return self._rows.pop((tx_hash, log_index), None) is not None

    def all(self) -> list[ChainEvent]:
        with self._lock:
            return sorted(self._rows.values(), key=lambda e: (e.block, e.log_index))

    def __len__(self) -> int:
        return len(self._rows)


class LogSource(Protocol):
    """A chain the indexer follows (L1 today)."""

    start_block: int  # first block to index when the sink is empty (deployment block)

    def head(self) -> int: ...

    def events_between(self, first: int, last: int) -> list[ChainEvent]:
        """Decoded events with first <= block <= last, ordered by (block, log_index)."""
        ...


class L1ChainSource:
    """`LogSource` over `L1Chain` (uses its public `events_since` and the deployment block)."""

    def __init__(self, chain: Any) -> None:
        self._chain = chain
        self.start_block = int(chain.dep.deploy_block)

    def log_params(self) -> dict[str, Any]:
        """`eth_subscribe("logs")` filter for the websocket watcher (same contracts `events_since` reads)."""
        return {"address": list(self._chain._log_addresses)}

    def head(self) -> int:
        return int(self._chain.w3.eth.block_number)

    def events_between(self, first: int, last: int) -> list[ChainEvent]:
        return [e for e in self._chain.events_since(first - 1) if e.block <= last]


@dataclass(frozen=True)
class IndexerStatus:
    """What `/api/health` reads: `lag_blocks = head - last_block_l1`. For a `label="c"` indexer the cursor
    and head are reported in `last_block_c` / `head_c` and the L1 fields are None."""

    last_block_l1: int | None
    head_l1: int | None
    last_block_c: int | None
    last_error: str | None
    updated_at: float | None  # time.time() of the last successful cycle
    head_c: int | None = None
    ws_connected: bool | None = None  # None: no websocket source configured
    rate_limited: bool = False  # the RPC answered 429 / rate limit; backing off, not an error

    @property
    def lag_blocks(self) -> int | None:
        if self.last_block_l1 is None or self.head_l1 is None:
            return None
        return max(self.head_l1 - self.last_block_l1, 0)


class Indexer:
    def __init__(
        self,
        source: LogSource,
        sink: EventSink,
        *,
        publish: Callable[[ChainEvent], None] | None = None,
        poll_interval: float = 2.0,
        reorg_window: int = 5,
        confirmations: int = 0,
        max_backoff: float = 30.0,
        label: str = "l1",
        watcher: Any = None,
        ws_idle_interval: float = 15.0,
        max_blocks_per_cycle: int | None = None,
    ) -> None:
        if reorg_window < 1:
            raise ValueError("reorg_window must be >= 1")
        self.source, self.sink = source, sink
        self._publish = publish
        self._poll_interval = poll_interval
        self._window = reorg_window
        self._confirmations = max(confirmations, 0)
        self._max_backoff = max_backoff
        self.label = label
        self._watcher = watcher
        self._ws_idle = max(ws_idle_interval, poll_interval)
        self._max_blocks = (
            None if max_blocks_per_cycle is None else max(max_blocks_per_cycle, reorg_window + 1)
        )
        self._rl_step = 0  # consecutive rate-limited cycles
        self._more = False  # the last cycle stopped short of the target: run the next one at once
        self._wake = threading.Event()
        if watcher is not None:
            watcher.wake = self._wake
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._head: int | None = None
        self._error: str | None = None
        self._updated: float | None = None

    # ------------------------------------------------------------------ one cycle
    def sync_once(self) -> list[ChainEvent]:
        """One poll cycle. Returns the events that were new to the sink, oldest first.

        With `max_blocks_per_cycle` it reads at most that many blocks and saves the cursor after each chunk.
        A rate limit ends the cycle cleanly (progress kept, `rate_limited` set); other errors propagate."""
        new: list[ChainEvent] = []
        try:
            self._cycle(new)
            self._rl_step = 0
            self._error, self._updated = None, time.time()
        except Exception as exc:
            if not is_rate_limited(exc):
                raise
            self._rl_step += 1
            self._more = False
        finally:
            for ev in new:  # after the cursor is saved; a failing subscriber must not undo indexing
                self._emit(ev)
        return new

    @property
    def rate_limited(self) -> bool:
        return self._rl_step > 0

    def _rate_limit_delay(self) -> float:
        return min(RATE_LIMIT_BASE_S * 2 ** (self._rl_step - 1), RATE_LIMIT_MAX_S)

    def _cycle(self, new: list[ChainEvent]) -> None:
        head = self.source.head()
        self._head = head
        target = head - self._confirmations
        saved = self.sink.last_block()
        start = self.source.start_block
        if saved is None:
            first = start  # empty store: rebuild from the deployment block
        else:
            first = max(start, min(saved, target) - self._window + 1)
        end = target if self._max_blocks is None else min(target, first + self._max_blocks - 1)
        self._more = end < target
        if first > target:
            return
        for lo, hi, fresh in self._chunks(first, end):
            self._repair_window(lo, hi, fresh)
            for ev in fresh:
                if self.sink.write(ev):
                    new.append(ev)
            self.sink.set_last_block(hi)

    def _chunks(self, first: int, last: int) -> Iterator[tuple[int, int, list[ChainEvent]]]:
        chunks = getattr(self.source, "event_chunks", None)
        if chunks is not None:
            yield from chunks(first, last)
        else:
            yield first, last, self.source.events_between(first, last)

    def _repair_window(self, first: int, last: int, fresh: list[ChainEvent]) -> None:
        """Drop stored events in [first, last] that the chain no longer reports as they were."""
        keep = {(e.tx_hash, e.log_index): e for e in fresh}
        for old in self.sink.events_in_range(first, last):
            key = (old.tx_hash, old.log_index)
            if keep.get(key) != old:
                self.sink.remove(*key)
                log.warning("reorg: dropped %s %s:%s", old.name, old.tx_hash, old.log_index)

    def _emit(self, ev: ChainEvent) -> None:
        if self._publish is None:
            return
        try:
            self._publish(ev)
        except Exception:
            log.exception("indexer publish failed")

    def status(self) -> IndexerStatus:
        ws = None if self._watcher is None else bool(self._watcher.connected)
        cursor = self.sink.last_block()
        if self.label == "c":
            return IndexerStatus(
                None, None, cursor, self._error, self._updated, self._head, ws, self.rate_limited
            )
        return IndexerStatus(
            cursor, self._head, None, self._error, self._updated, None, ws, self.rate_limited
        )

    # ------------------------------------------------------------------ loop
    def run(self, stop: threading.Event | None = None) -> None:
        """Poll until stopped. RPC errors back off exponentially and never advance the cursor."""
        stop = stop or self._stop
        failures = 0
        if self._watcher is not None:
            self._watcher.start()
        try:
            while not stop.is_set():
                self._wake.clear()  # a wake that arrives during the cycle makes the next wait return at once
                try:
                    self.sync_once()
                    failures = 0
                    live = self._watcher is not None and self._watcher.connected
                    if self._rl_step:  # rate limited: progress kept, wait 2s, 4s ... 60s
                        delay = self._rate_limit_delay()
                        log.warning(
                            "indexer %s rate limited by the RPC (step %d), next cycle in %.0fs",
                            self.label,
                            self._rl_step,
                            delay,
                        )
                    elif self._more:  # bounded cycle: more blocks behind the target, go on at once
                        delay = 0.0
                    else:
                        delay = self._ws_idle if live else self._poll_interval
                except Exception as exc:  # noqa: BLE001 (any RPC or decode error: retry)
                    failures += 1
                    self._more = False
                    self._error = f"{type(exc).__name__}: {exc}"
                    delay = min(self._poll_interval * 2**failures, self._max_backoff)
                    log.warning(
                        "indexer %s cycle failed (%d): %s", self.label, failures, self._error
                    )
                self._sleep(delay, stop, wakeable=failures == 0 and not self._rl_step)
        finally:
            if self._watcher is not None:
                self._watcher.stop()

    def _sleep(self, delay: float, stop: threading.Event, wakeable: bool = True) -> None:
        """Wait up to `delay`, or until the websocket wakes us (not while failing), or `stop` is set."""
        deadline = time.monotonic() + delay
        while not stop.is_set():
            left = deadline - time.monotonic()
            if left <= 0:
                return
            if wakeable and self._wake.wait(min(left, 0.5)):
                return
            if not wakeable:
                stop.wait(min(left, 0.5))

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self.run, name="indexer", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 10.0) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout)


def l1_watcher(settings: Any, source: L1ChainSource) -> Any:
    """Websocket wake-up for the L1 source when `L1_WS_URL` is set (polling stays the fallback)."""
    if not getattr(settings, "l1_ws_url", ""):
        return None
    from guardian.workers.ws_source import LogWatcher

    return LogWatcher(settings.l1_ws_url, source.log_params())


def build_indexer(
    settings: Any,
    sink: EventSink | None = None,
    publish: Callable[[ChainEvent], None] | None = None,
) -> Indexer:
    """`CHAIN_MODE=l1`: L1Chain from settings + sink (in-memory until DB-002 provides Postgres)."""
    from guardian.chain.l1 import L1Chain

    if settings.chain_mode != "l1":
        raise RuntimeError("the indexer follows a real chain: set CHAIN_MODE=l1")
    source = L1ChainSource(L1Chain.from_settings(settings))
    return Indexer(
        source,
        sink if sink is not None else InMemoryEventSink(),
        watcher=l1_watcher(settings, source),
        publish=publish,
        poll_interval=settings.l1_poll_interval_seconds,
        reorg_window=settings.indexer_reorg_window,
        confirmations=settings.indexer_confirmations,
    )


def run_indexer(settings: Any, sink: EventSink | None = None) -> None:
    """Blocking entrypoint with graceful shutdown on SIGINT/SIGTERM (cursor is saved every cycle)."""
    indexer = build_indexer(settings, sink)
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    log.info("indexer started (poll %.1fs)", settings.l1_poll_interval_seconds)
    indexer.run(stop)
    log.info("indexer stopped at block %s", indexer.sink.last_block())
