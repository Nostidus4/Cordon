"""City states (backend = single source): mapping for seed v1, v2, scene 4, lock, pause, conflict."""

from __future__ import annotations

import httpx

from guardian.services import city_state as cs
from guardian.services.runtime import Runtime

R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh"


async def city(c: httpx.AsyncClient) -> dict[str, dict]:
    r = await c.get("/api/city/states")
    assert r.status_code == 200
    b = {x["id"]: x for x in r.json()["buildings"]}
    assert list(b) == [f"B0{i}" for i in range(1, 9)]
    return b


def states(b: dict[str, dict]) -> dict[str, str]:
    return {k: v["state"] for k, v in b.items()}


def evidence(b: dict, kind: str) -> list:
    return [e["value"] for e in b["evidence"] if e["kind"] == kind]


async def test_seed_v1(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    b = await city(client)
    assert b["B07"]["state"] == "warning" and evidence(b["B07"], "findingId")
    assert b["B01"]["state"] == "warning" and evidence(b["B01"], "proposalId") == [
        12,
        13,
    ]  # open #12 and #13
    for k in ("B02", "B03", "B04", "B05", "B06"):
        assert b[k]["state"] == "normal", k
    assert b["B08"]["state"] == "warning" and all(x["reasonVi"] for x in b.values())


async def test_after_policy_v2(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    b = await city(client)
    assert b["B07"]["state"] == "normal"
    assert b["B01"]["state"] == "recovery"  # proposal just executed (beats open #12)
    assert evidence(b["B01"], "txHash")
    assert b["B08"]["state"] == "recovery"


async def test_scene4_steps_1_to_5_lock_and_step7(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    await client.post("/api/agent/run-once")
    b = await city(client)
    assert b["B06"]["state"] == "normal" and evidence(b["B06"], "txHash")
    await client.post("/api/scenario/scene4/run?delay=0&wait=true")
    b = await city(client)
    assert b["B04"]["state"] == "incident"
    assert evidence(b["B04"], "reasonCode") == ["DISTRICT_DAILY_CAP"]
    assert b["B03"]["state"] == "warning" and "25.000/30.000" in b["B03"]["reasonVi"]
    assert b["B05"]["state"] == "normal" and b["B08"]["state"] == "incident"

    await client.post("/api/actions/lock", json={"member": "lan", "principalId": "minh"})
    b = await city(client)
    assert b["B05"]["state"] == "recovery" and "minh" in evidence(b["B05"], "principalId")
    assert evidence(b["B05"], "txHash")
    assert b["B04"]["state"] == "recovery"  # offending district is locked now

    await client.post("/api/scenario/scene4/step7")
    b = await city(client)
    assert b["B05"]["state"] == "incident"  # shield repels the locked card
    assert evidence(b["B05"], "reasonCode") == ["BLOCKED_AT_PROTOCOL"]

    # agent after the lock: refused by simulate (DISTRICT_LOCKED), no tx -> B06 warning
    a = (await client.post("/api/agent/run-once")).json()
    assert a["outcome"] == "blocked" and a["txHash"] is None
    assert (await city(client))["B06"]["state"] == "warning"


async def test_windows_expire(client: httpx.AsyncClient, rt: Runtime) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    await client.post("/api/scenario/scene4/run?delay=0&wait=true")
    assert (await city(client))["B04"]["state"] == "incident"
    t = rt.clock()
    rt.clock = lambda: t + cs.ATTEMPT_WINDOW_S + cs.RECOVERY_WINDOW_S + 1  # type: ignore[method-assign]
    b = await city(client)
    assert b["B04"]["state"] == "normal" and b["B01"]["state"] == "warning"  # open #12 remains


async def test_pause_makes_vault_incident(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/actions/pause", json={"member": "trang"})
    b = await city(client)
    assert b["B03"]["state"] == "incident" and evidence(b["B03"], "reasonCode") == ["VAULT_PAUSED"]
    assert b["B08"]["state"] == "incident"


async def test_conflicted_approval_is_incident_and_assistant_warning(
    client: httpx.AsyncClient,
) -> None:
    await client.post("/api/demo/reset")
    key = (await client.get("/api/districts/agent_rebalance")).json()["keys"][0]["address"]
    p = (
        await client.post(
            "/api/proposals",
            json={"member": "lan", "change": {"kind": "move_key", "key": key, "to": "huy"}},
        )
    ).json()
    r = await client.post(f"/api/proposals/{p['id']}/approve", json={"member": "huy"})
    assert r.status_code == 409
    b = await city(client)
    assert b["B01"]["state"] == "incident"
    assert evidence(b["B01"], "reasonCode") == ["CONFLICT_OF_INTEREST"]
    # unverified assistant answer -> B02 warning (simulate by logging one)
    from guardian.services.runtime import AssistantLogRec

    rtm = client._transport.app.state.runtime  # type: ignore[attr-defined]
    rtm.stores.assistant_logs.add(AssistantLogRec(99, 0, "x", "x", "x", False))
    assert (await city(client))["B02"]["state"] == "warning"


async def test_city_updated_published_on_change(client: httpx.AsyncClient, rt: Runtime) -> None:
    q = rt.bus.subscribe()
    await client.post("/api/actions/pause", json={"member": "trang"})
    seen = []
    while not q.empty():
        seen.append(q.get_nowait())
    types = [t for t, _ in seen]
    assert "city_updated" in types and "graph_updated" in types and "event" in types
    city_evt = next(d for t, d in seen if t == "city_updated")
    assert {x["id"]: x["state"] for x in city_evt["buildings"]}["B03"] == "incident"


async def test_b04_payroll_rules_added_after_old_ones(client: httpx.AsyncClient) -> None:
    """CITY-006: payroll kill = incident; the old B04 rules stay first and unchanged."""
    from guardian.shared.buildings import BUILDING_BY_ID

    ids = [r.id for r in BUILDING_BY_ID["B04"].rules]
    assert ids[-4:] == [
        "B04.blocked_open",
        "B04.blocked_locked",
        "B04.payroll_kill",
        "B04.payroll_at_risk",
    ]
    await client.post("/api/demo/reset")
    assert (await city(client))["B04"]["state"] == "normal"
    await client.post("/api/payroll/kill", json={"member": "lan"})
    assert (await city(client))["B04"]["state"] == "incident"
