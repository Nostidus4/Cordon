"""CITY_OPS API (docs/spec/CITY_OPS.md): buildings, faults F01-F07, incidents, agent runs, assistant logs."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services import responder as rsp
from guardian.services.runtime import Runtime
from guardian.shared.buildings import BUILDINGS
from guardian.shared.reason_codes import ReasonCode
from tests.conftest import T0, make_settings


async def get(c: httpx.AsyncClient, url: str, ok: int = 200, **kw: Any) -> Any:
    r = await c.get(url, **kw)
    assert r.status_code == ok, r.text
    return r.json()


async def post(c: httpx.AsyncClient, url: str, body: Any = None, ok: int = 200) -> Any:
    r = await c.post(url, json=body)
    assert r.status_code == ok, r.text
    return r.json()


async def to_v2(c: httpx.AsyncClient) -> None:
    await post(c, "/api/demo/reset")
    await post(c, "/api/demo/policy-v2")


def reasons(res: dict[str, Any]) -> list[str | None]:
    return [a["reasonCode"] for a in res["actions"]]


# ------------------------------------------------------------------ buildings
async def test_buildings_list_matches_registry(client: httpx.AsyncClient) -> None:
    items = await get(client, "/api/city/buildings")
    assert [b["id"] for b in items] == [f"B0{i}" for i in range(1, 9)]
    for item, b in zip(items, BUILDINGS, strict=True):
        assert item["name"] == b.name and item["module"] == b.module
        assert [r["id"] for r in item["rules"]] == [r.id for r in b.rules]
        assert item["summaryVi"]
    b03 = next(b for b in items if b["id"] == "B03")
    assert [r["id"] for r in b03["rules"]] == [
        "B03.incident_open",
        "B03.incident_recovering",
        "B03.paused",
        "B03.near_cap",
    ]


async def test_city_states_use_new_names(client: httpx.AsyncClient) -> None:
    states = await get(client, "/api/city/states")
    assert [b["name"] for b in states["buildings"]] == [b.name for b in BUILDINGS]


async def test_building_detail_seed(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    d = await get(client, "/api/city/buildings/B01")
    assert d["state"] == "warning" and d["activeRuleId"] == "B01.pending"
    assert {r["id"]: r["active"] for r in d["rules"]}["B01.pending"] is True
    assert d["incidentId"] is None and d["faults"] == ["F01_CONFLICT_APPROVAL"]
    assert [e["kind"] for e in d["evidence"]] == ["proposalId", "proposalId"]
    assert {r["ref"] for r in d["recent"]} >= {"proposal:12", "proposal:13"}
    normal = await get(client, "/api/city/buildings/B03")
    assert normal["state"] == "normal" and normal["activeRuleId"] is None
    assert not any(r["active"] for r in normal["rules"])
    assert normal["faults"] == ["F03_VAULT_DRAIN"]


async def test_building_detail_404(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/city/buildings/B99")
    assert r.status_code == 404 and r.json()["error"]["code"] == "BUILDING_NOT_FOUND"


async def test_building_detail_paused_rule_and_recent(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    await post(client, "/api/actions/pause", {"member": "trang"})
    d = await get(client, "/api/city/buildings/B03")
    assert d["state"] == "incident"
    holding = {r["id"] for r in d["rules"] if r["active"]}
    assert holding == {"B03.incident_open", "B03.paused"}
    assert d["activeRuleId"] == "B03.incident_open" and d["incidentId"] is not None
    kinds = {r["kind"] for r in d["recent"]}
    assert {"event", "incident"} <= kinds
    assert len(d["recent"]) <= 10
    ts = [r["ts"] for r in d["recent"]]
    assert ts == sorted(ts, reverse=True)


# ------------------------------------------------------------------ agent runs / assistant logs
async def test_agent_runs_and_steps(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    assert await get(client, "/api/agent/runs") == []
    run = await post(client, "/api/agent/run-once")
    runs = await get(client, "/api/agent/runs")
    assert [r["id"] for r in runs] == [run["id"]]
    steps = {s["key"]: s for s in runs[0]["steps"]}
    assert list(steps) == ["read", "decide", "simulate", "send", "explain"]
    assert steps["decide"]["status"] == "ok" and steps["simulate"]["status"] == "ok"
    assert steps["send"]["detail"]["txHash"] == run["txHash"]
    assert steps["explain"]["detail"]["reasonHash"] == run["reasonHash"]
    assert runs[0]["untrustedInput"] is None and runs[0]["injectionIgnored"] is None
    assert len(await get(client, "/api/agent/runs", params={"limit": 1})) == 1


async def test_assistant_logs_oldest_first_and_limit(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    assert await get(client, "/api/assistant/logs") == []
    qs = ["simulate.huy_too", "simulate.why_flag", "simulate.how_fix"]
    for q in qs:
        await post(client, "/api/assistant/ask", {"question": q, "context": {"screen": "x"}})
    logs = await get(client, "/api/assistant/logs")
    assert [lg["questionId"] for lg in logs] == qs
    assert all(isinstance(lg["numbersVerified"], bool) for lg in logs)
    assert logs[0]["id"] < logs[1]["id"] < logs[2]["id"]
    assert [lg["questionId"] for lg in await get(client, "/api/assistant/logs?limit=2")] == qs[1:]


# ------------------------------------------------------------------ faults: catalogue, guards
async def test_fault_catalogue(client: httpx.AsyncClient) -> None:
    faults = await get(client, "/api/faults")
    assert [f["id"] for f in faults] == [
        "F01_CONFLICT_APPROVAL",
        "F02_ASSISTANT_INJECTION",
        "F03_VAULT_DRAIN",
        "F04_OVER_CAP",
        "F05_KEY_LEAK",
        "F06_AGENT_INJECTION",
        "F07_AGENT_CAP",
    ]
    assert all(f["whatVi"] and f["expectVi"] and f["titleVi"] for f in faults)
    assert {f["building"] for f in faults} == {"B01", "B02", "B03", "B04", "B05", "B06"}


async def test_fault_unknown_404(client: httpx.AsyncClient) -> None:
    r = await client.post("/api/faults/F99_NOPE/inject")
    assert r.status_code == 404 and r.json()["error"]["code"] == "FAULT_NOT_FOUND"


async def test_fault_requires_demo_mode() -> None:
    settings = make_settings(demo_mode=False)
    app = create_app(settings, Runtime(settings, chain=SimChain(clock=lambda: T0)))
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c,
    ):
        assert (await c.get("/api/faults")).status_code == 200  # read-only
        r = await c.post("/api/faults/F03_VAULT_DRAIN/inject")
        assert r.status_code == 403 and r.json()["error"]["code"] == "DEMO_MODE_REQUIRED"
        assert (await c.get("/api/incidents")).json() == []


# ------------------------------------------------------------------ faults F01-F07 on the sim
async def test_f01_conflict_approval(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    res = await post(client, "/api/faults/F01_CONFLICT_APPROVAL/inject")
    assert res["building"] == "B01" and res["faultId"] == "F01_CONFLICT_APPROVAL"
    last = res["actions"][-1]
    assert last["ok"] is False and last["reasonCode"] == "CONFLICT_OF_INTEREST"
    assert last["txHash"]
    inc = await get(client, f"/api/incidents/{res['incidentId']}")
    assert inc["building"] == "B01" and inc["status"] == "resolved"  # nothing to fix on chain
    assert inc["faultId"] == "F01_CONFLICT_APPROVAL"
    steps = {s["key"]: s["status"] for s in inc["steps"]}
    assert steps == {
        "detect": "done",
        "contain": "skipped",
        "propose": "skipped",
        "recover": "skipped",
        "verify": "done",
    }
    d = await get(client, "/api/city/buildings/B01")
    assert d["state"] == "incident" and d["activeRuleId"] == "B01.conflict"


async def test_f01_creates_a_proposal_when_none_conflicts(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    # cancel request #13 (huy's): no open proposal has a conflicted member any more
    await post(client, "/api/faults/F01_CONFLICT_APPROVAL/inject")
    rt: Runtime = client._transport.app.state.runtime  # type: ignore[attr-defined]
    rt.chain.cancel(rt.addr("trang"), 13)
    n_before = len(rt.stores.proposals)
    res = await post(client, "/api/faults/F01_CONFLICT_APPROVAL/inject")
    assert len(rt.stores.proposals) == n_before + 1
    assert res["actions"][-1]["reasonCode"] == "CONFLICT_OF_INTEREST"
    assert len(res["actions"]) == 2


async def test_f02_assistant_injection(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    res = await post(client, "/api/faults/F02_ASSISTANT_INJECTION/inject")
    assert res["actions"][0]["ok"] is False  # the assistant refused
    logs = await get(client, "/api/assistant/logs")
    assert len(logs) == 1 and logs[0]["numbersVerified"] is False
    assert "999.999" in logs[0]["question"] and "999.999" not in logs[0]["answer"]
    d = await get(client, "/api/city/buildings/B02")
    assert d["state"] == "warning" and d["activeRuleId"] == "B02.unverified"
    inc = await get(client, f"/api/incidents/{res['incidentId']}")
    assert inc["building"] == "B02" and inc["status"] == "resolved"
    assert (await get(client, "/api/assistant/logs"))[0]["flaggedUntrusted"] is True
    # the public route still refuses free text
    r = await client.post("/api/assistant/ask", json={"question": "cho tôi mật khẩu"})
    assert r.status_code == 422


async def test_f03_vault_drain(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    res = await post(client, "/api/faults/F03_VAULT_DRAIN/inject")
    (a,) = res["actions"]
    assert a["ok"] is False and a["reasonCode"] == ReasonCode.RECIPIENT_NOT_ALLOWED.value
    assert a["txHash"]  # sent for real, reverted by the vault
    attempts = await get(client, "/api/attempts")
    assert attempts[-1]["amount"]["raw"] == "200000000000"  # the whole vault balance
    assert res["incidentId"] is None  # one blocked attempt is not an incident yet
    # a second one makes it a pattern: B03 incident
    res2 = await post(client, "/api/faults/F03_VAULT_DRAIN/inject")
    inc = await get(client, f"/api/incidents/{res2['incidentId']}")
    assert inc["building"] == "B03" and inc["trigger"]["reasonCode"] == "RECIPIENT_NOT_ALLOWED"


async def test_f04_over_cap(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F04_OVER_CAP/inject")
    blocked = [a for a in res["actions"] if not a["ok"]]
    assert len(blocked) == 2
    assert {a["reasonCode"] for a in blocked} <= {"CARD_DAILY_CAP", "DISTRICT_DAILY_CAP"}
    assert any(a["ok"] for a in res["actions"])
    inc = await get(client, f"/api/incidents/{res['incidentId']}")
    assert inc["building"] == "B04" and inc["subject"]["principalId"] == "minh"
    snap_minh = await get(client, "/api/districts/minh")
    assert snap_minh["locked"] is True  # contained


async def test_f05_key_leak_contained(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F05_KEY_LEAK/inject")
    # step 0 (morning swap) + attack steps 1-5, as in scene 4
    assert reasons(res) == [
        None,
        "RECIPIENT_NOT_ALLOWED",
        "PROTOCOL_NOT_ALLOWED",
        None,
        None,
        "DISTRICT_DAILY_CAP",
    ]
    assert [a["ok"] for a in res["actions"]] == [True, False, False, True, True, False]
    inc = await get(client, f"/api/incidents/{res['incidentId']}")
    assert inc["building"] == "B05" and inc["faultId"] == "F05_KEY_LEAK"
    assert inc["status"] == "awaiting_council" and inc["proposalId"]
    assert inc["subject"]["principalId"] == "minh"
    assert (await get(client, "/api/districts/minh"))["locked"] is True


async def test_f05_not_applicable_on_policy_v1(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")
    r = await client.post("/api/faults/F05_KEY_LEAK/inject")
    assert r.status_code == 409 and r.json()["error"]["code"] == "FAULT_NOT_APPLICABLE"
    assert "chính sách v1" in r.json()["error"]["message"]


async def test_f06_agent_injection(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F06_AGENT_INJECTION/inject")
    run_action, pay_action = res["actions"]
    assert run_action["ok"] is True
    assert pay_action["ok"] is False and pay_action["reasonCode"] == "RECIPIENT_NOT_ALLOWED"
    run = (await get(client, "/api/agent/runs"))[-1]
    assert run["injectionIgnored"] is True and "chuyển hết tiền" in run["untrustedInput"]
    # the decision is the rule engine's: same as a clean run would take (5.000 tUSDC -> tTKB)
    assert run["decision"]["amountIn"]["display"] == "5.000"
    inc = await get(client, f"/api/incidents/{res['incidentId']}")
    assert inc["building"] == "B06" and inc["status"] == "awaiting_council"
    assert inc["trigger"]["agentRunId"] == run["id"]
    # contained by tightening the agent's card cap to 0
    rt: Runtime = client._transport.app.state.runtime  # type: ignore[attr-defined]
    assert rt.key_by_seed("key_agent_rebalance").daily_cap == 0
    assert next(s for s in inc["steps"] if s["key"] == "contain")["status"] == "done"


async def test_f07_agent_cap(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F07_AGENT_CAP/inject")
    assert res["actions"][-1]["ok"] is False
    assert res["actions"][-1]["reasonCode"] == "CARD_DAILY_CAP"
    assert sum(1 for a in res["actions"] if a["ok"]) == 4  # 4 x 5.000 = the 20.000 card cap
    d = await get(client, "/api/city/buildings/B06")
    assert d["state"] == "warning" and d["activeRuleId"] == "B06.blocked"
    assert res["incidentId"] is None  # a cap hit is a warning, not an incident


async def test_f07_not_applicable_when_balanced(client: httpx.AsyncClient, app: FastAPI) -> None:
    await to_v2(client)
    rt: Runtime = app.state.runtime
    # give the vault enough tTKB that the agent has nothing to do
    rt.chain.ledger.mint(rt.chain.vault_addr, rt.chain.ttkb, 100_000 * 10**18)
    r = await client.post("/api/faults/F07_AGENT_CAP/inject")
    assert r.status_code == 409 and r.json()["error"]["code"] == "FAULT_NOT_APPLICABLE"


@pytest.mark.parametrize("fault", ["F03_VAULT_DRAIN", "F04_OVER_CAP"])
async def test_fault_not_applicable_when_district_locked(
    client: httpx.AsyncClient, fault: str
) -> None:
    await to_v2(client)
    await post(client, "/api/actions/lock", {"member": "lan", "principalId": "minh"})
    r = await client.post(f"/api/faults/{fault}/inject")
    assert r.status_code == 409 and r.json()["error"]["code"] == "FAULT_NOT_APPLICABLE"


# ------------------------------------------------------------------ incidents endpoints
async def test_incidents_endpoints(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    assert await get(client, "/api/incidents") == []
    res = await post(client, "/api/faults/F05_KEY_LEAK/inject")
    iid = res["incidentId"]
    assert [i["id"] for i in await get(client, "/api/incidents")] == [iid]
    assert [i["id"] for i in await get(client, "/api/incidents?status=open")] == [iid]
    one = await get(client, f"/api/incidents/{iid}")
    assert [s["key"] for s in one["steps"]] == ["detect", "contain", "propose", "recover", "verify"]
    assert one["trigger"]["attemptIds"] and one["openedAt"] and one["resolvedAt"] is None
    r = await client.get("/api/incidents/999")
    assert r.status_code == 404 and r.json()["error"]["code"] == "INCIDENT_NOT_FOUND"
    r = await client.get("/api/incidents?status=bogus")
    assert r.status_code == 422


async def test_incident_updated_sse(client: httpx.AsyncClient, rt: Runtime) -> None:
    await to_v2(client)
    q = rt.bus.subscribe()
    await post(client, "/api/faults/F05_KEY_LEAK/inject")
    seen = []
    while not q.empty():
        seen.append(q.get_nowait())
    updates = [d for t, d in seen if t == "incident_updated"]
    assert updates and updates[-1]["status"] == "awaiting_council"
    assert {u["status"] for u in updates} >= {"detected", "awaiting_council"}
    from guardian.schemas.stream import SSE_EVENT_TYPES

    assert "incident_updated" in SSE_EVENT_TYPES


async def test_demo_reset_clears_incidents(client: httpx.AsyncClient) -> None:
    await to_v2(client)
    await post(client, "/api/faults/F05_KEY_LEAK/inject")
    await post(client, "/api/demo/reset")
    assert await get(client, "/api/incidents") == []
    states = await get(client, "/api/city/states")
    assert {b["id"]: b["state"] for b in states["buildings"]}["B05"] == "normal"


# ------------------------------------------------------------------ end to end
async def test_f05_end_to_end_contain_council_recover_resolve(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F05_KEY_LEAK/inject")
    iid = res["incidentId"]
    inc = await get(client, f"/api/incidents/{iid}")

    # contained: the district is locked on chain, by a Council member outside the district
    assert inc["status"] == "awaiting_council"
    contain = next(s for s in inc["steps"] if s["key"] == "contain")
    assert contain["status"] == "done" and contain["txHash"]
    assert (await get(client, "/api/districts/minh"))["locked"] is True
    pid = inc["proposalId"]
    assert pid and next(s for s in inc["steps"] if s["key"] == "propose")["status"] == "active"
    prop = await get(client, f"/api/proposals/{pid}")
    assert prop["status"] == "open" and prop["subjectPrincipal"] == "minh"
    assert [c["fn"] for c in prop["calls"]] == [
        "deactivateKey",
        "unlockPrincipal",
        "bumpPolicyVersion",
    ]
    # fixing needs the Council: nothing was loosened by the responder
    assert (await get(client, "/api/districts/minh"))["locked"] is True

    states = {b["id"]: b for b in (await get(client, "/api/city/states"))["buildings"]}
    assert states["B05"]["state"] == "incident"
    d5 = await get(client, "/api/city/buildings/B05")
    assert d5["activeRuleId"] == "B05.incident_open" and d5["incidentId"] == iid
    assert states["B08"]["state"] == "incident"

    # the Council (2/3): trang and lan (huy would also do; none of them lives in minh)
    await post(client, f"/api/proposals/{pid}/approve", {"member": "trang"})
    mid = await get(client, f"/api/incidents/{iid}")
    assert mid["status"] == "awaiting_council"  # 1/2 only
    await post(client, f"/api/proposals/{pid}/approve", {"member": "lan"})
    inc = await get(client, f"/api/incidents/{iid}")
    assert inc["status"] == "recovering"
    assert next(s for s in inc["steps"] if s["key"] == "recover")["status"] == "done"
    assert next(s for s in inc["steps"] if s["key"] == "verify")["status"] == "active"
    assert (await get(client, "/api/districts/minh"))["locked"] is False
    d5 = await get(client, "/api/city/buildings/B05")
    assert d5["state"] == "recovery" and d5["activeRuleId"] == "B05.incident_recovering"

    # recovering -> resolved once the quiet window has passed with no new blocked attempts
    now = rt.now()
    rt.clock = lambda: now + 301
    inc = await get(client, f"/api/incidents/{iid}")
    assert inc["status"] == "resolved" and inc["resolvedAt"] == now + 301
    assert all(s["status"] == "done" for s in inc["steps"])
    d5 = await get(client, "/api/city/buildings/B05")
    assert d5["state"] != "incident" and d5["incidentId"] is None
    assert d5["activeRuleId"] not in ("B05.incident_open", "B05.incident_recovering")
    assert await get(client, "/api/incidents?status=open") == []


async def test_recovery_waits_for_quiet_period(client: httpx.AsyncClient, rt: Runtime) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F05_KEY_LEAK/inject")
    iid = res["incidentId"]
    pid = (await get(client, f"/api/incidents/{iid}"))["proposalId"]
    for m in ("trang", "lan"):
        await post(client, f"/api/proposals/{pid}/approve", {"member": m})
    q = rsp.QUIET_WINDOW_S
    now = rt.now()
    rt.clock = lambda: now + q // 3
    assert (await get(client, f"/api/incidents/{iid}"))["status"] == "recovering"
    # a NEW blocked attempt in the district during recovery pushes the quiet period back
    rt.clock = lambda: now + 2 * q // 3
    await post(client, "/api/faults/F03_VAULT_DRAIN/inject")
    # past the quiet window since recovery began, not since the new attempt
    rt.clock = lambda: now + q + 1
    assert (await get(client, f"/api/incidents/{iid}"))["status"] == "recovering"
    rt.clock = lambda: now + 2 * q + 1
    assert (await get(client, f"/api/incidents/{iid}"))["status"] == "resolved"
