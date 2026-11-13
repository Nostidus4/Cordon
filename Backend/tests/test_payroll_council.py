"""PayrollGovernor on the sim: tighten with one member, loosen only with 2/3 (PAYROLL.md sections 2.6, 4, 9)."""

from __future__ import annotations

import pytest

from guardian.chain.sim.payroll import (
    EVIL_VENUE,
    PAYEES,
    PAYROLL_AGENT,
    PAYROLL_COMPANY,
    PAYROLL_KEEPER,
    VENUE_A,
    SimPayroll,
)
from guardian.shared.payroll_reasons import PayrollReason as R

U = 1_000_000
DAY = 86400


class Clock:
    t = 1_800_000_000

    def __call__(self) -> int:
        return self.t


@pytest.fixture
def sim() -> SimPayroll:
    return SimPayroll.demo(clock=Clock())


def call(target: str, fn: str, **args):
    return {"target": target, "fn": fn, "args": args}


def pass_2of3(sim: SimPayroll, calls, title="x"):
    m = sim.members
    pid = sim.propose(m[0], title, calls, "0x" + "0" * 64).proposal_id
    assert pid is not None
    sim.approve(m[1], pid)
    return pid, sim.approve(m[2], pid)


def test_kill_switch_one_member_recalls_healthy_money_keeps_reserve(sim: SimPayroll):
    sim.allocate(PAYROLL_AGENT, VENUE_A, 6_000 * U)
    r = sim.kill_switch(sim.members[0])
    assert r.ok and [e.name for e in r.events][:2] == ["KillSwitch", "Recalled"]
    assert r.events[-1].name == "EmergencyAction"
    s = sim.snapshot()
    assert s.killed and s.kill_reason == 1 and s.deployed_total == 0 and s.reserve == 12_000 * U
    assert sim.allocate(PAYROLL_AGENT, VENUE_A, U).reason_code == R.KILL_SWITCH_ACTIVE
    assert sim.kill_switch(sim.members[1]).error_raw == "NotTightening"  # already on


def test_non_member_and_agent_cannot_use_governor(sim: SimPayroll):
    for who in (PAYROLL_AGENT, PAYROLL_KEEPER, PAYROLL_COMPANY):
        assert sim.kill_switch(who).error_raw == "NotCouncilMember"
        assert (
            sim.propose(who, "t", [call("policy", "resetKill")], "0x0").error_raw
            == "NotCouncilMember"
        )
    assert sim.approve(PAYROLL_KEEPER, 1).error_raw == "NotCouncilMember"


@pytest.mark.parametrize(
    ("method", "args", "state"),
    [
        ("remove_venue", (VENUE_A,), lambda s: s.venues[0].allowed is False),
        ("lower_venue_cap", (VENUE_A, 2000), lambda s: s.venues[0].cap_amount == 6_000 * U),
        ("raise_buffer", (1000,), lambda s: s.buffer_amount == 3_000 * U),
        ("raise_deadline_lead", (2 * DAY,), lambda s: s.payday - s.deadline == 2 * DAY),
        ("raise_fault_tolerance", (2,), lambda s: s.fault_tolerance == 2),
        ("lower_rung", (0, 5000), lambda s: s.rungs[0].max_deployed_bps == 5000),
        ("revoke_agent", (PAYROLL_AGENT,), lambda s: s.agents == []),
        ("remove_payee", (PAYEES[0],), lambda s: s.payroll_total == 27_000 * U),
    ],
)
def test_every_tighten_takes_one_member_and_emits_emergency_action(sim, method, args, state):
    r = getattr(sim, method)(sim.members[2], *args)
    assert (
        r.ok
        and r.events[-1].name == "EmergencyAction"
        and r.events[-1].payload["member"] == sim.members[2]
    )
    assert state(sim.snapshot())
    assert getattr(sim, method)(PAYROLL_AGENT, *args).error_raw == "NotCouncilMember"


@pytest.mark.parametrize(
    ("method", "args"),
    [
        ("lower_venue_cap", (VENUE_A, 4000)),  # equal
        ("lower_venue_cap", (VENUE_A, 4001)),
        ("raise_buffer", (500,)),
        ("raise_buffer", (100,)),
        ("raise_deadline_lead", (DAY,)),
        ("raise_fault_tolerance", (1,)),
        ("lower_rung", (0, 6000)),
        ("lower_rung", (0, 9000)),
        ("remove_venue", (EVIL_VENUE,)),  # never allowed
        ("revoke_agent", (PAYROLL_KEEPER,)),  # not an agent
    ],
)
def test_not_tightening_reverts(sim: SimPayroll, method, args):
    r = getattr(sim, method)(sim.members[0], *args)
    assert (r.status, r.error_raw) == ("reverted", "NotTightening")


def test_lower_rung_cannot_break_monotonic_ladder(sim: SimPayroll):
    # rung 1 is 3000; lowering rung 0 below it is fine, lowering rung 1 below rung 2 (1000) is not
    assert sim.lower_rung(sim.members[0], 1, 500).error_raw == "LadderInvalid"
    assert (
        sim.lower_rung(sim.members[0], 3, 0).error_raw == "NotTightening"
    )  # last rung is (0, 0) already


@pytest.mark.parametrize(
    "loosening",
    [
        call("policy", "setVenue", venue=EVIL_VENUE, allowed=True, capBps=4000),
        call("policy", "setVenueCapBps", venue=VENUE_A, capBps=4000),
        call("policy", "setBufferBps", bps=500),
        call("policy", "setDeadlineLead", lead=DAY),
        call("policy", "setFaultTolerance", k=1),
        call("policy", "resetKill"),
        call("policy", "clearImpaired", venue=VENUE_A),
        call("scheduler", "setRungs", rungs=[{"beforeDeadline": 0, "maxDeployedBps": 0}]),
        call("scheduler", "setAgent", key=EVIL_VENUE, active=True),
        call("vault", "setRoster", roster=[{"account": PAYEES[0], "amount": U}]),
        call("vault", "startCycle", newPayday=2_000_000_000),
        call("vault", "returnReserve", amount=U),
        call("vault", "withdrawSurplus", amount=U),
    ],
)
def test_loosening_via_one_member_needs_threshold(sim: SimPayroll, loosening):
    r = sim.direct_call(sim.members[0], loosening)
    assert (r.status, r.error_raw) == ("reverted", "NeedsThreshold")


def test_reset_kill_one_member_fails_two_thirds_succeeds(sim: SimPayroll):
    sim.kill_switch(sim.members[0])
    assert (
        sim.direct_call(sim.members[1], call("policy", "resetKill")).error_raw == "NeedsThreshold"
    )
    assert sim.snapshot().killed
    pid, last = pass_2of3(sim, [call("policy", "resetKill")], "reset")
    assert last.ok and [e.name for e in last.events] == ["Approved", "KillReset", "Executed"]
    assert not sim.snapshot().killed and sim.proposal_state(pid).status == "executed"


def test_add_venue_and_raise_cap_only_by_proposal(sim: SimPayroll):
    new = "0x" + "ab" * 20
    from eth_utils import to_checksum_address

    new = to_checksum_address(new)
    assert sim.allocate(PAYROLL_AGENT, new, U).reason_code == R.VENUE_NOT_ALLOWED
    _, last = pass_2of3(sim, [call("policy", "setVenue", venue=new, allowed=True, capBps=1000)])
    assert last.ok
    assert sim.snapshot().venues[-1].addr == new
    # whitelisted but not a venue contract: policy passes, the deposit call fails (no reason code)
    assert sim.simulate_allocate(PAYROLL_AGENT, new, U) is None
    assert sim.allocate(PAYROLL_AGENT, new, U).error_raw == "InsufficientAssets"


def test_hard_floors_hold_even_for_two_thirds(sim: SimPayroll):
    bad = [
        call("policy", "setVenueCapBps", venue=VENUE_A, capBps=4001),
        call("policy", "setVenue", venue=VENUE_A, allowed=True, capBps=5000),
        call("policy", "setBufferBps", bps=499),
        call("policy", "setDeadlineLead", lead=DAY - 1),
        call("policy", "setFaultTolerance", k=0),
        call("policy", "setFaultTolerance", k=9),
        call(
            "scheduler", "setRungs", rungs=[{"beforeDeadline": 0, "maxDeployedBps": 100}]
        ),  # last rung must be (0,0)
        call(
            "scheduler",
            "setRungs",
            rungs=[
                {"beforeDeadline": 7 * DAY, "maxDeployedBps": 100},
                {"beforeDeadline": 3 * DAY, "maxDeployedBps": 200},
                {"beforeDeadline": 0, "maxDeployedBps": 0},
            ],
        ),
    ]
    expected = ["BpsOutOfRange"] * 6 + ["LadderInvalid"] * 2
    for c, err in zip(bad, expected, strict=True):
        assert pass_2of3(sim, [c])[1].error_raw == err, c


def test_too_many_venues(sim: SimPayroll):
    from guardian.chain.sim.payroll import _addr

    for i in range(6):  # A and B already exist -> 8
        assert pass_2of3(
            sim, [call("policy", "setVenue", venue=_addr(f"v{i}"), allowed=True, capBps=100)]
        )[1].ok
    assert (
        pass_2of3(sim, [call("policy", "setVenue", venue=_addr("v9"), allowed=True, capBps=100)])[
            1
        ].error_raw
        == "TooManyVenues"
    )


def test_proposal_lifecycle_errors(sim: SimPayroll):
    m = sim.members
    assert sim.propose(m[0], "t", [], "0x0").error_raw == "BadCallArgs"
    assert (
        sim.propose(m[0], "t", [{"target": "token", "fn": "x", "args": {}}], "0x0").error_raw
        == "TargetNotAllowed"
    )
    assert sim.propose(m[0], "t", [call("vault", "payOut")], "0x0").error_raw == "UnknownCall"
    assert sim.propose(m[0], "t", [call("executor", "execute")], "0x0").error_raw == "UnknownCall"
    pid = sim.propose(m[0], "ok", [call("policy", "resetKill")], "0x0").proposal_id
    assert pid == 1  # own namespace, ids start at 1
    assert sim.approve(m[1], 99).error_raw == "UnknownProposal"
    assert sim.approve(m[1], pid).ok
    assert sim.approve(m[1], pid).error_raw == "AlreadyApproved"
    assert sim.cancel(m[1], pid).error_raw == "NotProposer"
    assert sim.cancel(m[0], pid).ok
    assert sim.approve(m[2], pid).error_raw == "ProposalNotOpen"
    assert sim.proposal_state(pid).status == "cancelled"
    with pytest.raises(KeyError):
        sim.proposal_state(42)


def test_failed_call_rolls_back_whole_proposal(sim: SimPayroll):
    m = sim.members
    pid = sim.propose(
        m[0],
        "two",
        [
            call("policy", "setBufferBps", bps=300 * 0 + 1000),
            call("policy", "setFaultTolerance", k=0),
        ],
        "0x0",
    ).proposal_id
    sim.approve(m[1], pid)
    assert sim.approve(m[2], pid).error_raw == "BpsOutOfRange"
    assert sim.snapshot().buffer_bps == 500 and sim.proposal_state(pid).approvals == 1


def test_conflict_of_interest_payee_member_cannot_approve_roster_change():
    members = None
    base = SimPayroll.demo(clock=Clock())
    members = list(base.members)
    sim = SimPayroll(clock=Clock(), members=members)
    sim.add_venue(VENUE_A, "A")
    sim.set_roster_genesis([(members[2], 100 * U), (PAYEES[0], 100 * U)])  # huy is paid
    roster = [{"account": PAYEES[1], "amount": 200 * U}]
    pid = sim.propose(
        members[0], "swap", [call("vault", "setRoster", roster=roster)], "0x0"
    ).proposal_id
    assert sim.approve(members[2], pid).error_raw == "ConflictOfInterest"
    assert sim.approve(members[1], pid).ok
    # another change that does not touch the roster stays open to him
    other = sim.propose(
        members[0], "buffer", [call("policy", "setBufferBps", bps=500)], "0x0"
    ).proposal_id
    assert sim.approve(members[2], other).ok
    # a member added by setRoster is also barred
    pid2 = sim.propose(
        members[0],
        "add",
        [call("vault", "setRoster", roster=[{"account": members[1], "amount": 5 * U}])],
        "0x0",
    ).proposal_id
    assert sim.approve(members[1], pid2).error_raw == "ConflictOfInterest"


def test_remove_payee_is_tighten_but_keeps_conflict_rule_for_proposals(sim: SimPayroll):
    assert sim.remove_payee(sim.members[0], PAYEES[3]).ok  # one member, immediate
    assert sim.snapshot().payroll_total == 27_000 * U


def test_agent_and_keeper_cannot_reach_loosening_paths(sim: SimPayroll):
    """I-8: no automatic path loosens. Scheduler/policy admin surface is not reachable from keys."""
    for who in (PAYROLL_AGENT, PAYROLL_KEEPER):
        for c in (call("policy", "resetKill"), call("scheduler", "setAgent", key=who, active=True)):
            assert sim.direct_call(who, c).error_raw == "NotCouncilMember"
