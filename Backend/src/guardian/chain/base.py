"""ChainPort: what the API/agent/attacker need from a chain; sim and (later) web3 both implement it."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from guardian.domain.snapshot import PolicySnapshot
from guardian.shared.reason_codes import ReasonCode

TxStatus = Literal["ok", "reverted", "blocked_at_protocol"]


@dataclass
class ChainEvent:
    name: str
    block: int
    tx_hash: str
    log_index: int
    payload: dict[str, Any]
    ts: int
    simulated: bool = True


@dataclass
class TxResult:
    status: TxStatus
    reason_code: ReasonCode | None = None
    tx_hash: str | None = None
    block: int | None = None
    events: list[ChainEvent] = field(default_factory=list)
    error_raw: str | None = None
    simulated: bool = True

    @property
    def ok(self) -> bool:
        return self.status == "ok"


class ChainPort(Protocol):
    """Signers/addresses may be hex addresses (sim also accepts seed ids)."""

    # --- spend (called by keys) ---
    def pay(self, signer: str, token: str, to: str, amount: int, memo: str = "") -> TxResult: ...

    def swap(
        self,
        signer: str,
        dex: str,
        selector: str,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
        reason: str = "",
    ) -> TxResult: ...

    def simulate_pay(self, signer: str, token: str, to: str, amount: int) -> ReasonCode | None: ...

    def simulate_swap(
        self,
        signer: str,
        dex: str,
        selector: str,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
    ) -> ReasonCode | None: ...

    def raw_call(self, signer: str, target: str, data: str) -> TxResult: ...

    # --- council: tighten (1 member) ---
    def emergency_lock(self, member: str, principal_id: str) -> TxResult: ...
    def emergency_pause(self, member: str) -> TxResult: ...
    def lower_key_cap(self, member: str, key: str, new_cap: int) -> TxResult: ...
    def lower_district_cap(self, member: str, principal_id: str, new_cap: int) -> TxResult: ...
    def revoke_allow(
        self, member: str, kind: str, subject: str, selector: str | None = None
    ) -> TxResult: ...
    def deactivate_key(self, member: str, key: str) -> TxResult: ...

    # --- council: loosen (proposal, 2/3) ---
    def propose(
        self,
        member: str,
        title: str,
        subject_principal: str | None,
        calls: list[dict[str, Any]],
        risk_report_hash: str,
    ) -> int: ...
    def approve(self, member: str, proposal_id: int) -> TxResult: ...
    def cancel(self, member: str, proposal_id: int) -> TxResult: ...

    # --- read / stream ---
    def snapshot(self) -> PolicySnapshot: ...
    def events_since(self, block: int) -> list[ChainEvent]: ...
    def subscribe(self, callback: Callable[[ChainEvent], None]) -> Callable[[], None]: ...
