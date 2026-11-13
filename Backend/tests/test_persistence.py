"""DB-002: events, attempts and scenario runs behind the store interfaces (Postgres vs memory)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from guardian.chain.base import ChainEvent
from guardian.chain.sim import SimChain
from guardian.db.bridge import DbBridge
from guardian.main import create_app
from guardian.repositories.pg import PgEventSink
from guardian.services.runtime import Runtime
from guardian.workers.indexer import InMemoryEventSink
from tests.conftest import T0, TEST_DB, make_settings, truncate_pg

needs_pg = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")


def ev(i: int, block: int | None = None) -> ChainEvent:
    return ChainEvent(
        "Paid", block if block is not None else i, f"0x{i:064x}", i % 3,
        {"amount": 10**30 + i, "to": "0xAbC", "memo": None, "nested": {"ok": True}}, 1_800_000_000 + i,
        simulated=False,
    )  # fmt: skip


@pytest.fixture(params=["memory", "postgres"])
async def sink(request: pytest.FixtureRequest) -> AsyncIterator[Any]:
    if request.param == "memory":
        yield InMemoryEventSink()
        return
    if not TEST_DB:
        pytest.skip("TEST_DATABASE_URL not set")
    request.getfixturevalue("pg_schema")
    await truncate_pg()
    bridge = DbBridge(TEST_DB)
    yield PgEventSink(bridge)
    bridge.close()


async def test_sink_write_is_idempotent(sink: Any) -> None:
    assert sink.write(ev(1)) is True
    assert sink.write(ev(1)) is False
    assert len(sink.all()) == 1


async def test_sink_replay_100_events_twice(sink: Any) -> None:
    events = [ev(i) for i in range(100)]
    assert [sink.write(e) for e in events] == [True] * 100
    assert [sink.write(e) for e in events] == [False] * 100
    assert len(sink.all()) == 100


async def test_sink_range_remove_cursor_and_round_trip(sink: Any) -> None:
    events = [ev(i) for i in (5, 3, 4, 9)]
    for e in events:
        sink.write(e)
    got = sink.events_in_range(3, 5)
    assert got == sorted(events[:3], key=lambda e: (e.block, e.log_index))
    assert sink.all()[-1] == ev(9)  # ints (incl. > 2**64), None, nesting round-trip identically
    assert sink.remove(ev(4).tx_hash, ev(4).log_index) is True
    assert sink.remove(ev(4).tx_hash, ev(4).log_index) is False
    assert sink.last_block() is None
    sink.set_last_block(7)
    sink.set_last_block(8)
    assert sink.last_block() == 8


@needs_pg
async def test_sink_meta_last_block_c(sink: Any) -> None:
    if not isinstance(sink, PgEventSink):
        pytest.skip("postgres only")
    assert sink.last_block_c() is None
    sink._bridge.run(sink._repo.meta_set("last_block_c", "12"))
    assert sink.last_block_c() == 12


@asynccontextmanager
async def running(**kw: Any) -> AsyncIterator[FastAPI]:
    settings = make_settings(**kw)
    app = create_app(settings, Runtime(settings, chain=SimChain(clock=lambda: T0)))
    async with app.router.lifespan_context(app):
        yield app


def http(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


async def scene4(c: httpx.AsyncClient) -> str:
    run = (await c.post("/api/scenario/scene4/run?delay=0&wait=true")).json()
    assert (
        await c.post("/api/actions/lock", json={"member": "lan", "principalId": "minh"})
    ).status_code == 200
    assert (await c.post("/api/scenario/scene4/run", json={"step": 7})).status_code == 200
    return str(run["id"])


@needs_pg
async def test_scene4_survives_restart(pg_schema: None) -> None:
    await truncate_pg()
    async with running(database_url=TEST_DB) as a, http(a) as c:
        run_id = await scene4(c)
        before = (await c.get(f"/api/attempts?run={run_id}")).json()
        runs_before = (await c.get("/api/scenario/runs")).json()
    assert len(before) == 7
    async with running(database_url=TEST_DB) as b, http(b) as c:
        assert (await c.get(f"/api/attempts?run={run_id}")).json() == before
        assert (await c.get("/api/scenario/runs")).json() == runs_before
        assert runs_before[0]["status"] == "completed"
        # new ids continue after the persisted ones
        assert (await c.post("/api/agent/run-once")).status_code == 200
        ids = [x["id"] for x in (await c.get("/api/attempts")).json()]
        assert len(ids) == len(set(ids)) > 7


async def test_memory_restart_starts_empty() -> None:
    async with running() as a, http(a) as c:
        await scene4(c)
        assert len((await c.get("/api/attempts")).json()) == 7
    async with running() as b, http(b) as c:
        assert (await c.get("/api/attempts")).json() == []
        assert (await c.get("/api/scenario/runs")).json() == []


@needs_pg
async def test_demo_reset_clears_attempts_and_runs_keeps_events(pg_schema: None) -> None:
    await truncate_pg()
    bridge = DbBridge(TEST_DB)
    try:
        s = PgEventSink(bridge)
        for i in range(5):
            s.write(ev(i))
        async with running(database_url=TEST_DB) as a, http(a) as c:
            await scene4(c)
            assert (await c.post("/api/demo/reset")).status_code == 200
            assert (await c.get("/api/attempts")).json() == []
        engine = create_async_engine(TEST_DB)
        async with engine.connect() as conn:
            counts = [
                (await conn.execute(text(f"select count(*) from {t}"))).scalar_one()
                for t in ("attempts", "scenario_runs", "events")
            ]
        await engine.dispose()
        assert counts == [0, 0, 5]
    finally:
        bridge.close()
