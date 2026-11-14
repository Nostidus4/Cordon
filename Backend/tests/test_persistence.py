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
from guardian.repositories import pg
from guardian.repositories.pg import PgEventSink, PgScenarioRunStore
from guardian.services.runtime import (
    AgentRunRec,
    AssistantLogRec,
    FindingRec,
    ProposalRec,
    Runtime,
    ScenarioRunRec,
    SimRunRec,
)
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
    assert (await c.post("/api/demo/policy-v2")).status_code == 200  # scene 4 needs v2
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
    assert len(before) == 8  # agent step 0 (auto) + 1-5 + lock + step 7
    async with running(database_url=TEST_DB) as b, http(b) as c:
        assert (await c.get(f"/api/attempts?run={run_id}")).json() == before
        assert (await c.get("/api/scenario/runs")).json() == runs_before
        assert runs_before[0]["status"] == "completed"
        # new ids continue after the persisted ones
        assert (await c.post("/api/agent/run-once")).status_code == 200
        ids = [x["id"] for x in (await c.get("/api/attempts")).json()]
        assert len(ids) == len(set(ids)) > 8


async def test_memory_restart_starts_empty() -> None:
    async with running() as a, http(a) as c:
        await scene4(c)
        assert len((await c.get("/api/attempts")).json()) == 8
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
                for t in ("attempts", "scenario_runs", "events where chain = 'l1'")
            ]
        await engine.dispose()
        assert counts == [0, 0, 5]
    finally:
        bridge.close()


@needs_pg
async def test_run_left_running_by_a_killed_process_is_failed_on_load(pg_schema: None) -> None:
    await truncate_pg()
    bridge = DbBridge(TEST_DB)
    try:  # what a process killed mid scene 4 leaves behind
        PgScenarioRunStore(bridge).save(
            ScenarioRunRec(id="run-1", status="running", delay=0, started_at=T0, policy_version=1)
        )
    finally:
        bridge.close()
    async with running(database_url=TEST_DB) as a, http(a) as c:
        runs = (await c.get("/api/scenario/runs")).json()
        assert [(r["id"], r["status"], r["error"]) for r in runs] == [
            ("run-1", "failed", "interrupted")
        ]
        assert (await c.post("/api/demo/policy-v2")).status_code == 200
        new = await c.post("/api/scenario/scene4/run?delay=0&wait=true")
        assert new.status_code == 200 and new.json()["id"] == "run-2"
    async with running(database_url=TEST_DB) as b, http(b) as c:  # the fix was written back
        runs = (await c.get("/api/scenario/runs")).json()
        assert runs[0]["status"] == "failed" and runs[0]["error"] == "interrupted"


# ----------------------------------------------------------------------------------------------- DB-003
def pids(c_json: list[dict[str, Any]]) -> list[int]:
    return [p["id"] for p in c_json]


async def approve(c: httpx.AsyncClient, pid: int, *members: str) -> None:
    for m in members:
        r = await c.post(f"/api/proposals/{pid}/approve", json={"member": m})
        assert r.status_code == 200, r.text


async def ask(c: httpx.AsyncClient) -> None:
    body = {"question": "simulate.huy_too", "context": {"screen": "x"}}
    assert (await c.post("/api/assistant/ask", json=body)).status_code == 200


@needs_pg
async def test_new_rec_types_round_trip_through_their_pg_stores(pg_schema: None) -> None:
    await truncate_pg()
    bridge = DbBridge(TEST_DB)
    try:
        prop = ProposalRec(
            12, "t", None, {"kind": "move_key", "key": "0xA", "to": "huy"},
            [{"fn": "setPrincipalDailyCap", "args": {"cap": 10**30}}], ["d"],
            {"before": {"estimated": 1}, "conflictedMembers": []}, "0x" + "ab" * 32, "trang", T0,
            "R1:minh", "policy_v2_reference", T0 + 5, "0xdead",
        )  # fmt: skip
        no_subject = ProposalRec(13, "t2", "huy", None, [], [], {"x": 1}, "0x01", "lan", T0)
        run = AgentRunRec(
            7, T0, "swapped", {"a": [1, None]}, None, None, "0xh", None, None, 3,
            {"tUSDC": {"raw": "1", "display": "1"}}, [{"id": "s", "ok": True}], "inj", False,
        )  # fmt: skip
        log = AssistantLogRec(8, T0, None, "q", "a", True, None, True)
        find = FindingRec("R1:minh", "R1", "minh", "HIGH", {"id": "R1:minh", "n": 2}, T0, 12)
        sim = SimRunRec(
            "2", {"compromised": ["minh"], "change": None}, {"totals": {"n": "1"}}, 4, T0
        )
        pg.PgProposalStore(bridge, lambda _i: ("executed", ["lan", "trang"])).add(prop)
        pg.PgProposalStore(bridge, lambda _i: ("open", [])).add(no_subject)
        pg.PgAgentRunStore(bridge).add(run)
        pg.PgAssistantLogStore(bridge).add(log)
        pg.PgFindingStore(bridge)._put(find)
        pg.PgSimRunStore(bridge).add(sim)

        def view(_i: int) -> tuple[str, list[str]]:
            return "open", []

        assert pg.PgProposalStore(bridge, view).all() == [prop, no_subject]
        assert pg.PgProposalStore(bridge, view).get(12) == prop
        assert pg.PgAgentRunStore(bridge).all() == [run]
        assert pg.PgAssistantLogStore(bridge).all() == [log]
        assert pg.PgFindingStore(bridge).all() == [find]
        assert pg.PgSimRunStore(bridge).all() == [sim]
        meta = pg.PgMeta(bridge)
        meta.set("graph_version", "9")
        assert pg.PgMeta(bridge).get("graph_version") == "9"
    finally:
        bridge.close()


@needs_pg
async def test_proposal_12_executed_survives_restart(pg_schema: None) -> None:
    await truncate_pg()
    async with running(database_url=TEST_DB) as a, http(a) as c:
        await scene4(c)
        await approve(c, 12, "lan", "trang")
        p12 = (await c.get("/api/proposals/12")).json()
        listed = pids((await c.get("/api/proposals")).json())
        org = (await c.get("/api/org")).json()
        attempts = (await c.get("/api/attempts")).json()
        before_hashes = {x["txHash"] for x in attempts if x["txHash"]}
        before_hashes |= {e.tx_hash for e in a.state.runtime.event_log}
        graph_v = a.state.runtime.graph_version
        assert (
            p12["status"] == "executed" and org["policyVersion"] == 3
        )  # v2 (scene 4 needs it) + #12
    async with running(database_url=TEST_DB) as b, http(b) as c:
        rt = b.state.runtime
        assert rt.restored
        assert (await c.get("/api/proposals/12")).json() == p12
        assert pids((await c.get("/api/proposals")).json()) == listed == [13, 12]
        assert (await c.get("/api/org")).json()["policyVersion"] == 3
        assert (await c.get("/api/attempts")).json() == attempts
        assert rt.graph_version > graph_v  # persisted, then bumped by the startup reset
        # the chain went on from where it was: new txs get new hashes
        await approve(c, 13, "lan", "trang")
        assert (await c.get("/api/proposals/13")).json()["status"] == "executed"
        new = {e.tx_hash for e in rt.event_log} - before_hashes
        assert len(new) >= 2
        assert not before_hashes & {e.tx_hash for e in list(rt.event_log)[-2:]}


@needs_pg
async def test_assistant_logs_and_agent_runs_survive_restart(pg_schema: None) -> None:
    await truncate_pg()
    async with running(database_url=TEST_DB) as a, http(a) as c:
        await ask(c)
        await ask(c)
        for _ in range(2):
            assert (await c.post("/api/agent/run-once")).status_code == 200
        logs = (await c.get("/api/assistant/logs")).json()
        runs = (await c.get("/api/agent/runs")).json()
    assert len(logs) == 2 and len(runs) == 2
    async with running(database_url=TEST_DB) as b, http(b) as c:
        assert (await c.get("/api/assistant/logs")).json() == logs
        assert (await c.get("/api/agent/runs")).json() == runs
        assert [x["id"] for x in logs] == sorted(x["id"] for x in logs)
        await ask(c)  # ids continue after the persisted ones
        assert (await c.get("/api/assistant/logs")).json()[-1]["id"] > logs[-1]["id"]


@needs_pg
async def test_state_is_rebuilt_from_events_only(pg_schema: None) -> None:
    await truncate_pg()
    async with running(database_url=TEST_DB) as a, http(a) as c:
        await scene4(c)
        await approve(c, 12, "lan", "trang")
        assert (await c.post("/api/simulate", json={"compromised": ["minh"]})).status_code == 200
        want = a.state.runtime.snapshot()
        assert any(p.locked for p in want.principals.values())
        assert any(k.spent_today for k in want.keys.values())
        assert want.policy_version == 3  # v2 (scene 4 needs it) + #12
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE attempts, scenario_runs, meta, proposals, findings, sim_runs, agent_runs, "
                "assistant_logs"
            )
        )
    await engine.dispose()
    async with running(database_url=TEST_DB) as b, http(b) as c:
        rt = b.state.runtime
        assert rt.restored
        got = rt.snapshot()
        assert got.policy_version == want.policy_version
        assert {k: p.locked for k, p in got.principals.items()} == {
            k: p.locked for k, p in want.principals.items()
        }
        assert {k: p.spent_today for k, p in got.principals.items()} == {
            k: p.spent_today for k, p in want.principals.items()
        }
        assert {k: (v.spent_today, v.daily_cap, v.active) for k, v in got.keys.items()} == {
            k: (v.spent_today, v.daily_cap, v.active) for k, v in want.keys.items()
        }
        assert {k: p.daily_cap for k, p in got.principals.items()} == {
            k: p.daily_cap for k, p in want.principals.items()
        }
        assert got == want
        assert (await c.get("/api/proposals")).json() == []  # proposals were wiped: no row, no seed


@needs_pg
async def test_graph_version_and_sim_runs_are_recorded_and_survive(pg_schema: None) -> None:
    await truncate_pg()
    async with running(database_url=TEST_DB) as a, http(a) as c:
        assert (await c.post("/api/simulate", json={"compromised": ["minh"]})).status_code == 200
        fid = "R1_MULTI_KEY_NO_SHARED_CAP:minh"  # the merge proposal makes the finding disappear
        r = await c.post("/api/proposals", json={"member": "lan", "findingId": fid})
        merge = r.json()["id"]
        await approve(c, merge, "lan", "trang")
        v = a.state.runtime.graph_version
        n_find = len(a.state.runtime.stores.findings.all())
        assert a.state.runtime.stores.meta.get("policy_version") == "2"
        assert len(a.state.runtime.stores.sim_runs.all()) == 1
    async with running(database_url=TEST_DB) as b:
        rt = b.state.runtime
        assert rt.graph_version >= v and len(rt.stores.sim_runs.all()) == 1
        assert len(rt.stores.findings.all()) >= n_find > 0
        assert any(
            f.id == fid and f.resolved_by_proposal == merge for f in rt.stores.findings.all()
        )


@needs_pg
async def test_demo_reset_then_restart_is_a_clean_scene_1_and_keeps_l1_events(
    pg_schema: None,
) -> None:
    await truncate_pg()
    bridge = DbBridge(TEST_DB)
    try:
        PgEventSink(bridge).write(ev(1))
        async with running(database_url=TEST_DB) as a, http(a) as c:
            await scene4(c)
            await approve(c, 12, "lan", "trang")
            assert (await c.post("/api/demo/reset")).status_code == 200
            first = (await c.get("/api/proposals")).json()
        async with running(database_url=TEST_DB) as b, http(b) as c:
            assert (await c.get("/api/proposals")).json() == first
            assert pids(first) == [13, 12] and first[1]["status"] == "open"
            assert (await c.get("/api/org")).json()["policyVersion"] == 1
            assert (await c.get("/api/attempts")).json() == []
        assert PgEventSink(bridge).all() == [ev(1)]
    finally:
        bridge.close()
