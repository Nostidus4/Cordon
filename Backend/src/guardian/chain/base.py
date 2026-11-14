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
    proposal_id: int | None = None  # set by `propose` when status == ok

    @property
    def ok(self) -> bool:
        return self.status == "ok"


@dataclass
class ProposalState:
    """Council proposal as read back from the chain (sim and L1 give the same shape)."""

    id: int
    proposer: str
    subject_principal: str | None
    approvals: int
    approved_by: list[str]  # member addresses
    executed: bool = False
    cancelled: bool = False
    eta: int | None = None  # timelock (#77): earliest execution time (unix s), None = never queued
    vetoed_by: str | None = None  # member address that vetoed, None otherwise

    @property
    def queued(self) -> bool:
        """Threshold reached under a timelock and not yet executed or cancelled."""
        return self.eta is not None and not self.executed and not self.cancelled

    @property
    def status(self) -> Literal["open", "executed", "cancelled"]:
        return "executed" if self.executed else "cancelled" if self.cancelled else "open"


class ChainPort(Protocol):
    """Chain boundary. Contract (API-001): signer/member/key/to are hex addresses only; app code converts
    ids at the call site (`Runtime.addr`, CHN-004), an adapter rejects anything else.
    Sync on purpose: an L1 adapter runs web3 calls off the event loop behind one lock.
    """

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
    ) -> TxResult: ...  # status ok -> proposal_id set; revert -> reason_code/error_raw, no raise
    def approve(self, member: str, proposal_id: int) -> TxResult: ...
    def cancel(self, member: str, proposal_id: int) -> TxResult: ...
    def execute_proposal(
        self, member: str, proposal_id: int
    ) -> TxResult: ...  # queued, from eta (#77)
    def veto(self, member: str, proposal_id: int) -> TxResult: ...  # any member, while queued (#77)

    # --- read / stream ---
    @property
    def vault_addr(self) -> str: ...

    def balance(self, holder: str, token: str) -> int: ...
    def proposal_state(self, proposal_id: int) -> ProposalState:
        """Raises KeyError for an id that was never proposed."""
        ...

    def snapshot(self) -> PolicySnapshot: ...
    def events_since(self, block: int) -> list[ChainEvent]: ...
    def subscribe(self, callback: Callable[[ChainEvent], None]) -> Callable[[], None]: ...


class DemoControls(Protocol):
    """Sim-only extra that app code calls (`demo_reset`, guarded by `not rt.is_l1`; L1 reloads a fresh
    deployment instead). `reset` rewinds to seed policy v1 and leaves the Council counter so the next proposal id is
    the seed request #12 (like the L1 demo-reset script). `balance` is already on ChainPort and implemented by both."""

    def reset(self) -> None: ...


class DemoChain(ChainPort, DemoControls, Protocol):
    """What `Runtime.chain` is typed as: the port plus demo controls."""
