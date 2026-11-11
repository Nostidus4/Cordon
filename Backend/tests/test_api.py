"""End-to-end API flow on the sim chain (spec §13.4): scenes 1-5 + SSE smoke + error format."""

from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import FastAPI

from guardian.shared.scenario4 import SCENARIO4_STEPS
from tests.conftest import collect_sse

R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh"


def disp(m: dict[str, str]) -> str:
    return m["display"]


async def post(
    c: httpx.AsyncClient, url: str, body: dict[str, Any] | None = None, ok: int = 200, **kw: Any
) -> Any:
    r = await c.post(url, json=body, **kw)
    assert r.status_code == ok, r.text
    return r.json()


async def test_full_flow(client: httpx.AsyncClient) -> None:
    c = client
    await post(c, "/api/demo/reset")

    # --- scene 1: map
    g = (await c.get("/api/graph")).json()
    assert g["policyVersion"] == 1 and len(g["districts"]) == 7
    minh = next(n for n in g["nodes"] if n["id"] == "p:minh")
    assert minh["data"]["hasHighFinding"] is True
    assert any(
        f["principalId"] == "minh" and f["severity"] == "HIGH"
        for f in (await c.get("/api/findings")).json()
    )

    # --- scene 2: simulate
    t = (await post(c, "/api/simulate", {"compromised": ["minh"]}))["totals"]
    assert [disp(t[k]) for k in ("youThink", "enforced", "estimated")] == [
        "20.000",
        "20.000",
        "100.000",
    ]
    assert t["percentOfMainTreasury"] == 5.0 and t["estimated"]["raw"] == "100000000000"
    t = (await post(c, "/api/simulate", {"compromised": ["minh", "huy"]}))["totals"]
    assert disp(t["estimated"]) == "140.000" and t["percentOfMainTreasury"] == 7.0

    # --- scene 3: draft -> propose -> 2/3 -> policy v2
    d = await post(c, "/api/proposals/draft", {"findingId": R1_MINH})
    rr = d["riskReport"]
    assert (disp(rr["before"]["enforced"]), disp(rr["before"]["estimated"])) == (
        "20.000",
        "100.000",
    )
    assert (disp(rr["after"]["enforced"]), disp(rr["after"]["estimated"])) == ("30.000", "30.000")
    assert d["sent"] is False and d["riskReportHash"].startswith("0x") and d["descriptionVi"]
    p = await post(c, "/api/proposals", {"member": "lan", "findingId": R1_MINH}, 201)
    assert p["status"] == "open" and p["riskReportHash"] == d["riskReportHash"]
    p = await post(c, f"/api/proposals/{p['id']}/approve", {"member": "lan"})
    assert p["status"] == "open" and p["approvals"] == ["lan"]
    p = await post(c, f"/api/proposals/{p['id']}/approve", {"member": "trang"})
    assert p["status"] == "executed" and p["executedTxHash"]
    g = (await c.get("/api/graph")).json()
    assert g["policyVersion"] == 2
    dist = next(x for x in g["districts"] if x["principalId"] == "minh")
    assert len(dist["keys"]) == 5 and disp(dist["dailyCap"]) == "30.000"

    # --- scene 4: agent, attacker 1-5, lock, step 7
    a = await post(c, "/api/agent/run-once")
    assert a["outcome"] == "swapped" and disp(a["decision"]["amountIn"]) == "5.000"
    assert a["reasonSource"] == "template" and a["reasonHash"].startswith("0x") and a["txHash"]
    assert disp((await c.get("/api/districts/minh")).json()["spentToday"]) == "5.000"

    run = await post(c, "/api/scenario/scene4/run?delay=0&wait=true")
    assert run["status"] == "waiting_lock"
    steps = {x["step"]: x for x in run["attempts"]}
    assert sorted(steps) == [0, 1, 2, 3, 4, 5]
    for s in SCENARIO4_STEPS[1:6]:
        got = steps[s.step]
        assert got["outcome"] == s.expected_outcome, s.step
        assert got["reasonCode"] == s.expected_reason, s.step
    assert steps[5]["reasonCode"] == "DISTRICT_DAILY_CAP" and steps[5]["txHash"]
    assert [disp(steps[i]["principalSpentAfter"]) for i in range(1, 6)] == [
        "5.000",
        "5.000",
        "15.000",
        "25.000",
        "25.000",
    ]
    assert disp((await c.get("/api/districts/minh")).json()["spentToday"]) == "25.000"
    assert (await c.get(f"/api/attempts?run={run['id']}")).json()  # filter works

    lock = await post(c, "/api/actions/lock", {"member": "lan", "principalId": "minh"})
    assert lock["status"] == "ok" and lock["txHash"]
    dist = (await c.get("/api/districts/minh")).json()
    assert dist["locked"] and all(not k["allowListed"] for k in dist["keys"])

    run = await post(c, "/api/scenario/scene4/run", {"step": 7}, 200)
    s7 = next(x for x in run["attempts"] if x["step"] == 7)
    assert run["status"] == "completed"
    assert s7["outcome"] == "blocked_at_protocol" and s7["txHash"] is None
    assert s7["reasonCode"] == "BLOCKED_AT_PROTOCOL" and s7["badge"] == "rejected_by_chain"
    assert any(x["step"] == 6 and x["action"] == "lock" and x["txHash"] for x in run["attempts"])
    runs = (await c.get("/api/scenario/runs")).json()
    assert len(runs) == 1 and len(runs[0]["attempts"]) == 8  # replay feed: steps 0..7

    # --- scene 5: request #12 + conflict of interest
    r12 = next(x for x in (await c.get("/api/proposals")).json() if x["id"] == 12)
    assert r12["status"] == "open" and r12["title"].startswith("Tăng hạn mức")
    assert (
        disp(r12["riskReport"]["before"]["enforced"]),
        disp(r12["riskReport"]["after"]["enforced"]),
    ) == ("30.000", "130.000")
    assert (
        r12["riskReport"]["before"]["percentOfMainTreasury"],
        r12["riskReport"]["after"]["percentOfMainTreasury"],
    ) == (1.5, 6.5)

    key = next(k["address"] for k in dist["keys"] if k["seedId"] == "key_agent_rebalance")
    move = {"kind": "move_key", "key": key, "to": "huy"}
    mp = await post(c, "/api/proposals", {"member": "lan", "change": move}, 201)
    assert mp["subjectPrincipal"] == "huy"
    huy = next(m for m in mp["members"] if m["id"] == "huy")
    assert huy["conflicted"] and not huy["canApprove"] and "xung đột" in huy["disabledReason"]
    assert any(w["code"] == "CONFLICT_OF_INTEREST" for w in mp["warnings"])
    r = await c.post(f"/api/proposals/{mp['id']}/approve", json={"member": "huy"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "CONFLICT_OF_INTEREST" and r.json()["error"]["message"]
    mp2 = next(x for x in (await c.get("/api/proposals")).json() if x["id"] == mp["id"])
    assert mp2["status"] == "open" and mp2["approvals"] == []


async def test_simulate_with_change_before_after(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    d = await post(client, "/api/proposals/draft", {"findingId": R1_MINH})
    r = await post(client, "/api/simulate", {"compromised": ["minh"], "change": d["change"]})
    assert disp(r["before"]["totals"]["estimated"]) == "100.000"
    assert disp(r["after"]["totals"]["estimated"]) == "30.000"
    assert "totals" not in r


async def test_error_format_and_events(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    r = await client.get("/api/districts/nope")
    assert r.status_code == 404 and r.json() == {
        "error": {"code": "DISTRICT_NOT_FOUND", "message": "Không có khu 'nope'."}
    }
    r = await client.post("/api/simulate", json={})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = await client.post(
        "/api/simulate", json={"compromised": ["minh"], "change": {"kind": "bogus"}}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = await client.post("/api/proposals/999/approve", json={"member": "lan"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "PROPOSAL_NOT_FOUND"
    # a plain member cannot loosen alone / non-members rejected by name
    r = await client.post("/api/actions/lock", json={"member": "nobody", "principalId": "minh"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_MEMBER"
    ev = (await client.get("/api/events?since=0")).json()
    assert ev and ev[0]["name"] == "Proposed" and ev[0]["simulated"] is True


async def test_external_attempt_and_replay_filter(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    body = {
        "scenarioRunId": "ext-1",
        "step": 1,
        "signer": "key_agent_intl_pay",
        "action": "pay",
        "outcome": "reverted",
        "reasonCode": "RECIPIENT_NOT_ALLOWED",
        "txHash": "0xabc",
        "amount": 20_000_000_000,
        "token": "tUSDC",
        "to": "stranger_wallet",
    }
    a = await post(client, "/api/attempts", body, 201)
    assert a["source"] == "external" and a["reasonTextVi"] and disp(a["amount"]) == "20.000"
    got = (await client.get("/api/attempts?run=ext-1")).json()
    assert [x["id"] for x in got] == [a["id"]]
    bad = await client.post("/api/attempts", json={**body, "reasonCode": "NOPE"})
    assert bad.status_code == 422


async def test_agent_card_cap_blocked_without_tx(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    for _ in range(4):  # 4 x 5.000 = the agent key's 20.000 daily cap
        assert (await post(client, "/api/agent/run-once"))["outcome"] == "swapped"
    last = await post(client, "/api/agent/run-once")
    assert last["outcome"] == "blocked" and last["reasonCode"] == "CARD_DAILY_CAP"
    assert last["txHash"] is None
    att = next(
        x for x in (await client.get("/api/attempts")).json() if x["id"] == last["attemptId"]
    )
    assert att["outcome"] == "blocked" and att["txHash"] is None


async def test_scenario_background_with_delay_and_running_guard(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    run = await post(client, "/api/scenario/scene4/run?delay=0.05")
    assert run["status"] == "running"
    r = await client.post("/api/scenario/scene4/run?delay=0")
    assert r.status_code == 409 and r.json()["error"]["code"] == "SCENARIO_RUNNING"
    import asyncio

    for _ in range(100):
        cur = (await client.get(f"/api/scenario/runs/{run['id']}")).json()
        if cur["status"] != "running":
            break
        await asyncio.sleep(0.05)
    assert cur["status"] == "waiting_lock" and len(cur["attempts"]) == 5


async def test_l1_mode_not_implemented() -> None:
    import pytest

    from guardian.core.config import Settings
    from guardian.services.runtime import Runtime

    with pytest.raises(NotImplementedError, match="CHAIN_MODE=l1"):
        Runtime(Settings(chain_mode="l1"))


async def test_sse_smoke(app: FastAPI, client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")

    async def trigger() -> None:
        await client.post("/api/demo/policy-v2")
        await client.post("/api/agent/run-once")

    got = await collect_sse(
        app, trigger, {"event", "attempt", "graph_updated", "agent_run", "proposal_updated"}
    )
    assert {"event", "attempt", "graph_updated", "agent_run", "proposal_updated"} <= got.keys()
    names = [json.loads(d)["name"] for d in got["event"]]
    assert {"Proposed", "Approved", "Executed", "Swapped"} <= set(names)
    swapped = next(json.loads(d) for d in got["event"] if json.loads(d)["name"] == "Swapped")
    assert swapped["payload"]["principalSpentAfter"]["display"] == "5.000"
    ga = json.loads(got["graph_updated"][-1])
    assert ga["policyVersion"] == 2
