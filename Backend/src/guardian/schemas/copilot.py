"""Copilot (B02, CITY-004) request/response models. docs/spec/CITY_OPS.md §8. Money is `{raw, display}`."""

from __future__ import annotations

from typing import Literal

from guardian.schemas.common import CamelModel, Highlights, Money

CopilotIntent = Literal["read", "pay", "swap", "forecast_refused", "injection_refused", "unknown"]
DraftStatus = Literal["pending", "confirmed", "rejected", "sent", "blocked"]
CheckLevel = Literal["safe", "caution", "danger"]


class CopilotRequest(CamelModel):
    message: str


class ConfirmRequest(CamelModel):
    acknowledge_risk: bool = False


class PreparedTxOut(CamelModel):
    """B05 `PreparedTx` field names. `signer`/`token`/`to`/`tokenOut` are hex addresses; `amount`/`minOut` raw ints."""

    kind: Literal["pay", "swap", "approve", "raw"]
    signer: str
    token: str
    to: str
    amount: str
    token_out: str | None = None
    min_out: str | None = None
    data: str | None = None
    memo: str = ""
    source: Literal["paste", "city", "copilot", "attacker"] = "copilot"


class DraftDetails(CamelModel):
    signer_label: str
    to_label: str
    token_symbol: str
    token_out_symbol: str | None = None
    amount: Money
    min_out: Money | None = None


class DraftResult(CamelModel):
    tx_hash: str | None = None
    simulated: bool = True
    ok: bool
    reason_code: str | None = None


class CopilotDraftOut(CamelModel):
    id: int
    created_at: int
    intent: Literal["pay", "swap"]
    prepared: PreparedTxOut
    details: DraftDetails
    summary_vi: str
    status: DraftStatus
    tx_check_id: str | None = None
    tx_check_level: CheckLevel | None = None
    result: DraftResult | None = None


class CopilotNumber(CamelModel):
    label: str
    value: str
    source: Literal["simulate", "district", "proposal", "graph", "draft"]
    path: str


class CopilotReply(CamelModel):
    intent: CopilotIntent
    reply_vi: str
    numbers: list[CopilotNumber]
    numbers_verified: bool
    draft: CopilotDraftOut | None = None
    highlight: Highlights


class EvalAccuracy(CamelModel):
    correct: int
    total: int


class EvalBlocked(CamelModel):
    """Wrong transactions that must not succeed, and how each was stopped."""

    blocked: int
    total: int
    by_refusal: int
    by_chain: int
    by_checkpoint: int


class EvalCase(CamelModel):
    id: str
    message: str
    expected_intent: CopilotIntent
    intent: CopilotIntent
    intent_ok: bool
    wrong_tx: bool
    outcome: Literal[
        "answered", "refused", "sent", "blocked_by_chain", "blocked_by_checkpoint", "unmatched"
    ]
    stopped_wrong_tx: bool
    reason_code: str | None = None
    numbers_verified: bool | None = None


class CopilotEvalOut(CamelModel):
    version: int
    chain_mode: str
    total: int
    intent_accuracy: EvalAccuracy
    wrong_tx_blocked: EvalBlocked
    valid_sent: EvalAccuracy
    reads_verified: EvalAccuracy
    cases: list[EvalCase]
