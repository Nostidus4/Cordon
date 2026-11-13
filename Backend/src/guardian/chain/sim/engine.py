"""SimChain: PrincipalRegistry + PolicyVault + GuardianCouncil + Tx AllowList + MockDEX in memory.

Every result/event is marked simulated=True. Reverted txs get a fake tx hash and emit no event;
txs from a sender whose Tx AllowList role is None are rejected by the "node" (no hash, no block).
"""

from __future__ import annotations

import copy
import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from eth_utils import keccak, to_checksum_address

from guardian.chain.base import ChainEvent, ProposalState, TxResult
from guardian.chain.errors import ChainRevert, is_blocked_at_protocol, revert_for_reason
from guardian.chain.sim.allowlist import TxAllowList
from guardian.chain.sim.council import (
    ALLOWED_TARGETS,
    KNOWN_FNS,
    THRESHOLD,
    CouncilState,
    Proposal,
    affected_principals,
)
from guardian.chain.sim.dex import MockDEX
from guardian.chain.sim.registry import Registry
from guardian.chain.sim.tokens import Ledger
from guardian.chain.sim.vault import PolicyVault
from guardian.domain.snapshot import (
    CouncilMember,
    DeclaredEdge,
    KeyState,
    PolicySnapshot,
    PrincipalState,
    Protocol,
    Recipient,
    Token,
)
from guardian.shared.reason_codes import ReasonCode

SEED_PATH = Path(__file__).resolve().parents[4] / "seed" / "may_labs.json"
DAY = 86400
BLOCKED_MSG = "transaction sender is not allow listed (Tx AllowList role is None)"


def load_seed(path: Path | None = None) -> dict[str, Any]:
    """The May Labs seed. `GUARDIAN_SEED_FILE` points at a copy whose key/Council addresses are the
    ones of a real deployment (`make l1-local-env` writes one for the local Guardian L1)."""
    override = os.environ.get("GUARDIAN_SEED_FILE")
    return json.loads(
        (path or (Path(override) if override else SEED_PATH)).read_text(encoding="utf-8")
    )


def _h(text: str) -> str:
    return "0x" + keccak(text=text).hex()


@dataclass
class _Tx:
    sender: str
    fn: str
    block: int
    ts: int
    tx_hash: str
    events: list[ChainEvent] = field(default_factory=list)

    def emit(self, name: str, payload: dict[str, Any]) -> None:
        self.events.append(
            ChainEvent(name, self.block, self.tx_hash, len(self.events), payload, self.ts, True)
        )


class SimChain:
    def __init__(self, seed: dict[str, Any] | None = None, clock: Callable[[], int] | None = None):
        self._seed = copy.deepcopy(seed if seed is not None else load_seed())
        self._clock = clock or (lambda: int(time.time()))
        self._subs: list[Callable[[ChainEvent], None]] = []
        self._load()

    # ------------------------------------------------------------------ setup
    def _load(self) -> None:
        s = self._seed
        self.block = 1
        self._nonce = 0
        self._day_offset = 0
        self.events: list[ChainEvent] = []
        self.alias: dict[str, str] = {}
        self.main_treasury: int = s["main_treasury"]
        self.registry = Registry()
        self.vault = PolicyVault()
        self.txallow = TxAllowList()
        self.ledger = Ledger()
        self.council = CouncilState()
        self.dex = MockDEX(self.ledger.decimals)
        self.vault_addr = s["contracts"]["policy_vault"]
        self.bridge_addr = s["contracts"]["bridge_escrow"]
        self.council_addr = s["contracts"]["guardian_council"]
        self._meta: dict[str, dict[str, Any]] = {}  # address -> labels for snapshot
        self.vault.policy_version = s["policy_version"]
        self.alias["vault"] = s["contracts"]["policy_vault"]
        for k, v in s["contracts"].items():
            self.alias[k] = v
        for t in s["tokens"]:
            self.ledger.add_token(t["address"], t["symbol"], t["decimals"])
            self.vault.token_allowed[t["address"]] = t["allowed"]
            self.alias[t["seed_id"]] = t["address"]
        self.tusdc = self.alias["tUSDC"]
        self.ttkb = self.alias["tTKB"]
        for sym, amt in s["vault_balances"].items():
            self.ledger.mint(self.vault_addr, self.alias[sym], amt)
        for p in s["principals"]:
            self.registry.create_principal(p["id"], p["label"], p["kind"])
            if p.get("daily_cap"):
                self.vault.principal_cap[p["id"]] = p["daily_cap"]
            if p.get("locked"):
                self.vault.locked.add(p["id"])
        for k in s["keys"]:
            self.alias[k["seed_id"]] = k["address"]
            self.registry.add_key(
                k["principal_id"], k["address"], k["kind"], k["label"], k["seed_id"]
            )
            self.registry.key_info[k["address"]].active = k["active"]
            self.vault.key_cap[k["address"]] = k["daily_cap"]
            if k["allow_listed"]:
                self.txallow.set_enabled(k["address"])
        for m in s["council"]:
            self.alias[m["seed_id"]] = m["address"]
            self.alias["council:" + m["id"]] = m["address"]
            self.council.members[m["id"]] = m["address"]
            self.council.member_principal[m["address"]] = m["principal_id"]
            self.txallow.set_enabled(m["address"])
            self._meta[m["address"]] = {"label": m["label"], "id": m["id"]}
        for r in s["recipients"]:
            self.alias[r["seed_id"]] = r["address"]
            self._meta[r["address"]] = {"label": r["label"], "seed_id": r["seed_id"]}
            if r["allowed"]:
                self.vault.recipient_allowed.add(r["address"])
        for p in s["protocols"]:
            self.alias[p["seed_id"]] = p["address"]
            self._meta[p["address"]] = {
                "label": p["label"],
                "seed_id": p["seed_id"],
                "selector": p["selector"],
            }
            if p["allowed"]:
                self.vault.protocol_allowed.add((p["address"], p["selector"].lower()))

    def reset(self) -> None:
        """Back to seed policy v1 (subscribers are kept)."""
        self._load()

    # --------------------------------------------------------------- helpers
    def _addr(self, x: str) -> str:
        if x.startswith("0x"):
            return to_checksum_address(x)
        if x in self.alias:
            return self.alias[x]
        raise KeyError(f"unknown seed id {x!r}")

    def _principal_of_ref(self, ref: str) -> str | None:
        """Principal a key (address or seed id) belongs to now; None for an unknown/unregistered key."""
        try:
            return self.registry.principal_of(self._addr(ref))
        except KeyError:
            return None

    def _member(self, x: str) -> str:
        if x in self.council.members:
            return self.council.members[x]
        return self._addr(x)

    @property
    def now(self) -> int:
        return self._clock() + self._day_offset * DAY

    @property
    def day_index(self) -> int:
        return self.now // DAY

    def advance_day(self, days: int = 1) -> None:
        self._day_offset += days

    def balance(self, holder: str, token: str) -> int:
        return self.ledger.balance(self._addr(holder), self._addr(token))

    def topup(self, amount: int) -> TxResult:
        """Simulated treasury -> vault top-up (spec §6.8)."""
        if amount > self.main_treasury:
            raise ChainRevert("InsufficientTreasury")
        self.main_treasury -= amount
        self.ledger.mint(self.vault_addr, self.tusdc, amount)
        self.block += 1
        self._nonce += 1
        tx = _Tx("treasury", "topup", self.block, self.now, _h(f"sim:{self._nonce}:topup"))
        tx.emit("TopUpRecorded", {"cChainTxHash": _h(f"c:{self._nonce}"), "amount": amount})
        return self._commit(tx, "ok", None, None)

    # ----------------------------------------------------------- tx plumbing
    def _save(self) -> Any:
        return copy.deepcopy((self.registry, self.vault, self.txallow, self.ledger, self.council))

    def _restore(self, st: Any) -> None:
        self.registry, self.vault, self.txallow, self.ledger, self.council = st
        self.dex = MockDEX(self.ledger.decimals)

    def _commit(self, tx: _Tx, status: str, reason: ReasonCode | None, err: str | None) -> TxResult:
        evs = tx.events if status == "ok" else []
        self.events.extend(evs)
        res = TxResult(status, reason, tx.tx_hash, tx.block, list(evs), err)  # type: ignore[arg-type]
        for e in evs:
            for cb in list(self._subs):
                cb(e)
        return res

    def _transact(self, sender: str, fn: str, body: Callable[[_Tx], None]) -> TxResult:
        sender = self._addr(sender)
        if not self.txallow.is_allowed(sender):
            assert is_blocked_at_protocol(BLOCKED_MSG)
            return TxResult(
                "blocked_at_protocol", ReasonCode.BLOCKED_AT_PROTOCOL, None, None, [], BLOCKED_MSG
            )
        self.block += 1
        self._nonce += 1
        tx = _Tx(sender, fn, self.block, self.now, _h(f"sim:{self._nonce}:{sender}:{fn}"))
        saved = self._save()
        try:
            body(tx)
        except ChainRevert as e:
            self._restore(saved)
            return self._commit(tx, "reverted", e.reason, e.name)
        return self._commit(tx, "ok", None, None)

    def subscribe(self, callback: Callable[[ChainEvent], None]) -> Callable[[], None]:
        self._subs.append(callback)
        return lambda: self._subs.remove(callback) if callback in self._subs else None

    def events_since(self, block: int) -> list[ChainEvent]:
        """Events with event.block > block."""
        return [e for e in self.events if e.block > block]

    # ---------------------------------------------------------------- spend
    def _value(self, token: str, amount: int) -> int:
        """Cap accounting in tUSDC: tUSDC as is, anything else via MockDEX quote."""
        return amount if token == self.tusdc else self.dex.quote(token, self.tusdc, amount)

    def _pay_reason(self, sender: str, token: str, to: str, amount: int) -> ReasonCode | None:
        return self.vault.check(
            self.registry,
            sender,
            [token],
            lambda: (
                None if to in self.vault.recipient_allowed else ReasonCode.RECIPIENT_NOT_ALLOWED
            ),
            self._value(token, amount) if token in self.ledger.decimals else 0,
            self.day_index,
        )

    def _swap_reason(
        self, sender: str, dex: str, sel: str, t_in: str, t_out: str, amount_in: int, min_out: int
    ) -> ReasonCode | None:
        known = t_in in self.ledger.decimals and t_out in self.ledger.decimals
        reason = self.vault.check(
            self.registry,
            sender,
            [t_in, t_out],
            lambda: (
                None
                if (dex, sel.lower()) in self.vault.protocol_allowed
                else ReasonCode.PROTOCOL_NOT_ALLOWED
            ),
            self._value(t_in, amount_in) if known else 0,
            self.day_index,
        )
        if reason:
            return reason
        if self.dex.quote(t_in, t_out, amount_in) < min_out:
            return ReasonCode.SLIPPAGE
        return None

    def simulate_pay(self, signer: str, token: str, to: str, amount: int) -> ReasonCode | None:
        """eth_call: reason or None, no state change (eth_call ignores the Tx AllowList)."""
        return self._pay_reason(self._addr(signer), self._addr(token), self._addr(to), amount)

    def simulate_swap(
        self,
        signer: str,
        dex: str,
        selector: str,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
    ) -> ReasonCode | None:
        return self._swap_reason(
            self._addr(signer),
            self._addr(dex),
            selector,
            self._addr(token_in),
            self._addr(token_out),
            amount_in,
            min_out,
        )

    def _bump_spent(self, tx: _Tx, key: str, value: int) -> tuple[str, int, int, int]:
        pid = self.registry.principal_of(key) or ""
        day = self.day_index
        v = self.vault
        v.key_spent[(key, day)] = v.spent_key(key, day) + value
        v.principal_spent[(pid, day)] = v.spent_principal(pid, day) + value
        return pid, day, v.key_spent[(key, day)], v.principal_spent[(pid, day)]

    def pay(self, signer: str, token: str, to: str, amount: int, memo: str = "") -> TxResult:
        token, to = self._addr(token), self._addr(to)

        def body(tx: _Tx) -> None:
            reason = self._pay_reason(tx.sender, token, to, amount)
            if reason:
                raise revert_for_reason(reason)
            pid, day, ks, ps = self._bump_spent(tx, tx.sender, self._value(token, amount))
            self.ledger.transfer(self.vault_addr, to, token, amount)
            tx.emit(
                "Paid",
                {
                    "key": tx.sender,
                    "principalId": pid,
                    "token": token,
                    "to": to,
                    "amount": amount,
                    "day": day,
                    "keySpentAfter": ks,
                    "principalSpentAfter": ps,
                    "memoHash": _h(memo),
                },
            )

        return self._transact(signer, "pay", body)

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
    ) -> TxResult:
        dex, t_in, t_out = self._addr(dex), self._addr(token_in), self._addr(token_out)

        def body(tx: _Tx) -> None:
            r = self._swap_reason(tx.sender, dex, selector, t_in, t_out, amount_in, min_out)
            if r:
                raise revert_for_reason(r)
            out = self.dex.quote(t_in, t_out, amount_in)
            pid, day, ks, ps = self._bump_spent(tx, tx.sender, self._value(t_in, amount_in))
            self.ledger.transfer(self.vault_addr, dex, t_in, amount_in)
            self.ledger.mint(dex, t_out, 0)
            self.ledger.mint(
                self.vault_addr, t_out, out
            )  # DEX has deep liquidity; output stays in vault
            tx.emit(
                "Swapped",
                {
                    "key": tx.sender,
                    "principalId": pid,
                    "dex": dex,
                    "tokenIn": t_in,
                    "tokenOut": t_out,
                    "amountIn": amount_in,
                    "amountOut": out,
                    "day": day,
                    "keySpentAfter": ks,
                    "principalSpentAfter": ps,
                    "reasonHash": _h(reason),
                },
            )

        return self._transact(signer, "swap", body)

    def raw_call(self, signer: str, target: str, data: str) -> TxResult:
        """Arbitrary tx to any contract: only the Tx AllowList gate matters in the sim."""
        self._addr(target)
        return self._transact(signer, "raw_call", lambda tx: None)

    # -------------------------------------------------------------- council
    def _need_member(self, tx: _Tx) -> None:
        if tx.sender not in self.council.member_principal:
            raise ChainRevert("NotCouncilMember")

    def _subject(self, call: dict[str, Any]) -> str:
        """`EmergencyAction.subject`: the principal id, or the address of a key/token/recipient."""
        a = call["args"]
        if a.get("principal_id"):
            return str(a["principal_id"])
        ref = a.get("key") or a.get("subject")
        return self._addr(ref) if ref else ""

    def _is_tightening(self, call: dict[str, Any]) -> bool:
        fn, a = call["fn"], call["args"]
        v = self.vault
        if fn in ("lockPrincipal", "pauseAll", "deactivateKey"):
            return True
        if fn in ("setTokenAllowed", "setProtocolAllowed", "setRecipientAllowed"):
            return not a.get("allowed", False)
        if fn in ("setKeyDailyCap", "setPrincipalDailyCap"):
            if fn == "setKeyDailyCap":
                old = v.key_cap.get(self._addr(a["key"]), 0)
                new = a["cap"]
                # For keys: old cap of 0 means no spending power, so raising it is loosening.
                # Tightening only when new < old (matches PolicyVault.isTighteningCap kind=0).
                return new < old
            else:
                old = v.principal_cap.get(a["principal_id"], 0)
                new = a["cap"]
                # For districts: 0 means unset/unlimited. Tightening if new > 0 and (old == 0 or new < old).
                # Matches PolicyVault.isTighteningCap kind=1.
                if new == 0:  # 0 = not set = unlimited: never a tightening
                    return False
                return old == 0 or new < old
        return False

    def _direct(
        self, member: str, call: dict[str, Any], not_tightening: str = "NeedsThreshold"
    ) -> TxResult:
        """1-member path: only tightening calls; everything else needs 2/3.

        `not_tightening` is the revert name for a loosening call: `NeedsThreshold` through a raw admin
        call (`direct_call`), `NotTightening` through the dedicated `lowerCap` of the contract."""

        def body(tx: _Tx) -> None:
            self._need_member(tx)
            if not self._is_tightening(call):
                raise ChainRevert(not_tightening)
            self._apply_call(tx, call)
            tx.emit(
                "EmergencyAction",
                {"member": tx.sender, "action": call["fn"], "subject": self._subject(call)},
            )

        return self._transact(self._member(member), call["fn"], body)

    def emergency_lock(self, member: str, principal_id: str) -> TxResult:
        return self._direct(member, _c("vault", "lockPrincipal", principal_id=principal_id))

    def emergency_pause(self, member: str) -> TxResult:
        return self._direct(member, _c("vault", "pauseAll"))

    def lower_key_cap(self, member: str, key: str, new_cap: int) -> TxResult:
        return self._direct(
            member, _c("vault", "setKeyDailyCap", key=key, cap=new_cap), "NotTightening"
        )

    def lower_district_cap(self, member: str, principal_id: str, new_cap: int) -> TxResult:
        return self._direct(
            member,
            _c("vault", "setPrincipalDailyCap", principal_id=principal_id, cap=new_cap),
            "NotTightening",
        )

    def revoke_allow(
        self, member: str, kind: str, subject: str, selector: str | None = None
    ) -> TxResult:
        fn = {
            "token": "setTokenAllowed",
            "protocol": "setProtocolAllowed",
            "recipient": "setRecipientAllowed",
        }[kind]
        args: dict[str, Any] = {"subject": subject, "allowed": False}
        if selector:
            args["selector"] = selector
        return self._direct(member, _c("vault", fn, **args))

    def deactivate_key(self, member: str, key: str) -> TxResult:
        return self._direct(member, _c("registry", "deactivateKey", key=key))

    def proposal_state(self, proposal_id: int) -> ProposalState:
        p = self.council.proposals[proposal_id]  # KeyError: never proposed
        return ProposalState(
            p.id,
            p.proposer,
            p.subject_principal,
            p.approvals,
            sorted(p.approved_by),
            p.executed,
            p.cancelled,
        )

    def direct_call(self, member: str, call: dict[str, Any]) -> TxResult:
        """Member calls any admin fn directly (loosening => reverts NeedsThreshold)."""
        return self._direct(member, call)

    def propose(
        self,
        member: str,
        title: str,
        subject_principal: str | None,
        calls: list[dict[str, Any]],
        risk_report_hash: str,
    ) -> TxResult:
        """TxResult with `proposal_id` on success; a revert (non-member, T11) is returned, not raised."""
        box: list[int] = []

        def body(tx: _Tx) -> None:
            self._need_member(tx)
            if not calls:
                raise ChainRevert("BadCallArgs")
            for c in calls:
                if c.get("target") not in ALLOWED_TARGETS:
                    raise ChainRevert("TargetNotAllowed")
                if c.get("fn") not in KNOWN_FNS[c["target"]]:
                    raise ChainRevert("UnknownCall")
            affected = affected_principals(calls, self._principal_of_ref)
            # like the contract: a declared subject must be among the principals the calls touch
            if affected and subject_principal not in affected:
                raise ChainRevert("SubjectMismatch")
            pid = self.council.next_id
            self.council.next_id += 1
            self.council.proposals[pid] = Proposal(
                pid,
                tx.sender,
                subject_principal,
                copy.deepcopy(calls),
                risk_report_hash,
                title,
                affected=affected,
                created_at=tx.ts,
            )
            box.append(pid)
            tx.emit(
                "Proposed",
                {
                    "id": pid,
                    "proposer": tx.sender,
                    "subjectPrincipal": subject_principal,
                    "title": title,
                    "riskReportHash": risk_report_hash,
                },
            )

        res = self._transact(self._member(member), "propose", body)
        if res.status == "ok":
            res.proposal_id = box[0]
        return res

    def approve(self, member: str, proposal_id: int) -> TxResult:
        def body(tx: _Tx) -> None:
            self._need_member(tx)
            p = self.council.proposals.get(proposal_id)
            if p is None:
                raise ChainRevert("UnknownProposal")
            if p.executed or p.cancelled:
                raise ChainRevert("ProposalNotOpen")
            own = self.council.member_principal[tx.sender]
            if own and (own == p.subject_principal or own in p.affected):
                raise ChainRevert("ConflictOfInterest")
            if tx.sender in p.approved_by:
                raise ChainRevert("AlreadyApproved")
            p.approved_by.add(tx.sender)
            p.approvals += 1
            tx.emit("Approved", {"id": p.id, "member": tx.sender})
            if p.approvals >= THRESHOLD:
                for c in p.calls:
                    if c.get("fn") != "bumpPolicyVersion":  # implicit: bumped once, below
                        self._apply_call(tx, c)
                self._apply_vault(tx, "bumpPolicyVersion", {})  # exactly once per executed proposal
                p.executed = True
                tx.emit("Executed", {"id": p.id})

        return self._transact(self._member(member), "approve", body)

    def cancel(self, member: str, proposal_id: int) -> TxResult:
        def body(tx: _Tx) -> None:
            self._need_member(tx)
            p = self.council.proposals.get(proposal_id)
            if p is None:
                raise ChainRevert("UnknownProposal")
            if p.proposer != tx.sender:
                raise ChainRevert("NotProposer")
            if p.executed or p.cancelled:
                raise ChainRevert("ProposalNotOpen")
            p.cancelled = True
            tx.emit("Cancelled", {"id": p.id})

        return self._transact(self._member(member), "cancel", body)

    # ---------------------------------------------------- symbolic call exec
    def _set_role(self, tx: _Tx, key: str, role: int) -> None:
        """Tx AllowList `setNone` (0) / `setEnabled` (1) called by the Council contract; like the
        precompile it logs `RoleSet`, which the indexer normalises to `AllowListRoleSet`."""
        (self.txallow.set_enabled if role else self.txallow.set_none)(key)
        tx.emit("AllowListRoleSet", {"key": key, "role": role, "by": self.council_addr})

    def _apply_call(self, tx: _Tx, call: dict[str, Any]) -> None:
        target, fn, a = call.get("target"), call.get("fn"), call.get("args", {})
        if target not in ALLOWED_TARGETS:
            raise ChainRevert("TargetNotAllowed")
        if fn not in KNOWN_FNS[target]:
            raise ChainRevert("UnknownCall")
        reg = self.registry
        try:
            if target == "registry":
                if fn == "createPrincipal":
                    reg.create_principal(a["id"], a.get("label", a["id"]), a.get("kind", "HUMAN"))
                    tx.emit("PrincipalCreated", {"id": a["id"], "label": a.get("label", a["id"])})
                elif fn == "addKey":
                    key = self._addr(a["key"])
                    reg.add_key(a["id"], key, a["kind"], a.get("label", ""), a.get("seed_id", ""))
                    tx.emit(
                        "KeyAdded",
                        {"id": a["id"], "key": key, "kind": a["kind"], "label": a.get("label", "")},
                    )
                elif fn == "moveKey":
                    key = self._addr(a["key"])
                    old = reg.move_key(key, a["to"])
                    tx.emit("KeyMoved", {"key": key, "fromId": old, "toId": a["to"]})
                else:
                    key = self._addr(a["key"])
                    reg.deactivate_key(key)
                    tx.emit("KeyDeactivated", {"key": key})
            elif target == "tx_allowlist":
                addr = self._addr(a["address"])
                self._set_role(tx, addr, 1 if fn == "setEnabled" else 0)
            else:
                self._apply_vault(tx, fn, a)
        except KeyError as e:
            raise ChainRevert("BadCallArgs") from e

    def _apply_vault(self, tx: _Tx, fn: str, a: dict[str, Any]) -> None:
        v = self.vault
        if fn == "lockPrincipal":
            pid = a["principal_id"]
            v.locked.add(pid)
            tx.emit("PrincipalLocked", {"principalId": pid, "by": tx.sender})
            for k in self.registry.keys_of(pid):
                self._set_role(tx, k, 0)
        elif fn == "unlockPrincipal":
            pid = a["principal_id"]
            v.locked.discard(pid)
            tx.emit("PrincipalUnlocked", {"principalId": pid})
            for k in self.registry.keys_of(pid):
                if self.registry.key_info[k].active:
                    self._set_role(tx, k, 1)
        elif fn == "pauseAll":
            v.paused = True
            tx.emit("Paused", {"by": tx.sender})
        elif fn == "unpauseAll":
            v.paused = False
            tx.emit("Unpaused", {})
        elif fn == "setKeyDailyCap":
            key = self._addr(a["key"])
            old = v.key_cap.get(key, 0)
            v.key_cap[key] = a["cap"]
            tx.emit(
                "CapChanged", {"kind": "key", "subject": key, "oldCap": old, "newCap": a["cap"]}
            )
        elif fn == "setPrincipalDailyCap":
            old = v.principal_cap.get(a["principal_id"], 0)
            v.principal_cap[a["principal_id"]] = a["cap"]
            tx.emit(
                "CapChanged",
                {
                    "kind": "principal",
                    "subject": a["principal_id"],
                    "oldCap": old,
                    "newCap": a["cap"],
                },
            )
        elif fn == "setTokenAllowed":
            subj = self._addr(a.get("token", a.get("subject", "")))
            v.token_allowed[subj] = a["allowed"]
            tx.emit(
                "AllowChanged",
                {"kind": "token", "subject": subj, "selector": None, "allowed": a["allowed"]},
            )
        elif fn == "setRecipientAllowed":
            subj = self._addr(a.get("recipient", a.get("subject", "")))
            (v.recipient_allowed.add if a["allowed"] else v.recipient_allowed.discard)(subj)
            tx.emit(
                "AllowChanged",
                {"kind": "recipient", "subject": subj, "selector": None, "allowed": a["allowed"]},
            )
        elif fn == "setProtocolAllowed":
            subj = self._addr(a.get("target", a.get("subject", "")))
            sel = (a.get("selector") or self._meta.get(subj, {}).get("selector", "")).lower()
            if a["allowed"]:
                v.protocol_allowed.add((subj, sel))
            else:
                v.protocol_allowed.discard((subj, sel))
            tx.emit(
                "AllowChanged",
                {"kind": "protocol", "subject": subj, "selector": sel, "allowed": a["allowed"]},
            )
        elif fn == "bumpPolicyVersion":
            v.policy_version += 1
            tx.emit("PolicyVersionBumped", {"version": v.policy_version})

    def apply_policy_v2(self) -> list[TxResult]:
        """Policy v2 via propose + 2 approvals (lan, trang)."""
        v2 = self._seed["policy_v2"]
        prop = self.propose(
            v2["approvers"][0], v2["title"], v2["subject_principal"], v2["calls"], _h("policy_v2")
        )
        pid = prop.proposal_id
        assert pid is not None, prop.error_raw
        return [self.approve(m, pid) for m in v2["approvers"]]

    # ------------------------------------------------------------- snapshot
    def snapshot(self) -> PolicySnapshot:
        v, reg, day = self.vault, self.registry, self.day_index
        keys = {
            addr: KeyState(
                addr,
                info.seed_id,
                info.label,
                info.kind,
                info.principal_id,  # type: ignore[arg-type]
                info.active,
                v.key_cap.get(addr, 0),
                v.spent_key(addr, day),
                self.txallow.is_allowed(addr),
            )
            for addr, info in reg.key_info.items()
        }
        principals = {
            pid: PrincipalState(
                pid,
                p.label,
                p.kind,
                v.principal_cap.get(pid, 0),  # type: ignore[arg-type]
                v.spent_principal(pid, day),
                pid in v.locked,
                reg.keys_of(pid),
            )
            for pid, p in reg.principals.items()
        }
        s = self._seed
        return PolicySnapshot(
            policy_version=v.policy_version,
            block=self.block,
            day_index=day,
            paused=v.paused,
            vault_balance=self.ledger.balance(self.vault_addr, self.tusdc),
            main_treasury=self.main_treasury,
            principals=principals,
            keys=keys,
            declared_edges=[
                DeclaredEdge(
                    e["id"],
                    e["from_principal"],
                    e["to"],
                    e["relation"],
                    e["note"],
                    e.get("source", "declared"),
                )
                for e in s["declared_edges"]
            ],
            council=[
                CouncilMember(mid, self._meta[a]["label"], a, self.council.member_principal[a])
                for mid, a in self.council.members.items()
            ],
            recipients=[
                Recipient(
                    r["address"], r["seed_id"], r["label"], r["address"] in v.recipient_allowed
                )
                for r in s["recipients"]
            ],
            protocols=[
                Protocol(
                    p["address"],
                    p["seed_id"],
                    p["label"],
                    p["selector"],
                    (p["address"], p["selector"].lower()) in v.protocol_allowed,
                )
                for p in s["protocols"]
            ],
            tokens=[
                Token(
                    t["address"],
                    t["symbol"],
                    t["decimals"],
                    v.token_allowed.get(t["address"], False),
                )
                for t in s["tokens"]
            ],
        )


def _c(target: str, fn: str, **args: Any) -> dict[str, Any]:
    return {"target": target, "fn": fn, "args": args}
