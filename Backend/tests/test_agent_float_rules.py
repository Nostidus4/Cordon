"""agent-float rule engine (PAYROLL.md section 7): each rule, precedence, rounding, caps, k exposure."""

from __future__ import annotations

from dataclasses import replace

import pytest

from guardian.agent_float.config import FloatParams
from guardian.agent_float.rule_engine import Allocate, Kill, Noop, Unwind, decide, exposure
from guardian.domain.payroll_snapshot import PayrollSnapshot, RungState, VenueState
from guardian.shared.money import to_base

DAY = 86400
A, B = "0x" + "a" * 40, "0x" + "b" * 40
P = to_base(30_000)


def venue(addr: str, **kw: object) -> VenueState:
    base = {
        "addr": addr,
        "label": addr[:6],
        "allowed": True,
        "impaired": False,
        "frozen_hint": False,
        "deployed": 0,
        "cap_amount": to_base(12_000),
        "due": 0,
        "assets_of": 0,
        "yield_bps_per_day": 10,
    }
    return VenueState(**{**base, **kw})  # type: ignore[arg-type]


def snap(**kw: object) -> PayrollSnapshot:
    """Demo scenario of PAYROLL.md section 8 at day 0: P = Pr = 30.000, R = 12.000 (40%), k = 1."""
    base = {
        "now": 0,
        "cycle_id": 1,
        "payday": 30 * DAY,
        "deadline": 29 * DAY,
        "phase": "accruing",
        "payroll_total": P,
        "principal": P,
        "reserve": to_base(12_000),
        "idle": P,
        "deployed_total": 0,
        "yield_realized": 0,
        "buffer_amount": to_base(1_500),
        "ceiling_amount": to_base(28_500),
        "next_rung_at": 15 * DAY,
        "killed": False,
        "kill_reason": 0,
        "coverage": to_base(12_000),
        "exposure_at_risk": 0,
        "coverage_ok": True,
        "fault_tolerance": 1,
        "venues": [venue(A, yield_bps_per_day=20), venue(B)],
        "rungs": [RungState(14 * DAY, 6000), RungState(0, 0)],
        "agents": [],
    }
    return PayrollSnapshot(**{**base, **kw})  # type: ignore[arg-type]


def with_venues(s: PayrollSnapshot, *vs: VenueState) -> PayrollSnapshot:
    return replace(s, venues=list(vs), deployed_total=sum(v.deployed for v in vs))


def test_day0_places_both_venues_up_to_coverage() -> None:
    assert decide(snap()) == [Allocate(A, to_base(12_000)), Allocate(B, to_base(12_000))]


def test_rule1_killed_deadline_or_paid_is_noop() -> None:
    for s in (
        snap(killed=True),
        snap(now=29 * DAY),
        snap(now=31 * DAY),
        snap(executed=True, phase="paid"),
    ):
        assert [type(a) for a in decide(s)] == [Noop]


def test_rule1_beats_everything() -> None:
    s = snap(
        killed=True,
        venues=[venue(A, deployed=5, impaired=True), venue(B, deployed=to_base(9_000), due=1)],
    )
    assert [type(a) for a in decide(s)] == [Noop]


def test_rule2_frozen_venue_unwinds_healthy_ones_fully() -> None:
    s = with_venues(
        snap(),
        venue(A, deployed=to_base(4_500)),
        venue(B, deployed=to_base(9_000), impaired=True),
    )
    assert decide(s) == [Unwind(A, to_base(4_500), "frozen_peer")]


def test_rule2_frozen_hint_counts_like_impaired() -> None:
    s = with_venues(
        snap(),
        venue(A, deployed=to_base(3_000)),
        venue(B, deployed=to_base(9_000), frozen_hint=True),
    )
    assert decide(s) == [Unwind(A, to_base(3_000), "frozen_peer")]


def test_rule2_no_more_allocation_after_incident_even_with_room() -> None:
    s = with_venues(snap(), venue(A, deployed=0), venue(B, deployed=to_base(9_000), impaired=True))
    acts = decide(s)
    assert acts and all(isinstance(a, Noop) for a in acts)


def test_rule2_kill_3_when_coverage_lost() -> None:
    s = with_venues(
        snap(coverage_ok=False),
        venue(A, deployed=to_base(1_000)),
        venue(B, deployed=to_base(9_000), impaired=True),
    )
    assert decide(s) == [Unwind(A, to_base(1_000), "frozen_peer"), Kill(3)]
    s2 = with_venues(snap(coverage_ok=False), venue(B, deployed=to_base(9_000), impaired=True))
    assert decide(s2) == [Kill(3)]


def test_rule2_wins_over_due() -> None:
    s = with_venues(
        snap(),
        venue(A, deployed=to_base(4_000), due=to_base(1_000)),
        venue(B, deployed=to_base(9_000), impaired=True),
    )
    assert decide(s) == [Unwind(A, to_base(4_000), "frozen_peer")]


def test_impaired_venue_without_position_does_not_block_other_rules() -> None:
    s = snap(venues=[venue(A, impaired=True), venue(B)])
    assert decide(s) == [Allocate(B, to_base(12_000))]


def test_rule3_due_unwinds_every_venue_with_due_including_probe() -> None:
    s = with_venues(
        snap(now=16 * DAY, next_rung_at=22 * DAY),
        venue(A, deployed=to_base(12_000), due=to_base(3_000)),
        venue(B, deployed=to_base(12_000), due=to_base(3_000)),
    )
    assert decide(s) == [Unwind(A, to_base(3_000), "due"), Unwind(B, to_base(3_000), "due")]


def test_rule3_due_is_capped_by_deployed() -> None:
    s = with_venues(snap(), venue(A, deployed=10, due=99))
    assert decide(s) == [Unwind(A, 10, "due")]


def test_rule3_beats_allocate() -> None:
    s = with_venues(snap(), venue(A, deployed=to_base(1_000), due=1), venue(B))
    assert [type(a) for a in decide(s)] == [Unwind]


def test_rule4_min_hold_skips_when_next_rung_is_close() -> None:
    s = snap(now=14 * DAY + 1, next_rung_at=15 * DAY)
    assert decide(s) == [Noop("bậc kế tiếp sắp tới, không đặt rồi rút ngay")]
    ok = snap(now=12 * DAY, next_rung_at=15 * DAY)  # 3 days away (> 2)
    assert any(isinstance(a, Allocate) for a in decide(ok))


def test_rule4_min_hold_scales_with_day_unit() -> None:
    s = snap(
        day_unit=20, now=0, payday=600, deadline=580, next_rung_at=30
    )  # 30s = 1.5 compressed days
    assert [type(a) for a in decide(s)] == [Noop]
    s2 = snap(day_unit=20, now=0, payday=600, deadline=580, next_rung_at=60)
    assert any(isinstance(a, Allocate) for a in decide(s2))


def test_rule4_last_rung_zero_means_hold_check_is_skipped() -> None:
    s = snap(next_rung_at=0)
    assert any(isinstance(a, Allocate) for a in decide(s))


def test_rule4_buffer_limits_room() -> None:
    # idle 14.000, buffer 1.500 -> room 12.500 -> A takes 12.000 cap, B 500
    s = snap(idle=to_base(14_000))
    assert decide(s) == [Allocate(A, to_base(12_000)), Allocate(B, to_base(500))]


def test_rule4_ladder_ceiling_limits_room() -> None:
    s = snap(ceiling_amount=to_base(6_000))
    assert decide(s) == [Allocate(A, to_base(6_000))]


def test_rule4_ceiling_counts_what_is_already_deployed() -> None:
    s = with_venues(
        snap(ceiling_amount=to_base(6_000)), venue(A, deployed=to_base(5_500)), venue(B)
    )
    assert decide(s) == [Allocate(A, to_base(500))]  # room 6.000 - 5.500


def test_rule4_cap_per_venue_bounds_each_allocation() -> None:
    s = snap(
        coverage=to_base(30_000),
        venues=[venue(A, yield_bps_per_day=5), venue(B, cap_amount=to_base(3_000))],
    )
    assert decide(s) == [Allocate(B, to_base(3_000)), Allocate(A, to_base(12_000))]


def test_rule4_split_order_follows_yield_desc() -> None:
    s = snap(
        idle=to_base(4_000), venues=[venue(A, yield_bps_per_day=5), venue(B, yield_bps_per_day=50)]
    )
    assert decide(s) == [Allocate(B, to_base(2_500))]


def test_rule4_coverage_zero_places_nothing() -> None:
    """Pr = P, R = 0: coverage 0, nothing may be placed."""
    s = snap(coverage=0, reserve=0)
    assert decide(s) == [Noop("không cần hành động")]


def test_rule4_exposure_k1_bounds_each_venue_by_coverage() -> None:
    s = snap(coverage=to_base(5_000), venues=[venue(A, yield_bps_per_day=20), venue(B)])
    assert decide(s) == [Allocate(A, to_base(5_000)), Allocate(B, to_base(5_000))]


def test_rule4_exposure_k2_bounds_sum_of_two_largest() -> None:
    s = snap(
        coverage=to_base(5_000),
        fault_tolerance=2,
        venues=[venue(A, yield_bps_per_day=20), venue(B)],
    )
    acts = decide(s)
    assert acts == [Allocate(A, to_base(5_000))]  # A + B must stay <= 5.000, A took it all


def test_rule4_existing_positions_count_toward_exposure() -> None:
    s = with_venues(snap(), venue(A, deployed=to_base(11_000)), venue(B))
    assert decide(s) == [Allocate(A, to_base(1_000)), Allocate(B, to_base(12_000))]


def test_rule4_skips_below_min_allocation_and_rounds_down() -> None:
    s = snap(idle=to_base(1_500) + to_base(99))
    assert decide(s) == [Noop("không cần hành động")]
    s2 = snap(idle=to_base(1_500) + to_base(100) + 7, venues=[venue(A), venue(B)])
    assert decide(s2) == [Allocate(A, to_base(100) + 7)]
    s3 = snap(idle=to_base(1_500) + to_base(100), venues=[venue(A)])
    assert decide(s3) == [Allocate(A, to_base(100))]
    assert decide(s3, FloatParams(min_allocation=to_base(200))) == [Noop("không cần hành động")]


def test_rule4_ignores_not_allowed_and_unhealthy_venues() -> None:
    s = snap(venues=[venue(A, allowed=False), venue(B, impaired=True)])
    assert decide(s) == [Noop("không cần hành động")]


def test_rule5_noop_when_all_deployed() -> None:
    s = with_venues(
        snap(ceiling_amount=to_base(24_000)),
        venue(A, deployed=to_base(12_000)),
        venue(B, deployed=to_base(12_000)),
    )
    assert decide(s) == [Noop("không cần hành động")]


def test_decide_does_not_mutate_snapshot() -> None:
    s = snap()
    before = repr(s)
    decide(s)
    assert repr(s) == before


def test_exposure_helper() -> None:
    assert exposure([1, 5, 3], 1) == 5
    assert exposure([1, 5, 3], 2) == 8
    assert exposure([1], 3) == 1
    assert exposure([1, 5], 0) == 0


@pytest.mark.parametrize("k", [1, 2, 3])
@pytest.mark.parametrize("coverage", [0, to_base(3_000), to_base(12_000), to_base(40_000)])
@pytest.mark.parametrize("idle", [to_base(2_000), to_base(14_000), P, to_base(60_000)])
def test_property_allocations_respect_every_limit(k: int, coverage: int, idle: int) -> None:
    s = snap(
        fault_tolerance=k,
        coverage=coverage,
        idle=idle,
        venues=[
            venue(A, yield_bps_per_day=9),
            venue(B),
            venue("0x" + "c" * 40, cap_amount=to_base(4_000)),
        ],
    )
    acts = decide(s)
    allocs = [a for a in acts if isinstance(a, Allocate)]
    total = sum(a.amount for a in allocs)
    assert total <= max(0, s.ceiling_amount - s.deployed_total)
    assert total <= max(0, s.idle - s.buffer_amount)
    by = {v.addr: v for v in s.venues}
    assert all(a.venue in by and a.amount <= by[a.venue].cap_amount for a in allocs)
    assert all(a.amount >= FloatParams().min_allocation for a in allocs)
    after = [v.deployed + sum(a.amount for a in allocs if a.venue == v.addr) for v in s.venues]
    assert exposure(after, k) <= coverage
