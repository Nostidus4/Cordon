"""Payroll float API schemas (docs/spec/PAYROLL.md section 8). Mirror: Frontend/src/types/payroll.ts.

Money is `{raw, display}` like everywhere else. Times are unix seconds of the payroll clock (sim: virtual).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from guardian.schemas.agent import AgentStep
from guardian.schemas.common import CamelModel, JsonDict, Money

PayrollPhaseT = Literal["accruing", "unwinding", "deadline", "payday", "paid"]


class PayrollVenueOut(CamelModel):
    id: str  # venue_a | venue_b | venue_<n>
    addr: str
    label: str
    allowed: bool
    impaired: bool
    frozen_hint: bool  # an unwind/recall on it failed
    frozen: bool  # demo fault switch (mock venue)
    deployed: Money
    cap_amount: Money
    due: Money
    assets_of: Money
    yield_bps_per_day: int


class PayrollRungOut(CamelModel):
    index: int
    before_deadline: int  # seconds before the deadline from which the ceiling applies
    starts_at: int  # unix time the rung starts
    max_deployed_bps: int
    ceiling_amount: Money
    active: bool


class PayrollPayeeOut(CamelModel):
    account: str
    label: str
    amount: Money
    paid: bool


class PayrollGuaranteeOut(CamelModel):
    ok: bool  # exposure at risk <= coverage
    coverage: Money
    exposure_at_risk: Money
    headroom: Money
    reason_vi: str


class PayrollStateOut(CamelModel):
    now: int
    cycle_id: int
    cycle_start: int
    payday: int
    deadline: int
    phase: PayrollPhaseT
    payroll_total: Money
    principal: Money
    reserve: Money
    idle: Money
    deployed_total: Money
    yield_realized: Money
    buffer_amount: Money
    ceiling_amount: Money
    next_rung_at: int
    killed: bool
    kill_reason: int  # 0 none, 1 member, 2 deadline, 3 automation
    kill_reason_vi: str | None = None
    coverage: Money
    exposure_at_risk: Money
    coverage_ok: bool
    fault_tolerance: int
    buffer_bps: int
    day_unit: int
    time_scale: int
    executed: bool
    venues: list[PayrollVenueOut]
    rungs: list[PayrollRungOut]
    roster: list[PayrollPayeeOut]
    agents: list[str]
    guarantee: PayrollGuaranteeOut
    vault_covers_payroll: bool  # idle >= payroll total right now


class PayrollLadderPoint(CamelModel):
    ts: int
    ceiling_amount: Money


class PayrollLadderOut(CamelModel):
    now: int
    cycle_start: int
    deadline: int
    payday: int
    current_index: int  # -1 before the first rung, else the active rung
    rungs: list[PayrollRungOut]
    curve: list[PayrollLadderPoint]  # step curve of the ceiling over the cycle


class PayrollEventOut(CamelModel):
    name: str
    block: int
    tx_hash: str
    log_index: int
    ts: int
    payload: JsonDict
    simulated: bool


class PayrollAgentRunOut(CamelModel):
    id: int
    ts: int
    outcome: str  # no_action | acted | blocked | kill_requested
    actions: list[JsonDict]
    steps: list[AgentStep]
    reason_text: str
    reason_source: str  # llm | template
    reason_hash: str
    untrusted_input: str | None = None
    injection_ignored: bool | None = None
    facts: JsonDict


class PayrollReportOut(CamelModel):
    ts: int
    text: str
    reason_source: str
    reason_hash: str
    facts: JsonDict


class PayrollTxOut(CamelModel):
    ok: bool
    status: str
    reason_code: str | None = None
    reason_vi: str | None = None
    error_raw: str | None = None
    tx_hash: str | None = None
    proposal_id: int | None = None
    events: list[str]


class PayrollCallOut(CamelModel):
    target: str
    fn: str
    args: JsonDict


class PayrollProposalOut(CamelModel):
    id: int
    title: str
    proposer: str  # member id
    calls: list[PayrollCallOut]
    description_vi: list[str]
    risk_report_hash: str
    approvals: int
    approved_by: list[str]
    threshold: int
    status: Literal["open", "executed", "cancelled"]
    created_at: int


# ---------------------------------------------------------------- requests
class PayrollAdvanceRequest(CamelModel):
    seconds: int = Field(ge=1, le=366 * 86400)


class PayrollScaleRequest(CamelModel):
    scale: int = Field(ge=1, le=100_000)


class PayrollMemberRequest(CamelModel):
    member: str = "lan"  # council member id (trang | lan | huy) or hex address


class PayrollProposeRequest(CamelModel):
    member: str = "lan"
    title: str
    calls: list[PayrollCallOut]
    risk_report_hash: str = "0x" + "00" * 32


class PayrollAgentRunRequest(CamelModel):
    untrusted_input: str | None = None
    # False (default): the CFO report is the template, so a compressed month never makes one paid call per day
    llm_report: bool = False


class PayrollDemoOut(CamelModel):
    ok: bool = True
    state: PayrollStateOut


PayrollJson = dict[str, Any]
