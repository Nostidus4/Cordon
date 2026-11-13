"""API-004: block stall, graph worker, worker process, event->SSE latency, JSON logs."""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

import httpx

from guardian.chain.base import ChainEvent
from guardian.chain.sim import SimChain
from guardian.core.logging import event_extra, setup_logging
from guardian.main import create_app
from guardian.services.runtime import Runtime
from guardian.workers.graph_worker import GraphWorker
from guardian.workers.health import BlockWatch, LatencyStats
from tests.conftest import T0, make_settings

BACKEND = Path(__file__).resolve().parents[1]


def ev(name: str) -> ChainEvent:
    return ChainEvent(name=name, block=7, tx_hash="0xabc", log_index=0, payload={}, ts=0)


def test_block_watch() -> None:
    now = [100.0]
    w = BlockWatch(lambda: now[0], stall_after=60)
    assert (w.last_block_at, w.stalled) == (None, False)
    w.observe(5)
    now[0] += 61
    w.observe(5)  # same head does not reset the timer
    assert w.stalled and w.last_block_at == 100
    w.observe(6)
    assert not w.stalled and w.last_block_at == 161
    w.stall_after = None
    now[0] += 1000
    assert not w.stalled


def test_latency_stats() -> None:
    s = LatencyStats(window=2)
    assert s.out() == {"lastMs": None, "maxMs": None, "samples": 0}
    for x in (0.5, 0.001, 0.002):
        s.record(x)
    assert s.out() == {"lastMs": 2.0, "maxMs": 2.0, "samples": 2}


async def test_health_reports_and_clears_a_stalled_chain() -> None:
    now = [float(T0)]
    settings = make_settings()
    rt = Runtime(settings, chain=SimChain(clock=lambda: T0), clock=lambda: now[0])
    rt.block_watch.stall_after = 60  # sim disables it by default; force it to test the logic
    app = create_app(settings, rt)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        h = (await c.get("/api/health")).json()
        assert h["blockStalled"] is False and h["warnings"] == []
        assert h["lastBlockAt"] == T0
        now[0] += 61
        h = (await c.get("/api/health")).json()
        assert h["blockStalled"] is True and "BLOCK_STALLED" in h["warnings"]
        r = await c.post("/api/actions/lock", json={"member": "lan", "principalId": "minh"})
        assert r.status_code == 200
        h = (await c.get("/api/health")).json()
        assert h["blockStalled"] is False and "BLOCK_STALLED" not in h["warnings"]


def test_graph_worker_bumps_once_per_graph_event() -> None:
    sent: list[tuple[str, dict[str, Any]]] = []
    chain = SimChain()
    gw = GraphWorker(chain.snapshot, lambda t, d: sent.append((t, d)), version=3)
    assert gw.handle(ev("PrincipalLocked")) is True
    assert gw.version == 4 and len(sent) == 1 and sent[0][0] == "graph_updated"
    assert sent[0][1]["graphVersion"] == 4
    assert set(sent[0][1]) == {"graphVersion", "policyVersion", "policyLabel", "block"}
    assert gw.handle(ev("Paid")) is False
    assert gw.version == 4 and len(sent) == 1


async def test_event_to_sse_latency_is_recorded(client: Any, rt: Runtime) -> None:
    q = rt.bus.subscribe()
    await client.post("/api/actions/lock", json={"member": "lan", "principalId": "minh"})
    assert rt.sse_latency.out()["samples"] >= 1
    assert rt.sse_latency.out()["maxMs"] < 3000
    assert any(t == "event" for t, _ in [q.get_nowait() for _ in range(q.qsize())])
    h = (await client.get("/api/health")).json()
    assert h["eventToSse"]["samples"] >= 1 and "SSE_SLOW" not in h["warnings"]


def test_json_logging(capsys: Any) -> None:
    setup_logging()
    setup_logging()  # idempotent
    root = logging.getLogger()
    n = len([h for h in root.handlers if type(h.formatter).__name__ == "JsonFormatter"])
    assert n == 1
    handler = next(h for h in root.handlers if type(h.formatter).__name__ == "JsonFormatter")
    rec = logging.LogRecord("x", logging.INFO, "f", 1, "hello", None, None)
    for k, v in event_extra(ev("Paid")).items():
        setattr(rec, k, v)
    out = json.loads(handler.format(rec))
    assert out["msg"] == "hello" and out["level"] == "INFO" and "ts" in out
    assert (out["event"], out["block"], out["tx_hash"]) == ("Paid", 7, "0xabc")


def test_worker_process_starts_and_stops_on_sigterm() -> None:
    p = subprocess.Popen(
        ["uv", "run", "guardian-worker"],
        cwd=BACKEND,
        env={**os.environ, "CHAIN_MODE": "sim"},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert p.stdout is not None
    lines: list[str] = []
    deadline = time.monotonic() + 30
    try:
        while time.monotonic() < deadline:
            line = p.stdout.readline()
            if not line:
                break
            lines.append(line)
            if "worker started" in line:
                break
        assert any("worker started" in x for x in lines), lines
        p.send_signal(signal.SIGTERM)
        rest, _ = p.communicate(timeout=10)
        assert p.returncode == 0
        assert "worker stopped" in rest
    finally:
        if p.poll() is None:
            p.kill()


async def test_latency_for_an_event_from_another_thread(client: Any, rt: Runtime) -> None:
    """The L1 indexer calls from its own thread: publish hops to the loop and is still measured."""
    import asyncio
    import threading

    q = rt.bus.subscribe()
    before = rt.sse_latency.out()["samples"]
    t = threading.Thread(target=rt._on_chain_event, args=(ev("PrincipalLocked"),))
    t.start()
    t.join()
    for _ in range(50):
        if not q.empty():
            break
        await asyncio.sleep(0.01)
    assert q.get_nowait()[0] == "event"
    out = rt.sse_latency.out()
    assert out["samples"] == before + 1 and out["maxMs"] < 3000
