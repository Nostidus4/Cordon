from __future__ import annotations

from guardian.schemas.common import CamelModel, JsonDict


class AgentRunOut(CamelModel):
    id: int
    ts: int
    outcome: str  # swapped | blocked | no_action | reverted
    decision: JsonDict | None = None
    reason_text: str | None = None
    reason_source: str | None = None
    reason_hash: str | None = None
    tx_hash: str | None = None
    reason_code: str | None = None
    attempt_id: int | None = None
    balances: JsonDict
