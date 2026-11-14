"""Council timelock through the API, keeper and responder (#77), sim chain with a 30 s delay and a fake clock."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest
import pytest_asyncio

from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services import attempt_service as att
from guardian.services import demo_reset, timelock_keeper
from guardian.services import proposal_service as ps
from guardian.services.city_state import evaluate_buildings
from guardian.services.runtime import Runtime
from guardian.shared.money import to_base
from tests.conftest import T0, make_settings

DELAY = 30


class Ctx:
    def __init__(self, rt: Runtime, cell: list[int], client: httpx.AsyncClient) -> None:
        self.rt, self.cell, self.client = rt, cell, client


@pytest_asyncio.fixture
async def make() -> AsyncIterator[Callable[..., Any]]:
    stack: list[Any] = []

    async def build(**kw: Any) -> Ctx:
        cell = [T0]
        settings = make_settings(council_timelock_s=DELAY, **kw)
        rt = Runtime(
            settings, chain=SimChain(clock=lambda: cell[0], timelock_s=DELAY), clock=lambda: cell[0]
        )
        app = create_app(settings, rt)
        ctx = app.router.lifespan_context(app)
        await ctx.__aenter__()
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        stack.append((ctx, client))
        await demo_reset.reset(rt)
        return Ctx(rt, cell, client)

    yield build
    for ctx, client in stack:
        await client.aclose()
        await ctx.__aexit__(None, None, None)


async def _queue_request_12(c: Ctx) -> dict[str, Any]:
    pid = 12
    r = await c.client.post(f"/api/proposals/{pid}/approve", json={"member": "trang"})
    assert r.status_code == 200 and r.json()["queued"] is False
    r = await c.client.post(f"/api/proposals/{pid}/approve", json={"member": "lan"})
    assert r.status_code == 200
    return r.json()  # type: ignore[no-any-return]


async def test_threshold_queues_and_api_reports_eta(make: Callable[..., Any]) -> None:
    c: Ctx = await make()
    out = await _queue_request_12(c)
    assert out["status"] == "open" and out["queued"] is True and out["eta"] == T0 + DELAY
    assert out["vetoedBy"] is None and out["executedAt"] is None
    assert c.rt.snapshot().policy_version == 1
    # B01.queued is a warning with the countdown in its reason
    q = [m for m in evaluate_buildings(c.rt)["B01"].matches if m[0] == "B01.queued"]
    assert len(q) == 1 and q[0][1] == "warning" and "0:30" in q[0][2]


async def test_execute_endpoint_before_and_after_eta(make: Callable[..., Any]) -> None:
    c: Ctx = await make()
    await _queue_request_12(c)
    r = await c.client.post("/api/proposals/12/execute", json={"member": "huy"})
    assert r.status_code >= 400 and "TimelockNotReady" in r.text
    c.cell[0] += DELAY
    r = await c.client.post("/api/proposals/12/execute", json={"member": "huy"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "executed" and body["queued"] is False
    assert body["executedAt"] == T0 + DELAY and body["executedTxHash"]
    assert c.rt.snapshot().policy_version == 2


async def test_veto_endpoint(make: Callable[..., Any]) -> None:
    c: Ctx = await make()
    r = await c.client.post("/api/proposals/12/veto", json={"member": "huy"})
    assert r.status_code >= 400  # not queued yet
    await _queue_request_12(c)
    r = await c.client.post("/api/proposals/12/veto", json={"member": "huy"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "cancelled" and body["vetoedBy"] == "huy" and body["queued"] is False
    c.cell[0] += DELAY
    assert timelock_keeper.tick(c.rt) == []
    assert c.rt.snapshot().policy_version == 1


async def test_execute_and_veto_need_demo_mode(make: Callable[..., Any]) -> None:
    c: Ctx = await make(demo_mode=False)
    for ep in ("execute", "veto"):
        r = await c.client.post(f"/api/proposals/12/{ep}", json={"member": "huy"})
        assert r.status_code == 403 and r.json()["error"]["code"] == "DEMO_MODE_REQUIRED"


async def test_keeper_executes_after_eta_with_fake_clock(make: Callable[..., Any]) -> None:
    c: Ctx = await make()
    await _queue_request_12(c)
    assert timelock_keeper.tick(c.rt) == []
    c.cell[0] += DELAY - 1
    assert timelock_keeper.tick(c.rt) == []
    c.cell[0] += 1
    assert timelock_keeper.tick(c.rt) == [12]
    assert timelock_keeper.tick(c.rt) == []  # idempotent
    rec = c.rt.stores.proposals.get(12)
    assert rec is not None and rec.executed_at == c.cell[0]
    assert c.rt.snapshot().policy_version == 2


async def test_keeper_signs_nothing_without_demo_mode(make: Callable[..., Any]) -> None:
    c: Ctx = await make(demo_mode=False)
    # approve straight on the chain: the API refuses to sign without DEMO_MODE
    ch = c.rt.chain
    assert ch.approve(c.rt.addr("trang"), 12).ok and ch.approve(c.rt.addr("lan"), 12).ok
    c.cell[0] += DELAY + 5
    assert timelock_keeper.tick(c.rt) == []
    assert ch.proposal_state(12).queued
    q = [m for m in evaluate_buildings(c.rt)["B01"].matches if m[0] == "B01.queued"]
    assert len(q) == 1 and "thực thi" in q[0][2] and "Tự thực thi" not in q[0][2]


async def test_responder_incident_stays_awaiting_council_until_executed(
    make: Callable[..., Any],
) -> None:
    c: Ctx = await make()
    rt = c.rt
    # scene 4 state through the timelock: propose + 2 approvals queue, the keeper executes
    out = demo_reset.apply_policy_v2(rt)
    assert out["queued"] is True and rt.snapshot().policy_version == 1
    c.cell[0] += DELAY
    assert timelock_keeper.tick(rt) == [out["id"]]
    for _ in range(2):
        att.run_spend(
            rt,
            "key_agent_intl_pay",
            "pay",
            {"token": "tUSDC", "to": "stranger_wallet", "amount": to_base(1_000)},
        )
    rt.notify_state_changed(graph=False)
    (inc,) = rt.stores.incidents
    assert inc.status == "awaiting_council" and rt.snapshot().principals["minh"].locked
    pid = inc.proposal_id
    assert pid is not None
    ps.approve(rt, pid, "trang")
    ps.approve(rt, pid, "lan")
    # threshold reached but queued: still locked, still awaiting
    rt.responder_tick()
    assert inc.status == "awaiting_council" and rt.snapshot().principals["minh"].locked
    c.cell[0] += DELAY
    assert timelock_keeper.tick(rt) == [pid]
    assert inc.status == "recovering" and not rt.snapshot().principals["minh"].locked


@pytest.mark.parametrize("delay", [0])
async def test_delay_zero_has_no_eta(delay: int) -> None:
    chain = SimChain(clock=lambda: T0)
    pid = chain.propose(
        chain.council.members["trang"],
        "x",
        None,
        [{"target": "vault", "fn": "unpauseAll", "args": {}}],
        "0x00",
    ).proposal_id
    assert pid is not None
    st = chain.proposal_state(pid)
    assert (st.eta, st.queued) == (None, False)
