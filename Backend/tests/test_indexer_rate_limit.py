"""Bounded indexer cycles, cursor per chunk and 429 back-off (no network)."""

from __future__ import annotations

import threading
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
import requests

from guardian.chain.base import ChainEvent
from guardian.chain.cchain import CChainDeployment, CChainSource
from guardian.workers.indexer import Indexer, InMemoryEventSink, is_rate_limited


def ev(block: int) -> ChainEvent:
    return ChainEvent("Paid", block, f"0x{block:064x}", 0, {"n": block}, block, False)


def http_429() -> requests.HTTPError:
    r = requests.Response()
    r.status_code = 429
    return requests.HTTPError("429 Client Error: Too Many Requests for url: https://x", response=r)


class ChunkSource:
    """Chunked fake source (like CChainSource.event_chunks); raises 429 on the calls listed in `fail_on`."""

    def __init__(self, events: list[ChainEvent], head: int, chunk: int = 100) -> None:
        self.events, self.chain_head, self.chunk = events, head, chunk
        self.start_block = 0
        self.calls = 0
        self.fail_on: set[int] = set()
        self.ranges: list[tuple[int, int]] = []

    def head(self) -> int:
        return self.chain_head

    def event_chunks(self, first: int, last: int) -> Iterator[tuple[int, int, list[ChainEvent]]]:
        lo = first
        while lo <= last:
            hi = min(lo + self.chunk - 1, last)
            self.calls += 1
            if self.calls in self.fail_on:
                raise http_429()
            self.ranges.append((lo, hi))
            yield lo, hi, [e for e in self.events if lo <= e.block <= hi]
            lo = hi + 1

    def events_between(self, first: int, last: int) -> list[ChainEvent]:
        return [e for _, _, evs in self.event_chunks(first, last) for e in evs]


def test_is_rate_limited() -> None:
    assert is_rate_limited(http_429())
    assert is_rate_limited(ValueError({"code": -32005, "message": "request rate limit reached"}))
    assert not is_rate_limited(RuntimeError("wrapped"))
    try:
        try:
            raise http_429()
        except Exception as inner:
            raise RuntimeError("web3 failed") from inner
    except RuntimeError as outer:
        assert is_rate_limited(outer)
    assert not is_rate_limited(ConnectionError("rpc down"))


def test_429_keeps_progress_cursor_at_last_written_chunk_and_resumes() -> None:
    events = [ev(b) for b in (10, 150, 250, 350, 450)]
    src = ChunkSource(events, head=499)
    src.fail_on = {
        4
    }  # chunks 0-99, 100-199, 200-299 written; the 4th call (300-399) is rate limited
    sink, published = InMemoryEventSink(), []
    idx = Indexer(src, sink, publish=published.append, reorg_window=5)
    new = idx.sync_once()  # no exception: a clean stop
    assert sink.last_block() == 299
    assert [e.block for e in new] == [10, 150, 250]
    assert idx.status().rate_limited and idx.status().last_error is None
    assert [e.block for e in published] == [10, 150, 250]

    new2 = idx.sync_once()
    assert sink.last_block() == 499
    assert [e.block for e in new2] == [350, 450]  # no duplicates of 10/150/250
    assert [e.block for e in sink.all()] == [10, 150, 250, 350, 450]
    assert [e.block for e in published] == [10, 150, 250, 350, 450]
    assert not idx.status().rate_limited
    assert src.ranges[3][0] == 295  # resumed inside the reorg window of the saved cursor


def test_429_on_the_first_chunk_leaves_cursor_unset() -> None:
    src = ChunkSource([ev(1)], head=50)
    src.fail_on = {1}
    sink = InMemoryEventSink()
    idx = Indexer(src, sink)
    assert idx.sync_once() == []
    assert sink.last_block() is None and idx.rate_limited


def test_bounded_cycles_cover_a_long_range_without_gap_and_publish_once() -> None:
    events = [ev(b) for b in range(0, 2700, 37)]
    src = ChunkSource(events, head=2699, chunk=100)
    sink, published = InMemoryEventSink(), []
    idx = Indexer(src, sink, publish=published.append, reorg_window=5, max_blocks_per_cycle=1000)
    cycles, cursors = 0, []
    while True:
        idx.sync_once()
        cycles += 1
        cursors.append(sink.last_block())
        if not idx._more:
            break
        assert cycles < 10
    assert cycles == 3 and cursors == sorted(cursors) and cursors[-1] == 2699
    assert max(hi - lo + 1 for lo, hi in src.ranges) <= 100
    assert [e.block for e in sink.all()] == [e.block for e in events]
    assert [e.block for e in published] == [e.block for e in events]  # each published once
    covered: set[int] = set()
    for lo, hi in src.ranges:
        covered.update(range(lo, hi + 1))
    assert covered == set(range(2700))  # no gap


def test_max_blocks_floor_is_above_the_reorg_window() -> None:
    src = ChunkSource([], head=100)
    idx = Indexer(src, InMemoryEventSink(), reorg_window=5, max_blocks_per_cycle=1)
    for _ in range(200):  # floor = window + 1: one new block per cycle, still terminates
        idx.sync_once()
        if not idx._more:
            break
    assert idx.sink.last_block() == 100


def test_other_errors_propagate_but_keep_chunks_written() -> None:
    class Boom(ChunkSource):
        def event_chunks(self, first: int, last: int) -> Iterator[Any]:
            for item in super().event_chunks(first, last):
                yield item
                if item[1] >= 99:
                    raise ConnectionError("rpc down")

    src = Boom([ev(5)], head=250)
    sink = InMemoryEventSink()
    with pytest.raises(ConnectionError):
        Indexer(src, sink).sync_once()
    assert sink.last_block() == 99 and len(sink) == 1


def test_run_backs_off_exponentially_and_resets_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    src = ChunkSource([ev(1)], head=10)
    src.fail_on = {1, 2, 3, 4, 5, 6, 7}  # every cycle is rate limited until call 8
    sink = InMemoryEventSink()
    idx = Indexer(src, sink, poll_interval=0.1)
    delays: list[float] = []
    stop = threading.Event()

    def fake_sleep(delay: float, stop_ev: threading.Event, wakeable: bool = True) -> None:
        delays.append(delay)
        if len(delays) >= 8:
            stop_ev.set()

    monkeypatch.setattr(idx, "_sleep", fake_sleep)
    idx.run(stop)
    assert delays[:7] == [2.0, 4.0, 8.0, 16.0, 32.0, 60.0, 60.0]  # capped at 60s
    assert delays[7] == 0.1  # success: reset, normal poll interval
    assert not idx.rate_limited and idx.status().last_error is None
    assert sink.last_block() == 10


def test_rate_limited_is_a_warning_not_an_indexer_error() -> None:
    from guardian.services.org_service import health

    src = ChunkSource([], head=10)
    src.fail_on = {1}
    idx = Indexer(src, InMemoryEventSink(), label="c")
    idx.sync_once()
    rt = SimpleNamespace(
        snapshot=lambda: SimpleNamespace(block=1, policy_version=1, policy_label=1),
        indexer=None,
        c_indexer=idx,
        block_watch=SimpleNamespace(observe=lambda b: None, stalled=False, last_block_at=None),
        sse_latency=SimpleNamespace(out=lambda: {"maxMs": 0}),
        settings=SimpleNamespace(chain_mode="l1", demo_enabled=False),
        stores=SimpleNamespace(agent_runs=SimpleNamespace(all=list)),
        graph_version=1,
    )
    warnings = health(rt)["warnings"]  # type: ignore[arg-type]
    assert "RPC_RATE_LIMITED" in warnings and "INDEXER_ERROR" not in warnings


DEP = CChainDeployment(
    "fuji", 43113, None, None, "0x" + "11" * 20, "0x" + "22" * 20, "0x" + "33" * 20
)


def _lg(**extra: Any) -> dict[str, Any]:
    return {
        "blockNumber": 7,
        "transactionHash": bytes.fromhex("ab" * 32),
        "logIndex": 0,
        "data": (5).to_bytes(32, "big"),
        **extra,
    }


def test_block_timestamp_in_the_log_avoids_get_block() -> None:
    blocks: list[int] = []

    def get_block(n: int) -> dict[str, int]:
        blocks.append(n)
        return {"timestamp": 999}

    logs = [_lg(blockTimestamp="0x64"), {**_lg(blockTimestamp="0x64"), "logIndex": 1}]
    w3 = SimpleNamespace(eth=SimpleNamespace(get_logs=lambda f: logs, get_block=get_block))
    out = CChainSource(w3, DEP).events_between(1, 10)  # type: ignore[arg-type]
    assert [e.ts for e in out] == [100, 100] and blocks == []


def test_get_block_is_cached_per_block() -> None:
    blocks: list[int] = []

    def get_block(n: int) -> dict[str, int]:
        blocks.append(n)
        return {"timestamp": 999}

    logs = [_lg(), {**_lg(), "logIndex": 1}]
    w3 = SimpleNamespace(eth=SimpleNamespace(get_logs=lambda f: logs, get_block=get_block))
    out = CChainSource(w3, DEP).events_between(1, 10)  # type: ignore[arg-type]
    assert [e.ts for e in out] == [999, 999] and blocks == [7]


def test_cchain_source_429_mid_range_keeps_earlier_chunks() -> None:
    calls = {"n": 0}

    def get_logs(flt: dict[str, Any]) -> list[dict[str, Any]]:
        calls["n"] += 1
        if calls["n"] == 3:
            raise http_429()
        return []

    w3 = SimpleNamespace(
        eth=SimpleNamespace(
            get_logs=get_logs, get_block=lambda n: {"timestamp": 1}, block_number=999
        )
    )
    src = CChainSource(w3, DEP, log_chunk=100)  # type: ignore[arg-type]
    sink = InMemoryEventSink()
    idx = Indexer(src, sink, label="c", max_blocks_per_cycle=2000)
    idx.sync_once()
    assert sink.last_block() == 199 and idx.rate_limited


def test_setting_default_and_env(monkeypatch: pytest.MonkeyPatch) -> None:
    from guardian.core.config import Settings

    assert Settings().cchain_max_blocks_per_cycle == 2000
    monkeypatch.setenv("CCHAIN_MAX_BLOCKS_PER_CYCLE", "500")
    assert Settings().cchain_max_blocks_per_cycle == 500
