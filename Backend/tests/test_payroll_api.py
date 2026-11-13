"""/api/payroll/* (CITY-006, PAYROLL.md section 8): reads, demo controls (DEMO_MODE only), kill, proposals, reset."""

from __future__ import annotations

from typing import Any

import httpx

from guardian.services.runtime import Runtime
from tests.test_payroll_api_helpers import DAY, no_demo_client  # noqa: F401


async def test_state_shape_and_guarantee(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/payroll")
    assert r.status_code == 200
    s = r.json()
    assert s["payrollTotal"]["display"] == "30.000"
    assert s["phase"] == "accruing" and not s["killed"] and not s["executed"]
    assert s["guarantee"]["ok"] and s["coverageOk"]
    assert [v["id"] for v in s["venues"]] == ["venue_a", "venue_b"]
    assert len(s["roster"]) == 10 and len(s["rungs"]) == 4
    assert s["vaultCoversPayroll"] is True  # Pr = P fully idle at the start


async def test_reads(client: httpx.AsyncClient) -> None:
    assert len((await client.get("/api/payroll/venues")).json()) == 2
    assert len((await client.get("/api/payroll/roster")).json()) == 10
    lad = (await client.get("/api/payroll/ladder")).json()
    assert lad["currentIndex"] == -1 and len(lad["curve"]) == 6
    assert (await client.get("/api/payroll/events?limit=5")).status_code == 200
    assert (await client.get("/api/payroll/runs")).json() == []
    rep = (await client.get("/api/payroll/report")).json()
    assert rep["reasonSource"] == "template" and rep["text"]


async def test_advance_freeze_kill_and_reset(client: httpx.AsyncClient) -> None:
    s0 = (await client.get("/api/payroll")).json()
    r = await client.post("/api/payroll/demo/advance", json={"seconds": 20 * DAY})
    assert r.status_code == 200 and r.json()["now"] >= s0["now"] + 20 * DAY
    r = await client.post("/api/payroll/demo/venues/venue_b/freeze")
    assert r.json()["venues"][1]["frozen"] is True
    assert (await client.post("/api/payroll/demo/venues/nope/freeze")).status_code == 404
    k = (await client.post("/api/payroll/kill", json={"member": "lan"})).json()
    assert k["ok"]
    assert (await client.get("/api/payroll")).json()["killed"] is True
    again = (await client.post("/api/payroll/kill", json={"member": "lan"})).json()
    assert again["ok"] is False  # already on: NotTightening
    st = (await client.post("/api/payroll/demo/reset")).json()
    assert st["killed"] is False and st["venues"][1]["frozen"] is False
    assert st["now"] < s0["now"] + DAY  # virtual clock rewound


async def test_kill_makes_b04_incident_and_agent_stops(client: httpx.AsyncClient) -> None:
    await client.post("/api/payroll/kill", json={"member": "lan"})
    b = {x["id"]: x for x in (await client.get("/api/city/states")).json()["buildings"]}
    assert b["B04"]["state"] == "incident"
    run = (await client.post("/api/payroll/agent/run", json={})).json()
    assert run["outcome"] == "no_action"


async def test_impaired_venue_marks_b04_warning(client: httpx.AsyncClient) -> None:
    run = (await client.post("/api/payroll/agent/run", json={})).json()
    assert run["outcome"] == "acted"
    await client.post("/api/payroll/demo/advance", json={"seconds": 16 * DAY})
    await client.post("/api/payroll/demo/venues/venue_b/freeze")
    await client.post("/api/payroll/demo/advance", json={"seconds": 8 * DAY})
    await client.post("/api/payroll/agent/run", json={})  # unwinds A, B recall fails -> impaired
    st = (await client.get("/api/payroll")).json()
    assert st["venues"][1]["impaired"] is True
    b = {x["id"]: x for x in (await client.get("/api/city/states")).json()["buildings"]}
    assert b["B04"]["state"] == "warning" and "sự cố" in b["B04"]["reasonVi"]


async def test_proposals_namespace_and_two_of_three(client: httpx.AsyncClient) -> None:
    call = {"target": "policy", "fn": "setBufferBps", "args": {"bps": 600}}
    r = await client.post(
        "/api/payroll/proposals",
        json={
            "member": "trang",
            "title": "Hạ tiền mặt",
            "calls": [call],
            "riskReportHash": "0x" + "00" * 32,
        },
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["id"] == 1 and p["status"] == "open" and p["threshold"] == 2
    a1 = (await client.post("/api/payroll/proposals/1/approve", json={"member": "trang"})).json()
    assert a1["approvals"] == 1 and a1["status"] == "open"
    a2 = (await client.post("/api/payroll/proposals/1/approve", json={"member": "lan"})).json()
    assert a2["status"] == "executed"
    assert (await client.get("/api/payroll")).json()["bufferBps"] == 600
    assert len((await client.get("/api/payroll/proposals")).json()) == 1
    assert (await client.get("/api/payroll/proposals/99")).status_code == 404


async def test_payroll_sse_updated_published(client: httpx.AsyncClient, rt: Runtime) -> None:
    seen: list[str] = []
    orig = rt.publish

    def spy(t: str, d: dict[str, Any]) -> None:
        seen.append(t)
        orig(t, d)

    rt.publish = spy  # type: ignore[method-assign]
    await client.post("/api/payroll/demo/advance", json={"seconds": DAY})
    assert "payroll_updated" in seen


async def test_demo_endpoints_refused_without_demo_mode(
    no_demo_client: httpx.AsyncClient,  # noqa: F811
) -> None:
    c = no_demo_client
    assert (await c.get("/api/payroll")).status_code == 200
    for url, body in [
        ("/api/payroll/demo/advance", {"seconds": 5}),
        ("/api/payroll/demo/scale", {"scale": 10}),
        ("/api/payroll/demo/venues/venue_b/freeze", None),
        ("/api/payroll/demo/venues/venue_b/unfreeze", None),
        ("/api/payroll/demo/reset", None),
        ("/api/payroll/kill", {"member": "lan"}),
        ("/api/payroll/agent/run", {}),
    ]:
        r = await c.post(url, json=body)
        assert r.status_code in (403, 409, 503), (url, r.status_code, r.text)


async def test_agent_run_uses_the_llm_only_when_asked(
    client: httpx.AsyncClient, monkeypatch: Any
) -> None:
    """A compressed month runs the agent once per virtual day: the CFO report must not be a paid call each time."""
    from guardian.agent_float import runner

    seen: list[bool] = []
    real = runner.write_report

    def spy(facts: Any, rt: Any = None, untrusted_input: str | None = None) -> Any:
        seen.append(rt is not None)
        return real(facts, None, untrusted_input)

    monkeypatch.setattr(runner, "write_report", spy)
    assert (await client.post("/api/payroll/agent/run", json={})).status_code == 200
    assert (await client.post("/api/payroll/agent/run")).status_code == 200
    assert (
        await client.post("/api/payroll/agent/run", json={"llmReport": True})
    ).status_code == 200
    assert seen == [False, False, True]
