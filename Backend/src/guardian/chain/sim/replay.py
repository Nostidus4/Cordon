"""Rebuild a SimChain from its emitted ChainEvents (DB-003): the events are the only durable state.

Not recoverable from events alone: `KeyInfo.seed_id` of keys added after the seed, the `kind` of
principals created after the seed (the event carries only id+label), and `_day_offset`/`_clock`.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from eth_utils import to_checksum_address

from guardian.chain.base import ChainEvent
from guardian.chain.sim.council import Proposal, affected_principals
from guardian.chain.sim.engine import SimChain

_NOOP = {"EmergencyAction", "Executed"}  # Executed: flag set below, no other state


def _a(x: str) -> str:
    return to_checksum_address(x)


def replay(
    chain: SimChain,
    events: Iterable[ChainEvent],
    calls: Mapping[int, list[dict[str, Any]]] | None = None,
) -> None:
    """Apply recorded events onto `chain`, which the caller has just built from the seed and `reset()`.
    No subscriber is called and nothing is emitted. `calls`: proposal id -> chain calls (hex addresses, the
    same shape `SimChain.propose` takes), used to restore open proposals' calls/`affected` (the Proposed
    event does not carry calls); missing -> []"""
    v, reg, led, cs = chain.vault, chain.registry, chain.ledger, chain.council
    for e in events:
        p, n = e.payload, e.name
        if n in ("Paid", "Swapped"):
            key = _a(p["key"])
            v.key_spent[(key, p["day"])] = p["keySpentAfter"]
            v.principal_spent[(p["principalId"], p["day"])] = p["principalSpentAfter"]
            if n == "Paid":
                led.transfer(chain.vault_addr, _a(p["to"]), _a(p["token"]), p["amount"])
            else:
                dex, t_in, t_out = _a(p["dex"]), _a(p["tokenIn"]), _a(p["tokenOut"])
                led.transfer(chain.vault_addr, dex, t_in, p["amountIn"])
                led.mint(dex, t_out, 0)
                led.mint(chain.vault_addr, t_out, p["amountOut"])
        elif n == "TopUpRecorded":
            chain.main_treasury -= p["amount"]
            led.mint(chain.vault_addr, chain.tusdc, p["amount"])
        elif n == "CapChanged":
            if p["kind"] == "key":
                v.key_cap[_a(p["subject"])] = p["newCap"]
            else:
                v.principal_cap[p["subject"]] = p["newCap"]
        elif n == "AllowChanged":
            subj, on = _a(p["subject"]), p["allowed"]
            if p["kind"] == "token":
                v.token_allowed[subj] = on
            elif p["kind"] == "recipient":
                (v.recipient_allowed.add if on else v.recipient_allowed.discard)(subj)
            else:
                (v.protocol_allowed.add if on else v.protocol_allowed.discard)(
                    (subj, p["selector"])
                )
        elif n == "PrincipalLocked":
            v.locked.add(p["principalId"])
        elif n == "PrincipalUnlocked":
            v.locked.discard(p["principalId"])
        elif n in ("Paused", "Unpaused"):
            v.paused = n == "Paused"
        elif n == "PolicyVersionBumped":
            v.policy_version = p["version"]
        elif n == "PrincipalCreated":
            reg.create_principal(p["id"], p["label"])
        elif n == "KeyAdded":
            reg.add_key(p["id"], _a(p["key"]), p["kind"], p["label"])
        elif n == "KeyMoved":
            reg.move_key(_a(p["key"]), p["toId"])
        elif n == "KeyDeactivated":
            reg.deactivate_key(_a(p["key"]))
        elif n == "AllowListRoleSet":
            (chain.txallow.set_enabled if p["role"] else chain.txallow.set_none)(_a(p["key"]))
        elif n == "Proposed":
            cl = list((calls or {}).get(p["id"], []))
            cs.proposals[p["id"]] = Proposal(
                p["id"],
                _a(p["proposer"]),
                p["subjectPrincipal"],
                cl,
                p["riskReportHash"],
                p["title"],
                affected=affected_principals(cl, chain._principal_of_ref),
                created_at=e.ts,
            )
            cs.next_id = max(cs.next_id, p["id"] + 1)
        elif n == "Approved":
            prop = cs.proposals[p["id"]]
            prop.approved_by.add(_a(p["member"]))
            prop.approvals += 1
        elif n == "Cancelled":
            cs.proposals[p["id"]].cancelled = True
        elif n not in _NOOP:
            raise ValueError(f"unknown chain event {n!r}")
        if n == "Executed":
            cs.proposals[p["id"]].executed = True
        chain.events.append(e)
        chain.block = max(chain.block, e.block)
    chain._nonce = chain.block - 1
