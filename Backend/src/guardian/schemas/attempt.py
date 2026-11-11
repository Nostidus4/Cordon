from __future__ import annotations

from guardian.schemas.common import CamelModel, Money


class AttemptOut(CamelModel):
    id: int
    scenario_run_id: str | None = None
    step: int | None = None
    display_time: str | None = None
    signer: str
    signer_label: str
    principal_id: str | None = None
    action: str
    outcome: str  # ok | reverted | blocked_at_protocol | blocked (simulate said no, not sent)
    reason_code: str | None = None
    reason_text_vi: str | None = None
    reason_text_en: str | None = None
    tx_hash: str | None = None
    error_raw: str | None = None
    block: int | None = None
    ts: int
    amount: Money | None = None
    token: str | None = None
    to: str | None = None
    to_label: str | None = None
    principal_spent_after: Money | None = None
    key_spent_after: Money | None = None
    simulated: bool
    source: str
    badge: str | None = None


class AttemptIn(CamelModel):
    """Posted by an external attacker CLI after it sent the tx itself."""

    scenario_run_id: str | None = None
    step: int | None = None
    display_time: str | None = None
    signer: str
    action: str
    outcome: str
    reason_code: str | None = None
    tx_hash: str | None = None
    error_raw: str | None = None
    block: int | None = None
    amount: int | None = None
    token: str | None = None
    to: str | None = None
    simulated: bool = False
