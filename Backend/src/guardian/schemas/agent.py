from __future__ import annotations

from typing import Literal

from guardian.schemas.common import CamelModel, JsonDict


class AgentStep(CamelModel):
    """One step of the agent timeline (docs/spec/CITY_OPS.md §2)."""

    key: Literal["read", "decide", "simulate", "send", "explain"]
    label_vi: str
    status: Literal["ok", "blocked", "skipped"]
    detail: JsonDict


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
    # CITY_OPS §2, all optional
    steps: list[AgentStep] | None = None
    untrusted_input: str | None = None
    injection_ignored: bool | None = None
