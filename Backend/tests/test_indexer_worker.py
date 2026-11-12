"""IDX-001 unit tests: the indexer over a fake log source (no chain needed)."""

from __future__ import annotations

import random
import threading
import time

import pytest

from guardian.chain.base import ChainEvent
from guardian.workers.indexer import Indexer, InMemoryEventSink


def ev(block: int, idx: int = 0, name: str = "Paid", tx: str | None = None) -> ChainEvent:
    return ChainEvent(
        name, block, tx or f"0x{block:04x}{idx:02x}", idx, {"n": block}, block * 10, False
    )


class FakeSource:
    def __init__(self, events: list[ChainEvent], head: int, start: int = 0):
        self.events = list(events)
        self.chain_head = head
        self.start_block = start
        self.fail = False
        self.ranges: list[tuple[int, int]] = []

    def head(self) -> int:
        if self.fail:
            raise ConnectionError("rpc down")
        return self.chain_head

    def events_between(self, first: int, last: int) -> list[ChainEvent]:
        self.ranges.append((first, last))
        return sorted(
            (e for e in self.events if first <= e.block <= last),
            key=lambda e: (e.block, e.log_index),
        )


def test_backfill_from_start_block_on_empty_sink() -> None:
    src = FakeSource([ev(3), ev(5, 0), ev(5, 1)], head=6, start=2)
    sink = InMemoryEventSink()
    new = Indexer(src, sink).sync_once()
    assert [(e.block, e.log_index) for e in new] == [(3, 0), (5, 0), (5, 1)]
    assert src.ranges == [(2, 6)]
    assert sink.last_block() == 6


def test_running_twice_leaves_no_duplicates_and_publishes_once() -> None:
    src = FakeSource([ev(1), ev(2), ev(3)], head=3)
    sink, published = InMemoryEventSink(), []
    idx = Indexer(src, sink, publish=published.append)
    assert len(idx.sync_once()) == 3
    assert idx.sync_once() == []
    assert len(sink) == 3
    assert len(published) == 3


def test_duplicate_logs_from_the_source_are_written_once() -> None:
    e = ev(1)
    src = FakeSource([e, e, e], head=1)
    sink = InMemoryEventSink()
    assert len(Indexer(src, sink).sync_once()) == 1
    assert len(sink) == 1


def test_out_of_order_source_is_stored_in_chain_order() -> None:
    events = [ev(b, i) for b in (1, 2, 3) for i in (0, 1)]
    shuffled = events[:]
    random.Random(7).shuffle(shuffled)

    class Shuffled(FakeSource):
        def events_between(self, first: int, last: int) -> list[ChainEvent]:
            return [e for e in shuffled if first <= e.block <= last]

    sink = InMemoryEventSink()
    Indexer(Shuffled(events, 3), sink).sync_once()
    assert sink.all() == events


def test_restart_resumes_from_saved_block_minus_window() -> None:
    src = FakeSource([ev(b) for b in range(1, 21)], head=20)
    sink = InMemoryEventSink()
    Indexer(src, sink, reorg_window=5).sync_once()
    src.ranges.clear()
    src.events.append(ev(25))
    src.chain_head = 25
    new = Indexer(src, sink, reorg_window=5).sync_once()  # a fresh process, same sink
    assert [e.block for e in new] == [25]
    assert src.ranges == [(16, 25)]  # saved 20, window 5 -> re-read 16..25
    assert len(sink) == 21 and sink.last_block() == 25


def test_rebuild_from_scratch_equals_original() -> None:
    events = [ev(b, i, name=f"E{b}{i}") for b in range(1, 8) for i in range(3)]
    src = FakeSource(events, head=7)
    first, second = InMemoryEventSink(), InMemoryEventSink()
    Indexer(src, first).sync_once()
    Indexer(src, second).sync_once()  # "DB wipe": brand-new sink
    assert second.all() == first.all() == events


def test_reorg_inside_window_replaces_stale_events() -> None:
    src = FakeSource([ev(1), ev(2), ev(3, tx="0xold"), ev(4)], head=4)
    sink = InMemoryEventSink()
    idx = Indexer(src, sink, reorg_window=3)
    idx.sync_once()
    # blocks 3-4 reorged: the old tx vanished, another one landed in 3, tx of block 4 moved to 5
    src.events = [ev(1), ev(2), ev(3, tx="0xnew"), ev(5, tx=ev(4).tx_hash)]
    src.chain_head = 5
    new = idx.sync_once()
    assert {(e.block, e.tx_hash) for e in sink.all()} == {
        (1, ev(1).tx_hash),
        (2, ev(2).tx_hash),
        (3, "0xnew"),
        (5, ev(4).tx_hash),
    }
    assert {e.tx_hash for e in new} == {"0xnew", ev(4).tx_hash}


def test_events_older_than_the_window_are_not_touched() -> None:
    src = FakeSource([ev(1), ev(10)], head=10)
    sink = InMemoryEventSink()
    idx = Indexer(src, sink, reorg_window=2)
    idx.sync_once()
    src.events = [ev(10)]  # block 1 "changed" but is deeper than the window
    idx.sync_once()
    assert len(sink) == 2


def test_confirmations_hold_back_recent_blocks() -> None:
    src = FakeSource([ev(1), ev(9), ev(10)], head=10)
    sink = InMemoryEventSink()
    idx = Indexer(src, sink, confirmations=2)
    idx.sync_once()
    assert [e.block for e in sink.all()] == [1]
    assert sink.last_block() == 8
    assert idx.status().lag_blocks == 2


def test_failed_cycle_keeps_cursor_and_nothing_is_lost() -> None:
    src = FakeSource([ev(1), ev(2)], head=2)
    sink = InMemoryEventSink()
    idx = Indexer(src, sink)
    idx.sync_once()
    src.events.append(ev(3))
    src.chain_head = 3
    src.fail = True
    with pytest.raises(ConnectionError):
        idx.sync_once()
    assert sink.last_block() == 2
    src.fail = False
    assert [e.block for e in idx.sync_once()] == [3]
    assert len(sink) == 3


def test_source_error_mid_range_does_not_advance_cursor() -> None:
    class Flaky(FakeSource):
        logs_fail = False

        def events_between(self, first: int, last: int) -> list[ChainEvent]:
            if self.logs_fail:
                raise TimeoutError("get_logs")
            return super().events_between(first, last)

    src = Flaky([ev(1), ev(2)], head=2)
    src.logs_fail = True
    sink = InMemoryEventSink()
    idx = Indexer(src, sink)
    with pytest.raises(TimeoutError):
        idx.sync_once()
    assert sink.last_block() is None and len(sink) == 0
    src.logs_fail = False
    assert len(idx.sync_once()) == 2


def test_status_reports_head_cursor_and_lag() -> None:
    src = FakeSource([ev(1)], head=4)
    idx = Indexer(src, InMemoryEventSink(), confirmations=1)
    assert idx.status().lag_blocks is None
    idx.sync_once()
    st = idx.status()
    assert (st.last_block_l1, st.head_l1, st.lag_blocks, st.last_block_c) == (3, 4, 1, None)
    assert st.updated_at is not None and st.last_error is None


def test_publish_failure_does_not_break_indexing() -> None:
    def boom(_: ChainEvent) -> None:
        raise RuntimeError("bus down")

    src = FakeSource([ev(1), ev(2)], head=2)
    sink = InMemoryEventSink()
    assert len(Indexer(src, sink, publish=boom).sync_once()) == 2
    assert len(sink) == 2


def test_run_loop_recovers_after_errors_and_stops_gracefully() -> None:
    src = FakeSource([ev(1)], head=1)
    src.fail = True
    sink = InMemoryEventSink()
    idx = Indexer(src, sink, poll_interval=0.01, max_backoff=0.05)
    idx.start()
    deadline = time.time() + 3
    while idx.status().last_error is None and time.time() < deadline:
        time.sleep(0.01)
    assert idx.status().last_error and "rpc down" in idx.status().last_error
    src.fail = False
    src.events.append(ev(2))
    src.chain_head = 2
    while len(sink) < 2 and time.time() < deadline:
        time.sleep(0.01)
    idx.stop()
    assert len(sink) == 2 and sink.last_block() == 2
    assert all(t.name != "indexer" for t in threading.enumerate())


def test_invalid_window_rejected() -> None:
    with pytest.raises(ValueError):
        Indexer(FakeSource([], 0), InMemoryEventSink(), reorg_window=0)
