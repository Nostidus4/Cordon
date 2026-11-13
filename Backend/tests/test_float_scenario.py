"""PAYROLL.md section 8 demo month through the API on the sim: agent allocates and unwinds, venue B freezes on
day 20, the deadline finalizes, the vault holds the payroll on payday, execute pays the 10 payees (AC1)."""

from __future__ import annotations

import httpx

from tests.test_payroll_api_helpers import DAY


async def _state(c: httpx.AsyncClient) -> dict:
    return (await c.get("/api/payroll")).json()


async def _day(c: httpx.AsyncClient) -> None:
    await c.post("/api/payroll/demo/advance", json={"seconds": DAY})
    await c.post("/api/payroll/agent/run", json={})


async def test_month_with_frozen_venue_ends_with_full_payroll(client: httpx.AsyncClient) -> None:
    s = await _state(client)
    p = int(s["payrollTotal"]["raw"])
    day0 = s["now"]
    await client.post("/api/payroll/agent/run", json={})
    s = await _state(client)
    assert int(s["deployedTotal"]["raw"]) > 0  # money placed at venues on day 0
    assert all(int(v["deployed"]["raw"]) <= int(v["capAmount"]["raw"]) for v in s["venues"])
    for d in range(1, 29):
        if d == 20:
            await client.post("/api/payroll/demo/venues/venue_b/freeze")
        await _day(client)
        s = await _state(client)
        assert s["guarantee"]["ok"], d  # coverage kept every day
    assert any(v["impaired"] for v in s["venues"])  # B detected as stuck
    # up to the deadline (T-1): allocate is dead, finalize is permissionless
    await client.post(
        "/api/payroll/demo/advance", json={"seconds": max(0, s["deadline"] - s["now"])}
    )
    fin = (await client.post("/api/payroll/finalize")).json()
    assert fin["ok"], fin
    s = await _state(client)
    assert s["killed"] and s["killReason"] == 2
    assert int(s["idle"]["raw"]) >= p, "AC1: vault holds the payroll total after the deadline"
    # payday
    await client.post("/api/payroll/demo/advance", json={"seconds": max(0, s["payday"] - s["now"])})
    ex = (await client.post("/api/payroll/execute")).json()
    assert ex["ok"], ex
    s = await _state(client)
    assert s["executed"] and s["phase"] == "paid"
    assert all(x["paid"] for x in s["roster"]) and len(s["roster"]) == 10
    assert s["now"] >= day0 + 30 * DAY - DAY
    second = (await client.post("/api/payroll/execute")).json()
    assert second["ok"] is False and second["reasonCode"] == "PAYROLL_ALREADY_PAID"


async def test_execute_before_payday_is_refused_with_reason(client: httpx.AsyncClient) -> None:
    r = (await client.post("/api/payroll/execute")).json()
    assert r["ok"] is False and r["reasonCode"] == "PAYDAY_NOT_REACHED"
    assert r["reasonVi"]
