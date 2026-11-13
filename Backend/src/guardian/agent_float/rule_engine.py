"""Pure decision function of the payroll float agent (PAYROLL.md section 7).

No I/O, no LLM, never reads free text. Venues come from `snapshot.venues` (the on-chain whitelist) only; an
`Allocate` is only ever produced for a venue that is allowed, not impaired and not frozen-hinted. The rules are
tried in order, the first match wins (rule 4 may allocate to several venues in one decision).
"""

from __future__ import annotations

from dataclasses import dataclass, replace

from guardian.agent_float.config import DEFAULT_PARAMS, FloatParams
from guardian.domain.payroll_snapshot import PayrollSnapshot, VenueState


@dataclass(frozen=True)
class Allocate:
    venue: str
    amount: int


@dataclass(frozen=True)
class Unwind:
    venue: str
    amount: int
    why: str = ""  # "frozen_peer" | "due"


@dataclass(frozen=True)
class Kill:
    reason: int


@dataclass(frozen=True)
class Noop:
    reason: str


Action = Allocate | Unwind | Kill | Noop


def _sick(v: VenueState) -> bool:
    return v.impaired or v.frozen_hint


def exposure(deployed: list[int], k: int) -> int:
    """Sum of the k largest positions (cost basis)."""
    return sum(sorted(deployed, reverse=True)[: max(k, 0)])


def _max_fit(snap: PayrollSnapshot, venues: list[VenueState], idx: int, limit: int) -> int:
    """Largest x in [0, limit] such that exposure after adding x at venues[idx] stays <= coverage."""
    base = [v.deployed for v in venues]
    lo, hi = 0, max(limit, 0)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        trial = list(base)
        trial[idx] += mid
        if exposure(trial, snap.fault_tolerance) <= snap.coverage:
            lo = mid
        else:
            hi = mid - 1
    return lo


def decide(snap: PayrollSnapshot, params: FloatParams = DEFAULT_PARAMS) -> list[Action]:
    # 1. nothing to do once killed, past the deadline or paid
    if snap.killed or snap.executed or snap.now >= snap.deadline:
        return [Noop("công tắc đã bật hoặc đã qua hạn rút về")]

    venues = snap.venues

    # 2. a venue is stuck: pull everything healthy back, never place more
    if any(_sick(v) and v.deployed > 0 for v in venues):
        actions: list[Action] = [
            Unwind(v.addr, v.deployed, "frozen_peer")
            for v in venues
            if not _sick(v) and v.deployed > 0
        ]
        if not snap.coverage_ok:
            actions.append(Kill(params.kill_reason))
        return actions or [Noop("nơi gửi đang kẹt, không còn tiền khoẻ để rút")]

    # 3. ladder excess: take back what is due (every venue, so a frozen one is found one rung early)
    due: list[Action] = [
        Unwind(v.addr, min(v.due, v.deployed), "due") for v in venues if not _sick(v) and v.due > 0
    ]
    if due:
        return due

    # 4. room to place
    if snap.next_rung_at and snap.next_rung_at - snap.now < params.min_hold_days * snap.day_unit:
        return [Noop("bậc kế tiếp sắp tới, không đặt rồi rút ngay")]
    room = min(snap.ceiling_amount - snap.deployed_total, snap.idle - snap.buffer_amount)
    cands = sorted(
        (v for v in venues if v.allowed and not _sick(v)),
        key=lambda v: (-v.yield_bps_per_day, v.addr),
    )
    work = [replace(v) for v in venues]  # local copy: never mutate the snapshot
    by_addr = {v.addr: i for i, v in enumerate(work)}
    placed: list[Action] = []
    for v in cands:
        if room < params.min_allocation:
            break
        i = by_addr[v.addr]
        want = min(room, v.cap_amount - work[i].deployed)
        amt = _max_fit(snap, work, i, want)
        if amt < params.min_allocation:
            continue
        work[i].deployed += amt
        room -= amt
        placed.append(Allocate(v.addr, amt))
    if placed:
        return placed

    # 5.
    return [Noop("không cần hành động")]
