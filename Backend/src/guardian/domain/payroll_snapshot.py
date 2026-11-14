"""Read-only payroll state (PAYROLL.md section 6.1): the chain layer (sim or l1) produces it,
`agent_float` and the API only read it. Amounts are int base units of the payroll token (6 decimals).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

PayrollPhase = Literal["accruing", "unwinding", "deadline", "payday", "paid"]


@dataclass
class VenueState:
    addr: str
    label: str  # untrusted display text
    allowed: bool
    impaired: bool
    frozen_hint: bool  # last unwind/recall on this venue failed
    deployed: int  # cost basis still at the venue
    cap_amount: int  # min(venueCapBps, 4000) * principal / 10000
    due: int  # amount that must come back now (ladder excess, pro-rata over healthy venues)
    assets_of: int  # principal + accrued yield as the venue reports it
    yield_bps_per_day: int = 0  # mock venue rate; the agent ranks venues by it


@dataclass
class RungState:
    before_deadline: int  # seconds before the deadline from which this ceiling applies
    max_deployed_bps: int


@dataclass
class PayeeState:
    account: str
    amount: int


@dataclass
class PayrollSnapshot:
    now: int
    cycle_id: int
    payday: int
    deadline: int
    phase: PayrollPhase
    payroll_total: int
    principal: int
    reserve: int
    idle: int
    deployed_total: int
    yield_realized: int
    buffer_amount: int
    ceiling_amount: int  # ladder ceiling at `now`
    next_rung_at: int  # 0 when none is left
    killed: bool
    kill_reason: int  # 0 none, 1 member, 2 deadline, 3 automation
    coverage: int
    exposure_at_risk: int
    coverage_ok: bool
    fault_tolerance: int = 1
    buffer_bps: int = 500
    day_unit: int = 86400
    venues: list[VenueState] = field(default_factory=list)
    rungs: list[RungState] = field(default_factory=list)
    roster: list[PayeeState] = field(default_factory=list)
    agents: list[str] = field(default_factory=list)
    executed: bool = False
