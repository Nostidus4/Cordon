"""SimPayroll: money paths, the 2.3.1 check order, ladder, freeze scenario (PAYROLL.md sections 2-3, 8, 9)."""

from __future__ import annotations

import pytest

from guardian.chain.sim.payroll import (
    EVIL_VENUE,
    PAYEES,
    PAYROLL_AGENT,
    PAYROLL_COMPANY,
    PAYROLL_KEEPER,
    PAYROLL_VAULT,
    VENUE_A,
    VENUE_B,
    SimPayroll,
)
from guardian.shared.payroll_reasons import PayrollReason as R

U = 1_000_000
DAY = 86400
T0 = 1_800_000_000


class Clock:
    def __init__(self) -> None:
        self.t = T0

    def __call__(self) -> int:
        return self.t

    def advance(self, s: int) -> None:
        self.t += s


@pytest.fixture
def sim() -> SimPayroll:
    """The section 8 deployment with yield off (the sample table ignores interest)."""
    p = SimPayroll.demo(clock=Clock())
    p.set_venue_yield(VENUE_A, 0)
    p.set_venue_yield(VENUE_B, 0)
    return p


def to_deadline(sim: SimPayroll, before_days: int = 0) -> None:
    sim.advance_time(sim.deadline - before_days * DAY - sim.now)


def names(res) -> list[str]:
    return [e.name for e in res.events]


def alloc(sim: SimPayroll, venue: str, amt: int):
    return sim.allocate(PAYROLL_AGENT, venue, amt)


def test_demo_seed_matches_section_8(sim: SimPayroll):
    s = sim.snapshot()
    assert (s.payroll_total, s.principal, s.reserve, s.idle) == (
        30_000 * U,
        30_000 * U,
        12_000 * U,
        30_000 * U,
    )
    assert s.coverage == 12_000 * U and len(s.roster) == 10 and s.phase == "accruing"
    assert s.payday - s.now == 30 * DAY and s.deadline == s.payday - DAY
    assert [(r.before_deadline // DAY, r.max_deployed_bps) for r in s.rungs] == [
        (14, 6000),
        (7, 3000),
        (3, 1000),
        (0, 0),
    ]


def test_allocate_two_venues_happy(sim: SimPayroll):
    r = alloc(sim, VENUE_A, 12_000 * U)
    assert r.ok and names(r) == ["Deployed", "Allocated"]
    assert alloc(sim, VENUE_B, 12_000 * U).ok
    s = sim.snapshot()
    assert s.deployed_total == 24_000 * U and s.idle == 6_000 * U
    assert s.exposure_at_risk == 12_000 * U <= s.coverage and s.coverage_ok
    assert sim.balance(PAYROLL_VAULT) == 18_000 * U


def test_check_order_every_branch(sim: SimPayroll):
    """Each rejection of 2.3.1, in order, with its reason."""
    assert sim.simulate_allocate(PAYROLL_AGENT, EVIL_VENUE, U) == R.VENUE_NOT_ALLOWED
    assert sim.simulate_allocate(PAYROLL_KEEPER, VENUE_A, U) == R.AGENT_NOT_AUTHORIZED
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 12_000 * U) is None
    # 8: coverage (venue cap 12000, coverage 12000 -> bigger single position is capped first by cap)
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 12_000 * U + 1) == R.VENUE_CAP_EXCEEDED
    # 5: ladder ceiling 95% of 30000 = 28500
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 28_501 * U) == R.LADDER_CEILING_EXCEEDED
    assert alloc(sim, VENUE_A, 12_000 * U).ok and alloc(sim, VENUE_B, 12_000 * U).ok
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 4_501 * U) == R.LADDER_CEILING_EXCEEDED
    # 4: impaired
    sim.set_venue_frozen(VENUE_B, True)
    to_deadline(sim, 7)
    sim.unwind_due(PAYROLL_KEEPER, VENUE_B)
    assert sim.snapshot().venues[1].impaired
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_B, 1) == R.VENUE_IMPAIRED
    # 2: past deadline (not killed yet)
    to_deadline(sim)
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 1) == R.DEADLINE_PASSED
    # 1: killed wins
    assert sim.finalize(PAYROLL_KEEPER).ok
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 1) == R.KILL_SWITCH_ACTIVE


def test_not_whitelisted_and_removed_venue(sim: SimPayroll):
    r = alloc(sim, PAYROLL_VAULT, U)
    assert (r.status, r.reason_code) == ("reverted", R.VENUE_NOT_ALLOWED)
    assert alloc(sim, PAYEES[0], U).reason_code == R.VENUE_NOT_ALLOWED
    assert alloc(sim, VENUE_A, 6_000 * U).ok
    assert sim.remove_venue(sim.members[0], VENUE_A).ok
    assert alloc(sim, VENUE_A, U).reason_code == R.VENUE_NOT_ALLOWED
    # a removed venue never traps money: unwind still works
    assert sim.unwind(PAYROLL_AGENT, VENUE_A, 6_000 * U).ok
    assert sim.snapshot().deployed_total == 0


def test_blocked_at_protocol_and_not_agent(sim: SimPayroll):
    sim.set_tx_allowed(PAYROLL_AGENT, False)
    r = alloc(sim, VENUE_A, U)
    assert (r.status, r.reason_code, r.tx_hash) == (
        "blocked_at_protocol",
        R.BLOCKED_AT_PROTOCOL,
        None,
    )
    r = sim.allocate(PAYROLL_KEEPER, VENUE_A, U)
    assert r.reason_code == R.AGENT_NOT_AUTHORIZED


def test_zero_amount_has_no_reason(sim: SimPayroll):
    r = alloc(sim, VENUE_A, 0)
    assert r.status == "reverted" and r.error_raw == "ZeroAmount" and r.reason_code is None


def test_coverage_blocks_when_no_reserve():
    sim = SimPayroll.demo(clock=Clock())
    assert sim.propose(
        sim.members[0], "return", [_c("vault", "returnReserve", amount=12_000 * U)], "0x0"
    ).ok
    sim.approve(sim.members[1], 1)
    assert sim.approve(sim.members[2], 1).ok
    assert sim.snapshot().reserve == 0
    assert alloc(sim, VENUE_A, 1000 * U).reason_code == R.COVERAGE_INSUFFICIENT  # Pr = P, R = 0


def _c(target: str, fn: str, **args):
    return {"target": target, "fn": fn, "args": args}


def test_ladder_due_prorata_and_rounding(sim: SimPayroll):
    alloc(sim, VENUE_A, 12_000 * U)
    alloc(sim, VENUE_B, 12_000 * U)
    to_deadline(sim, 14)
    s = sim.snapshot()
    assert s.ceiling_amount == 18_000 * U and s.phase == "unwinding"
    assert [v.due for v in s.venues] == [3_000 * U, 3_000 * U]
    r = sim.unwind_due(PAYROLL_KEEPER, VENUE_A)
    assert r.ok and names(r) == ["Recalled", "Unwound"]
    # due is recomputed on the new total after A came back: B owes ceil(3000 * 12000 / 21000)
    assert sim.snapshot().venues[1].due == -(-(3_000 * U * 12_000 * U) // (21_000 * U))
    assert sim.unwind_due(PAYROLL_KEEPER, VENUE_B).ok
    s = sim.snapshot()
    assert (
        s.deployed_total >= s.ceiling_amount
    )  # the ceiling is reached from above, never undershot
    assert s.venues[1].deployed == 12_000 * U - (-(-(3_000 * U * 12_000 * U) // (21_000 * U)))


def test_buffer_branch_and_coverage_branch():
    sim = SimPayroll.demo(clock=Clock())
    sim.s.ledger.transfer(
        PAYROLL_VAULT, PAYROLL_COMPANY, sim.token, 2_000 * U
    )  # simulate a loss of idle cash
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 12_000 * U) is None
    assert sim.simulate_allocate(PAYROLL_AGENT, VENUE_A, 27_000 * U) == R.BUFFER_BREACHED
    low = SimPayroll(clock=Clock())
    a = low.add_venue(VENUE_A, "A")
    low.set_roster_genesis([(PAYEES[0], 100 * U)])
    low.mint(PAYROLL_COMPANY, 1000 * U)
    low.deposit(PAYROLL_COMPANY, 100 * U)
    low.fund_reserve(PAYROLL_COMPANY, 10 * U)
    assert low.allocate(PAYROLL_AGENT, a, 10 * U).ok
    assert low.simulate_allocate(PAYROLL_AGENT, a, 1) == R.COVERAGE_INSUFFICIENT


def test_due_rounds_up():
    sim = SimPayroll(clock=Clock(), payday=T0 + 30 * DAY)
    a = sim.add_venue(VENUE_A, "A")
    b = sim.add_venue(VENUE_B, "B")
    sim.set_roster_genesis([(PAYEES[0], 10 * U)])
    sim.mint(PAYROLL_COMPANY, 100 * U)
    sim.deposit(PAYROLL_COMPANY, 10 * U)
    sim.fund_reserve(PAYROLL_COMPANY, 10 * U)
    assert sim.allocate(PAYROLL_AGENT, a, 3).ok and sim.allocate(PAYROLL_AGENT, b, 4).ok
    sim.advance_time(sim.deadline - 3 * DAY - sim.now)  # ceiling 10% of 10 USDC = 1_000_000
    s = sim.snapshot()
    assert s.ceiling_amount == U and s.deployed_total == 7  # nothing due: below the ceiling
    assert [v.due for v in s.venues] == [0, 0]
    sim.s.principal = 10  # tiny principal: ceiling 1 (10% of 10), excess 6 split 3:4 -> ceil(18/7)=3, ceil(24/7)=4
    s = sim.snapshot()
    assert s.ceiling_amount == 1 and [v.due for v in s.venues] == [3, 4]


def test_section_8_freeze_scenario_full_month(sim: SimPayroll):
    alloc(sim, VENUE_A, 12_000 * U)
    alloc(sim, VENUE_B, 12_000 * U)
    to_deadline(sim, 14)  # day 16
    sim.unwind(PAYROLL_AGENT, VENUE_A, 3_000 * U)
    sim.unwind(PAYROLL_AGENT, VENUE_B, 3_000 * U)  # agent probes B with its own share (same table)
    assert [v.deployed for v in sim.snapshot().venues] == [9_000 * U, 9_000 * U]
    sim.set_venue_frozen(VENUE_B, True)  # day 20
    to_deadline(sim, 7)  # day 23: ceiling 9000, A and B each due 4500
    assert [v.due for v in sim.snapshot().venues] == [4_500 * U, 4_500 * U]
    assert sim.unwind_due(
        PAYROLL_KEEPER, VENUE_A
    ).ok  # B is probed next: its due is now ceil(4500*9000/13500)
    rb = sim.unwind_due(PAYROLL_KEEPER, VENUE_B)
    assert rb.ok and names(rb) == ["RecallFailed", "VenueImpaired", "Unwound"]
    assert rb.events[-1].payload["received"] == 0
    s = sim.snapshot()
    assert s.venues[1].impaired and s.venues[1].frozen_hint and s.venues[1].deployed == 9_000 * U
    assert alloc(sim, VENUE_B, U).reason_code == R.VENUE_IMPAIRED
    to_deadline(sim, 3)  # day 27: agent unwinds all of A
    assert sim.unwind(PAYROLL_AGENT, VENUE_A, 4_500 * U).ok
    assert sim.snapshot().coverage_ok
    to_deadline(sim)  # T-1: anyone finalizes
    assert sim.execute_payroll(PAYROLL_KEEPER).reason_code == R.PAYDAY_NOT_REACHED
    f = sim.finalize(PAYROLL_KEEPER)
    assert f.ok and "KillSwitch" in names(f) and "ReserveReleased" in names(f)
    fin = f.events[-1]
    assert fin.name == "Finalized"
    assert fin.payload == {
        "idleAfter": 30_000 * U,
        "shortfall": 9_000 * U,
        "reserveReleased": 9_000 * U,
        "stuckAtVenues": 9_000 * U,
    }
    s = sim.snapshot()
    assert s.idle >= s.payroll_total and s.killed and s.kill_reason == 2 and s.reserve == 3_000 * U
    sim.advance_time(DAY)  # day 30
    e = sim.execute_payroll(PAYROLL_KEEPER)
    assert e.ok and names(e).count("PaidOut") == 10 and e.events[-1].name == "PayrollExecuted"
    assert all(sim.balance(p) == 3_000 * U for p in PAYEES)
    assert sim.snapshot().phase == "paid"
    again = sim.execute_payroll(PAYROLL_KEEPER)
    assert (again.status, again.reason_code) == ("reverted", R.PAYROLL_ALREADY_PAID)


@pytest.mark.parametrize("freeze_at_days", [20, 14, 7, 3, 1, 0])
def test_vault_covers_payroll_for_any_freeze_time(freeze_at_days: int):
    sim = SimPayroll.demo(clock=Clock())
    alloc(sim, VENUE_A, 12_000 * U)
    alloc(sim, VENUE_B, 12_000 * U)
    to_deadline(sim, freeze_at_days)
    sim.set_venue_frozen(VENUE_B, True)
    for _ in range(3):  # keeper tries every venue each step until the deadline
        sim.unwind_due(PAYROLL_KEEPER, VENUE_A)
        sim.unwind_due(PAYROLL_KEEPER, VENUE_B)
    to_deadline(sim)
    assert sim.finalize(PAYROLL_KEEPER).ok
    s = sim.snapshot()
    assert s.idle >= s.payroll_total
    sim.advance_time(DAY)
    assert sim.execute_payroll(PAYROLL_KEEPER).ok


def test_execute_finalizes_by_itself_when_keeper_forgot(sim: SimPayroll):
    alloc(sim, VENUE_A, 12_000 * U)
    alloc(sim, VENUE_B, 12_000 * U)
    sim.set_venue_frozen(VENUE_B, True)
    sim.advance_time(30 * DAY)
    e = sim.execute_payroll(PAYROLL_KEEPER)
    assert e.ok and "Finalized" in names(e) and names(e).count("PaidOut") == 10


def test_two_frozen_venues_need_k2():
    sim = SimPayroll.demo(clock=Clock())
    # k = 1 and two frozen venues: not covered (documented assumption A2) -> underfunded, nobody is paid
    alloc(sim, VENUE_A, 12_000 * U)
    alloc(sim, VENUE_B, 12_000 * U)
    sim.set_venue_frozen(VENUE_A, True)
    sim.set_venue_frozen(VENUE_B, True)
    sim.advance_time(30 * DAY)
    before = {p: sim.balance(p) for p in PAYEES}
    e = sim.execute_payroll(PAYROLL_KEEPER)
    assert (e.status, e.reason_code, e.error_raw) == (
        "reverted",
        R.PAYROLL_UNDERFUNDED,
        "InsufficientFunds",
    )
    assert {
        p: sim.balance(p) for p in PAYEES
    } == before and not sim.snapshot().killed  # all or nothing
    # k = 2: the second venue cannot be placed with the same reserve
    sim2 = SimPayroll.demo(clock=Clock())
    assert sim2.propose(sim2.members[0], "k2", [_c("policy", "setFaultTolerance", k=2)], "0x0").ok
    sim2.approve(sim2.members[1], 1)
    sim2.approve(sim2.members[2], 1)
    assert alloc(sim2, VENUE_A, 12_000 * U).ok
    assert sim2.simulate_allocate(PAYROLL_AGENT, VENUE_B, 12_000 * U) == R.COVERAGE_INSUFFICIENT
    assert sim2.simulate_allocate(PAYROLL_AGENT, VENUE_B, 1_000 * U) == R.COVERAGE_INSUFFICIENT


def test_k2_with_bigger_reserve_survives_two_frozen():
    sim = SimPayroll(clock=Clock(), fault_tolerance=2)
    a = sim.add_venue(VENUE_A, "A")
    b = sim.add_venue(VENUE_B, "B")
    sim.set_roster_genesis([(PAYEES[0], 100 * U)])
    sim.mint(PAYROLL_COMPANY, 1000 * U)
    sim.deposit(PAYROLL_COMPANY, 100 * U)
    sim.fund_reserve(PAYROLL_COMPANY, 80 * U)
    assert sim.allocate(PAYROLL_AGENT, a, 40 * U).ok and sim.allocate(PAYROLL_AGENT, b, 40 * U).ok
    sim.set_venue_frozen(a, True)
    sim.set_venue_frozen(b, True)
    sim.advance_time(30 * DAY)
    e = sim.execute_payroll(PAYROLL_KEEPER)
    assert e.ok and sim.balance(PAYEES[0]) == 100 * U


def test_underfunded_pays_nobody():
    sim = SimPayroll(clock=Clock())
    sim.set_roster_genesis([(PAYEES[0], 100 * U)])
    sim.mint(PAYROLL_COMPANY, 100 * U)
    sim.deposit(PAYROLL_COMPANY, 60 * U)
    sim.advance_time(30 * DAY)
    e = sim.execute_payroll(PAYROLL_KEEPER)
    assert e.reason_code == R.PAYROLL_UNDERFUNDED and sim.balance(PAYEES[0]) == 0
    f = sim.finalize(PAYROLL_KEEPER)
    assert f.ok and "Underfunded" in names(f)


def test_haircut_marks_impaired_and_keeps_basis():
    sim = SimPayroll.demo(clock=Clock())
    alloc(sim, VENUE_A, 10_000 * U)
    sim.set_venue_haircut(VENUE_A, 1000)  # pays 10% less without reverting
    r = sim.unwind(PAYROLL_AGENT, VENUE_A, 10_000 * U)
    assert names(r) == ["Recalled", "Haircut", "VenueImpaired", "Unwound"]
    assert r.events[0].payload["received"] == 9_000 * U
    s = sim.snapshot()
    assert (
        s.venues[0].impaired and s.venues[0].deployed == 1_000 * U
    )  # basis only drops by what came back


def test_yield_accrues_and_is_realized():
    sim = SimPayroll.demo(clock=Clock())
    alloc(sim, VENUE_A, 10_000 * U)
    sim.advance_time(10 * DAY)  # 8 bps/day simple on 10000 -> 80 per day
    assert sim.snapshot().venues[0].assets_of == 10_000 * U + 10_000 * U * 8 * 10 // 10_000
    to_deadline(sim)
    f = sim.finalize(PAYROLL_KEEPER)
    assert f.ok
    s = sim.snapshot()
    assert s.yield_realized > 0 and s.deployed_total == 0 and s.venues[0].deployed == 0


def test_execute_before_payday_and_empty_roster(sim: SimPayroll):
    assert sim.execute_payroll(PAYROLL_KEEPER).reason_code == R.PAYDAY_NOT_REACHED
    empty = SimPayroll(clock=Clock())
    empty.advance_time(31 * DAY)
    assert empty.execute_payroll(PAYROLL_KEEPER).error_raw == "EmptyRoster"


def test_deposit_paths_and_events(sim: SimPayroll):
    r = sim.deposit(PAYROLL_COMPANY, 5 * U)
    assert (
        r.ok
        and r.events[0].name == "Deposited"
        and r.events[0].payload["principalAfter"] == 30_005 * U
    )
    r = sim.fund_reserve(PAYROLL_COMPANY, U)
    assert r.events[0].payload == {"from": PAYROLL_COMPANY, "amount": U, "reserveAfter": 12_001 * U}
    assert sim.deposit(PAYROLL_KEEPER, U).error_raw == "InsufficientBalance"


def test_cycle_lifecycle_surplus_and_start_cycle(sim: SimPayroll):
    sim.advance_time(30 * DAY)
    assert sim.execute_payroll(PAYROLL_KEEPER).ok
    m = sim.members
    for call in (
        _c("vault", "returnReserve", amount=12_000 * U),
        _c("vault", "withdrawSurplus", amount=0),
        _c("vault", "startCycle", newPayday=sim.now + 30 * DAY),
    ):
        pid = sim.propose(m[0], "x", [call], "0x0").proposal_id
        sim.approve(m[1], pid)
        assert sim.approve(m[2], pid).ok
    s = sim.snapshot()
    assert s.cycle_id == 2 and s.principal == 0 and not s.executed and s.phase == "accruing"
    assert sim.balance(sim.treasury) == 12_000 * U
    assert sim.deposit(PAYROLL_COMPANY, U).ok


def test_roster_changes_and_lock():
    sim = SimPayroll.demo(clock=Clock())
    m = sim.members
    new = [{"account": p, "amount": 2_000 * U} for p in PAYEES[:5]]
    pid = sim.propose(m[0], "r", [_c("vault", "setRoster", roster=new)], "0x0").proposal_id
    sim.approve(m[1], pid)
    r = sim.approve(m[2], pid)
    assert r.ok and r.events[-2].name == "RosterSet" and sim.snapshot().payroll_total == 10_000 * U
    big = [
        {"account": p, "amount": 6_000 * U} for p in PAYEES
    ]  # P = 60000 -> cover = 0 and nothing placed; ok
    pid = sim.propose(m[0], "big", [_c("vault", "setRoster", roster=big)], "0x0").proposal_id
    sim.approve(m[1], pid)
    assert sim.approve(m[2], pid).ok
    assert alloc(sim, VENUE_A, 1).reason_code == R.COVERAGE_INSUFFICIENT  # P = 60000, cover = 0
    dup = [{"account": PAYEES[0], "amount": U}] * 2
    for bad, err in (
        (dup, "RosterInvalid"),
        (
            [{"account": p, "amount": U} for p in PAYEES] + [{"account": VENUE_A, "amount": U}],
            "RosterTooLarge",
        ),
    ):
        pid = sim.propose(m[0], "bad", [_c("vault", "setRoster", roster=bad)], "0x0").proposal_id
        sim.approve(m[1], pid)
        assert sim.approve(m[2], pid).error_raw == err
    to_deadline(sim)
    pid = sim.propose(m[0], "late", [_c("vault", "setRoster", roster=new)], "0x0").proposal_id
    sim.approve(m[1], pid)
    assert sim.approve(m[2], pid).error_raw == "RosterLocked"
    assert sim.remove_payee(m[0], PAYEES[0]).error_raw == "RosterLocked"


def test_set_roster_breaking_coverage_reverts():
    sim = SimPayroll.demo(clock=Clock())
    alloc(sim, VENUE_A, 12_000 * U)
    m = sim.members
    bigger = [
        {"account": p, "amount": 3_100 * U} for p in PAYEES
    ]  # P = 31000 -> cover 11000 < 12000 at risk
    pid = sim.propose(m[0], "grow", [_c("vault", "setRoster", roster=bigger)], "0x0").proposal_id
    sim.approve(m[1], pid)
    r = sim.approve(m[2], pid)
    assert (r.status, r.reason_code) == ("reverted", R.COVERAGE_INSUFFICIENT)
    assert sim.snapshot().payroll_total == 30_000 * U  # rolled back
    assert not sim.proposal_state(pid).executed


def test_remove_payee_lowers_total(sim: SimPayroll):
    r = sim.remove_payee(sim.members[0], PAYEES[0])
    assert (
        r.ok and r.events[0].name == "PayeeRemoved" and sim.snapshot().payroll_total == 27_000 * U
    )
    assert sim.remove_payee(sim.members[0], PAYEES[0]).error_raw == "NotPayee"


def test_reset_restores_demo(sim: SimPayroll):
    alloc(sim, VENUE_A, 1000 * U)
    sim.advance_time(5 * DAY)
    sim.reset()
    s = sim.snapshot()
    assert s.deployed_total == 0 and s.payday - s.now == 30 * DAY and s.principal == 30_000 * U


def test_events_since_and_subscribe(sim: SimPayroll):
    seen: list[str] = []
    off = sim.subscribe(lambda e: seen.append(e.name))
    b = sim.block
    alloc(sim, VENUE_A, U)
    alloc(sim, EVIL_VENUE, U)  # reverted: no event
    off()
    alloc(sim, VENUE_A, U)
    assert seen == ["Deployed", "Allocated"]
    assert [e.name for e in sim.events_since(b)] == [
        "Deployed",
        "Allocated",
        "Deployed",
        "Allocated",
    ]
    assert all(e.simulated for e in sim.events)


def test_snapshot_never_exposes_free_recipient():
    """Agent surface: allocate/unwind/simulate_allocate take (signer, venue, amount) only."""
    import inspect

    for fn in (SimPayroll.allocate, SimPayroll.unwind, SimPayroll.simulate_allocate):
        assert list(inspect.signature(fn).parameters) == ["self", "signer", "venue", "amount"]


@pytest.mark.parametrize("seed", range(60))
def test_randomized_cycles_keep_the_guarantee(seed: int):
    """I-1/I-4/I-5 under random agent actions, up to k frozen venues at random times (A1-A3 hold)."""
    import random

    from guardian.chain.sim.payroll import _addr

    rnd = random.Random(seed)
    k = rnd.choice([1, 1, 2])
    p_total = rnd.randrange(50, 500) * U
    principal = p_total + rnd.choice([0, 0, rnd.randrange(0, 50) * U])
    reserve = rnd.randrange(0, p_total * 6 // 10 // U + 1) * U
    sim = SimPayroll(clock=Clock(), fault_tolerance=k)
    venues = [
        sim.add_venue(a, n, yield_bps_per_day=rnd.randrange(0, 20), fund_yield=20 * U)
        for a, n in ((VENUE_A, "A"), (VENUE_B, "B"), (_addr("c"), "C"))
    ]
    sim.set_roster_genesis([(PAYEES[0], p_total)])
    sim.mint(PAYROLL_COMPANY, 10 * principal + 10 * reserve + U)
    sim.deposit(PAYROLL_COMPANY, principal)
    if reserve:
        sim.fund_reserve(PAYROLL_COMPANY, reserve)
    frozen: list[str] = []
    for _ in range(rnd.randrange(5, 40)):
        op = rnd.random()
        v = rnd.choice(venues)
        if op < 0.45:
            sim.allocate(PAYROLL_AGENT, v, rnd.randrange(1, max(2, principal // 3)))
            s = sim.snapshot()
            assert s.exposure_at_risk <= s.coverage or s.deployed_total == 0
            assert all(x.deployed <= x.cap_amount for x in s.venues)
            assert s.deployed_total == 0 or s.idle >= s.buffer_amount
        elif op < 0.65:
            sim.unwind(PAYROLL_AGENT, v, rnd.randrange(1, max(2, sim.s.deployed.get(v, 0) + 1)))
        elif op < 0.75:
            sim.unwind_due(PAYROLL_KEEPER, v)
        elif op < 0.85 and len(frozen) < k and v not in frozen:
            sim.set_venue_frozen(v, True)
            frozen.append(v)
        else:
            sim.advance_time(rnd.randrange(1, 3 * DAY))
        if sim.now >= sim.deadline:
            break
    sim.advance_time(max(0, sim.deadline - sim.now))
    assert sim.finalize(PAYROLL_KEEPER).ok
    s = sim.snapshot()
    assert s.idle >= s.payroll_total, (seed, s)
    sim.advance_time(DAY)
    assert sim.execute_payroll(PAYROLL_KEEPER).ok
