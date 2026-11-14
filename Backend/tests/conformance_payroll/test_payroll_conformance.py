"""Payroll conformance (PAYROLL.md section 6.3, AC3): each scenario runs on SimPayroll and, when Foundry is installed,
on the real contracts on anvil; the normalised result of every step and the final view must be identical.

Per scenario: the sim run is checked against hand-written expectations (always executed); the l1 run is compared with
the sim transcript step by step. The l1 variants skip with a reason when `anvil`/`forge` are missing.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

from guardian.chain.sim import payroll as sp
from tests.conformance_payroll.payroll_harness import DAY, PNet, make_sim_net, norm, u

AGENT, KEEPER = sp.PAYROLL_AGENT, sp.PAYROLL_KEEPER
M0, M1, M2 = sp.DEFAULT_MEMBERS
A, B, EVIL = sp.VENUE_A, sp.VENUE_B, sp.EVIL_VENUE
Transcript = list[dict[str, Any]]


class Rec:
    def __init__(self, net: PNet) -> None:
        self.net, self.t = net, []

    def step(self, name: str, res: Any = None) -> Any:
        self.t.append({"step": name, "res": norm(res) if res is not None else None})
        return res

    def end(self) -> Transcript:
        self.t.append({"step": "final", "res": None, "view": self.net.snap()})
        return self.t


def _prop(r: Rec, member: str, calls: list[dict[str, Any]], name: str) -> int:
    res = r.step(name, r.net.chain.propose(member, "t", calls, "0x" + "00" * 32))
    assert res.status == "ok", norm(res)
    return int(res.proposal_id)


def _call(target: str, fn: str, **args: Any) -> dict[str, Any]:
    return {"target": target, "fn": fn, "args": args}


# ------------------------------------------------------------------ scenarios
def s1_allocate(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("alloc A", c.allocate(AGENT, A, u(12_000)))
    r.step("alloc B", c.allocate(AGENT, B, u(12_000)))
    r.step("unwind part A", c.unwind(AGENT, A, u(1_000)))
    return r.end()


def s2_denials(net: PNet) -> Transcript:
    """Every reachable refusal of 2.3.1 in order; BUFFER_BREACHED is unreachable through public calls (ladder ceiling
    = 100% - buffer implies the buffer), it is covered by the Foundry unit tests."""
    r, c = Rec(net), net.chain
    r.step("not allowed", c.allocate(AGENT, EVIL, u(1_000)))
    r.step("cap", c.allocate(AGENT, A, u(12_001)))
    r.step("ok A", c.allocate(AGENT, A, u(12_000)))
    r.step("ok B small", c.allocate(AGENT, B, u(6_000)))
    net.advance_days(23.5)  # ceiling 30% = 9.000 while 18.000 is out
    r.step("ladder ceiling", c.allocate(AGENT, B, u(100)))
    net.advance_days(5.5)  # past the deadline
    r.step("deadline", c.allocate(AGENT, B, u(100)))
    return r.end()


def s2b_kill_impaired_coverage(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("kill", c.kill_switch(M1))
    r.step("alloc after kill", c.allocate(AGENT, A, u(1_000)))
    return r.end()


def s2c_impaired(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("A", c.allocate(AGENT, A, u(6_000)))
    r.step("B", c.allocate(AGENT, B, u(6_000)))
    net.advance_days(16.5)
    net.freeze_b()
    r.step("unwind B fails", c.unwind(AGENT, B, u(1_000)))
    r.step("alloc B impaired", c.allocate(AGENT, B, u(1_000)))
    return r.end()


def s2d_coverage(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    pid = _prop(r, M0, [_call("vault", "returnReserve", amount=u(3_000))], "propose returnReserve")
    r.step("approve 1", c.approve(M0, pid))
    r.step("approve 2 executes", c.approve(M1, pid))
    r.step("alloc over coverage", c.allocate(AGENT, A, u(10_000)))
    return r.end()


def s3_ladder(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("A", c.allocate(AGENT, A, u(11_111) + 111_111))
    r.step("B", c.allocate(AGENT, B, u(12_000)))
    net.advance_days(16.5)
    r.step("due A", c.unwind_due(KEEPER, A))
    r.step("due B", c.unwind_due(KEEPER, B))
    r.step("due again", c.unwind_due(KEEPER, A))
    net.advance_days(7)
    r.step("due A rung 2", c.unwind_due(KEEPER, A))
    r.step("due B rung 2", c.unwind_due(KEEPER, B))
    return r.end()


def s4_finalize_healthy(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("A", c.allocate(AGENT, A, u(12_000)))
    r.step("early finalize", c.finalize(KEEPER))
    net.advance_days(29.5)
    r.step("finalize", c.finalize(KEEPER))
    r.step("finalize again", c.finalize(KEEPER))
    return r.end()


def s5_frozen_then_paid(net: PNet) -> Transcript:
    """Section 8 month: B freezes on day 20, deadline finalize releases reserve, execute pays (AC1)."""
    r, c = Rec(net), net.chain
    r.step("A", c.allocate(AGENT, A, u(12_000)))
    r.step("B", c.allocate(AGENT, B, u(12_000)))
    net.advance_days(16.5)
    r.step("due A", c.unwind_due(KEEPER, A))
    r.step("due B", c.unwind_due(KEEPER, B))
    net.advance_days(3.5)
    net.freeze_b()
    net.advance_days(3.5)
    r.step("due A rung 2", c.unwind_due(KEEPER, A))
    r.step("due B frozen", c.unwind_due(KEEPER, B))
    net.advance_days(5.5)
    r.step("finalize", c.finalize(KEEPER))
    snap = net.snap()
    assert snap["idle"] >= snap["payroll_total"], snap  # AC1 on both implementations
    r.step("execute early", c.execute_payroll(KEEPER))
    net.advance_days(1.5)
    r.step("execute", c.execute_payroll(KEEPER))
    r.step("execute twice", c.execute_payroll(KEEPER))
    return r.end()


def s6_early_execute(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("execute early", c.execute_payroll(KEEPER))
    return r.end()


def s7_underfunded(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("A", c.allocate(AGENT, A, u(12_000)))
    r.step("B", c.allocate(AGENT, B, u(12_000)))
    net.advance_days(1)
    net.freeze_b()
    c.set_venue_frozen(A, True)  # two venues stuck: beyond k = 1
    net.advance_days(29)
    r.step("finalize", c.finalize(KEEPER))
    r.step("execute underfunded", c.execute_payroll(KEEPER))
    return r.end()


def s8_kill_and_reset(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("kill by member", c.kill_switch(M2))
    r.step("kill again", c.kill_switch(M2))
    r.step("non-member kill", c.kill_switch(KEEPER))
    r.step(
        "non-member propose",
        c.propose(KEEPER, "t", [_call("policy", "resetKill")], "0x" + "00" * 32),
    )
    pid = _prop(r, M0, [_call("policy", "resetKill")], "propose resetKill")
    r.step("approve 1", c.approve(M0, pid))
    r.step("approve again", c.approve(M0, pid))
    r.step("approve 2 executes", c.approve(M1, pid))
    r.step("alloc after reset", c.allocate(AGENT, A, u(1_000)))
    return r.end()


def s9_agent_paths(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("keeper allocates", c.allocate(KEEPER, A, u(1_000)))
    r.step("agent to EOA", c.allocate(AGENT, KEEPER, u(1_000)))
    r.step("revoke by member", c.revoke_agent(M0, AGENT))
    r.step("revoked agent", c.allocate(AGENT, A, u(1_000)))
    r.step("revoke non-member", c.revoke_agent(KEEPER, AGENT))
    return r.end()


def _roster(n: int, each: int) -> list[dict[str, Any]]:
    return [{"account": sp.PAYEES[i], "amount": u(each)} for i in range(n)]


def s10_roster(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    pid = _prop(r, M0, [_call("vault", "setRoster", roster=_roster(3, 10_000))], "propose roster")
    r.step("approve 1", c.approve(M0, pid))
    r.step("approve 2", c.approve(M1, pid))
    net.advance_days(29.5)
    pid2 = _prop(
        r, M0, [_call("vault", "setRoster", roster=_roster(3, 11_000))], "propose late roster"
    )
    r.step("late approve 1", c.approve(M0, pid2))
    r.step("late approve 2 locked", c.approve(M1, pid2))
    return r.end()


def s11_roster_breaks_coverage(net: PNet) -> Transcript:
    r, c = Rec(net), net.chain
    r.step("A", c.allocate(AGENT, A, u(12_000)))
    pid = _prop(
        r, M0, [_call("vault", "setRoster", roster=_roster(10, 4_000))], "propose bigger roster"
    )
    r.step("approve 1", c.approve(M0, pid))
    r.step("approve 2 breaks coverage", c.approve(M1, pid))
    return r.end()


# scenario -> (runner, {step: (status, reason-or-error)} expected on the sim; error name for reverts)
SCENARIOS: dict[str, tuple[Callable[[PNet], Transcript], dict[str, str]]] = {
    "allocate": (s1_allocate, {"alloc A": "ok", "alloc B": "ok", "unwind part A": "ok"}),
    "denials": (
        s2_denials,
        {
            "not allowed": "VENUE_NOT_ALLOWED",
            "cap": "VENUE_CAP_EXCEEDED",
            "ok A": "ok",
            "ok B small": "ok",
            "ladder ceiling": "LADDER_CEILING_EXCEEDED",
            "deadline": "DEADLINE_PASSED",
        },
    ),
    "kill_blocks_allocate": (
        s2b_kill_impaired_coverage,
        {"kill": "ok", "alloc after kill": "KILL_SWITCH_ACTIVE"},
    ),
    "impaired": (s2c_impaired, {"unwind B fails": "ok", "alloc B impaired": "VENUE_IMPAIRED"}),
    "coverage": (
        s2d_coverage,
        {"approve 2 executes": "ok", "alloc over coverage": "COVERAGE_INSUFFICIENT"},
    ),
    "ladder": (
        s3_ladder,
        {"due A": "ok", "due B": "ok", "due A rung 2": "ok"},
    ),
    "finalize": (
        s4_finalize_healthy,
        {"early finalize": "DeadlineNotReached", "finalize": "ok", "finalize again": "ok"},
    ),
    "frozen_then_paid": (
        s5_frozen_then_paid,
        {
            "due B frozen": "ok",
            "finalize": "ok",
            "execute early": "PAYDAY_NOT_REACHED",
            "execute": "ok",
            "execute twice": "PAYROLL_ALREADY_PAID",
        },
    ),
    "early_execute": (s6_early_execute, {"execute early": "PAYDAY_NOT_REACHED"}),
    "underfunded": (
        s7_underfunded,
        {"finalize": "ok", "execute underfunded": "PAYROLL_UNDERFUNDED"},
    ),
    "kill_and_reset": (
        s8_kill_and_reset,
        {
            "kill by member": "ok",
            "kill again": "NotTightening",
            "non-member kill": "NotCouncilMember",
            "non-member propose": "NotCouncilMember",
            "approve again": "AlreadyApproved",
            "approve 2 executes": "ok",
            "alloc after reset": "ok",
        },
    ),
    "agent_paths": (
        s9_agent_paths,
        {
            "keeper allocates": "AGENT_NOT_AUTHORIZED",
            "agent to EOA": "VENUE_NOT_ALLOWED",
            "revoke by member": "ok",
            "revoked agent": "AGENT_NOT_AUTHORIZED",
            "revoke non-member": "NotCouncilMember",
        },
    ),
    "roster": (s10_roster, {"approve 2": "ok", "late approve 2 locked": "RosterLocked"}),
    "roster_breaks_coverage": (
        s11_roster_breaks_coverage,
        {"approve 2 breaks coverage": "COVERAGE_INSUFFICIENT"},
    ),
}


def _outcome(step: dict[str, Any]) -> str | None:
    res = step["res"]
    if res is None:
        return None
    if res["status"] == "ok":
        return "ok"
    return str(res["reason"] or res["error"])


@pytest.mark.parametrize("name", sorted(SCENARIOS))
def test_sim_matches_expectations(name: str) -> None:
    run, expect = SCENARIOS[name]
    t = run(make_sim_net())
    got = {s["step"]: _outcome(s) for s in t}
    for step, want in expect.items():
        assert got[step] == want, (name, step, got[step])


@pytest.mark.parametrize("name", sorted(SCENARIOS))
def test_anvil_matches_sim(name: str, request: pytest.FixtureRequest) -> None:
    """The Foundry contracts give the same normalised result at every step and the same final view (AC3)."""
    run, _ = SCENARIOS[name]
    sim = run(make_sim_net())
    pnet = request.getfixturevalue("l1_net")  # skips with the reason when Foundry is missing
    l1 = run(pnet)
    assert len(sim) == len(l1)
    for s, o in zip(sim, l1, strict=True):
        assert s["step"] == o["step"]
        assert s["res"] == o["res"], (name, s["step"], s["res"], o["res"])
    assert sim[-1]["view"] == l1[-1]["view"]
    _ = DAY
