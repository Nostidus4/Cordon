"""Shared harness of the ChainPort conformance suite (CHN-003).

`Net` wraps one fresh chain (SimChain or L1Chain on anvil) seeded identically (May Labs policy v1,
spec section 4.3) and hides the only things that differ by nature: time travel and token/DEX
addresses. `norm` / `view` reduce results and snapshots to what the contract promises, dropping
tx_hash, block, simulated and the deployed addresses.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from guardian.chain.base import TxResult
from guardian.domain.snapshot import PolicySnapshot
from guardian.shared.money import to_base

DAY = 86400
u = to_base
SEL = "0x10b84623"  # MockDEX swap selector in the seed


@dataclass
class Net:
    kind: str  # "sim" | "l1"
    chain: Any  # a ChainPort (+ balance / proposal_state / apply_policy_v2 / _addr, shared by both)
    seed: dict[str, Any]
    env: Any = None  # anvil Env when kind == "l1"

    def advance_day(self, days: int = 1) -> None:
        """Time travel: sim `advance_day`, anvil `evm_increaseTime` + `evm_mine`."""
        if self.kind == "sim":
            self.chain.advance_day(days)
            return
        p = self.env.w3.provider
        p.make_request("evm_increaseTime", [days * DAY])
        p.make_request("evm_mine", [])

    def addr(self, ref: str) -> str:
        return str(self.chain._addr(ref))  # seed id -> address, on both implementations

    def snap(self) -> PolicySnapshot:
        return self.chain.snapshot()  # type: ignore[no-any-return]


def norm(r: TxResult) -> dict[str, Any]:
    """Comparable part of a result: status, reason, raw error name, event names, hash presence."""
    return {
        "status": r.status,
        "reason": r.reason_code.value if r.reason_code else None,
        "error": r.error_raw if r.status == "reverted" else None,
        "events": [e.name for e in r.events],
        "has_hash": r.tx_hash is not None,
    }


def view(snap: PolicySnapshot) -> dict[str, Any]:
    """Snapshot reduced to ids/labels: no block, no deployed token/DEX addresses."""
    return {
        "policy_version": snap.policy_version,
        "paused": snap.paused,
        "vault_balance": snap.vault_balance,
        "main_treasury": snap.main_treasury,
        "principals": {
            pid: {
                "label": p.label,
                "kind": p.kind,
                "daily_cap": p.daily_cap,
                "spent_today": p.spent_today,
                "locked": p.locked,
                "keys": sorted(snap.keys[k].seed_id for k in p.keys),
            }
            for pid, p in sorted(snap.principals.items())
        },
        "keys": {
            k.seed_id: {
                "address": k.address,
                "label": k.label,
                "kind": k.kind,
                "principal_id": k.principal_id,
                "active": k.active,
                "daily_cap": k.daily_cap,
                "spent_today": k.spent_today,
                "allow_listed": k.allow_listed,
            }
            for k in sorted(snap.keys.values(), key=lambda k: k.seed_id)
        },
        "council": [(m.id, m.label, m.address, m.principal_id) for m in snap.council],
        "recipients": {r.seed_id: (r.label, r.allowed) for r in snap.recipients},
        "protocols": {p.seed_id: (p.label, p.selector, p.allowed) for p in snap.protocols},
        "tokens": {t.symbol: (t.decimals, t.allowed) for t in snap.tokens},
        "declared_edges": [e.id for e in snap.declared_edges],
    }
