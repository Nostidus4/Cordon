"""B05 Tx Guardian (docs/spec/CITY_OPS.md §7): PreparedTx in, TxCheckOut out."""

from __future__ import annotations

from typing import Literal

from guardian.schemas.common import CamelModel, Money
from guardian.shared.reason_codes import ReasonCode

TxKind = Literal["pay", "swap", "approve", "raw"]
TxSource = Literal["paste", "city", "copilot", "attacker"]
TxLevel = Literal["safe", "caution", "danger"]
FindingLevel = Literal["caution", "danger"]
TxStatus = Literal["pending", "sent", "rejected"]
ExplanationSource = Literal["template", "llm"]


class PreparedTx(CamelModel):
    kind: TxKind
    signer: str  # key address (hex); a seed id such as `key_minh` is accepted too
    token: str | None = None
    to: str  # pay: recipient, approve: spender, swap: protocol, raw: target
    amount: str | None = None  # raw base-unit integer as a decimal string
    token_out: str | None = None
    min_out: str | None = None
    data: str | None = None  # hex calldata, raw only
    memo: str = ""
    source: TxSource = "paste"


class TxFlow(CamelModel):
    token: str  # symbol when the token is known, else the address
    amount: Money


class TxApproval(CamelModel):
    token: str
    spender: str
    amount: Money
    unlimited: bool


class StateDiff(CamelModel):
    outflows: list[TxFlow]
    inflows: list[TxFlow]
    approvals: list[TxApproval]
    recipient: str
    recipient_label: str | None = None
    recipient_known: bool
    principal_id: str | None = None
    chain_reason: ReasonCode | None = None
    # True when ChainPort simulate_pay/simulate_swap was consulted; approve/raw cannot be simulated through
    # ChainPort, their diff is read from the calldata only.
    simulated: bool


class TxFinding(CamelModel):
    rule_id: str
    level: FindingLevel
    title_vi: str
    detail_vi: str


class TxNumber(CamelModel):
    label: str
    value: str  # display form ("30.000"), always one of the diff's amounts


class SentTx(CamelModel):
    tx_hash: str | None = None
    simulated: bool
    ok: bool
    reason_code: str | None = None


class TxCheckOut(CamelModel):
    id: int
    created_at: int
    prepared: PreparedTx
    diff: StateDiff
    findings: list[TxFinding]
    level: TxLevel
    explanation_vi: str
    explanation_source: ExplanationSource
    numbers: list[TxNumber]
    numbers_verified: bool
    status: TxStatus
    sent_tx: SentTx | None = None
