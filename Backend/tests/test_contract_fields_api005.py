"""API-005 (#82): vault tTKB, assistant per-number checks, approval times, resultingPolicyVersion, edge note."""

from __future__ import annotations

from guardian.assistant.verifier import check
from tests.test_persistence import approve, ask, http, running


def test_check_reports_mismatch_unresolved_path_and_uncovered() -> None:
    ctx = {"simulate": {"a": {"display": "1.000"}, "b": 3}}
    numbers = [
        {"label": "A", "value": "1.000", "source": "simulate", "path": "simulate.a"},
        {"label": "B", "value": "4", "source": "simulate", "path": "simulate.b"},
        {"label": "C", "value": "5", "source": "simulate", "path": "simulate.missing"},
        {"label": "D", "value": "3", "source": "district", "path": "simulate.b"},  # wrong source
    ]
    checks, uncovered = check("1.000 và 4 và 7", numbers, ctx)
    assert checks == [
        {"label": "A", "value": "1.000", "toolValue": "1.000", "match": True},
        {"label": "B", "value": "4", "toolValue": "3", "match": False},
        {"label": "C", "value": "5", "toolValue": None, "match": False},
        {"label": "D", "value": "3", "toolValue": None, "match": False},
    ]
    assert uncovered == ["7"]


async def test_org_vault_tkb_matches_the_chain() -> None:
    async with running() as a, http(a) as c:
        rt = a.state.runtime
        assert (await c.post("/api/agent/run-once")).status_code == 200
        vault = (await c.get("/api/org")).json()["vault"]
        on_chain = rt.chain.balance(rt.chain.vault_addr, rt.addr("tTKB"))
        assert on_chain > 0 and vault["balanceTkb"]["raw"] == str(on_chain)
        assert vault["balance"]["raw"] == str(rt.snapshot().vault_balance)


async def test_assistant_log_has_checks_and_tool_calls() -> None:
    async with running() as a, http(a) as c:
        await ask(c)
        log = (await c.get("/api/assistant/logs")).json()[-1]
    assert log["numbersVerified"] is True
    assert log["checks"] and all(x["match"] and x["toolValue"] == x["value"] for x in log["checks"])
    assert log["uncovered"] == []
    assert {"name": "simulate_compromise", "args": {"principals": ["minh", "huy"]}} in log[
        "toolCalls"
    ]


async def test_approval_times_and_resulting_policy_version() -> None:
    async with running() as a, http(a) as c:
        await approve(c, 12, "lan")
        p = (await c.get("/api/proposals/12")).json()
        at = {m["id"]: m["approvedAt"] for m in p["members"]}
        assert at["lan"] is not None and at["trang"] is None and at["huy"] is None
        assert p["resultingPolicyVersion"] is None
        await approve(c, 12, "trang")
        p = (await c.get("/api/proposals/12")).json()
        assert p["status"] == "executed" and p["resultingPolicyVersion"] == 2
        assert all(isinstance(m["approvedAt"], int) for m in p["members"] if m["id"] != "huy")


async def test_declared_edges_carry_their_note() -> None:
    async with running() as a, http(a) as c:
        edges = (await c.get("/api/graph")).json()["edges"]
    declared = [e for e in edges if e["source"] == "declared"]
    assert declared and all(e["note"] for e in declared)
    assert all(e["note"] is None for e in edges if e["source"] != "declared")
