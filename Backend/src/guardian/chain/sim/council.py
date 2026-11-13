"""GuardianCouncil state (spec §6.5): members, proposals, allowed call targets."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from guardian.chain.errors import ChainRevert

THRESHOLD = 2
ALLOWED_TARGETS = ("registry", "vault", "tx_allowlist")
KNOWN_FNS: dict[str, frozenset[str]] = {
    "registry": frozenset({"createPrincipal", "addKey", "moveKey", "deactivateKey"}),
    "vault": frozenset(
        {
            "lockPrincipal",
            "unlockPrincipal",
            "pauseAll",
            "unpauseAll",
            "setKeyDailyCap",
            "setPrincipalDailyCap",
            "setTokenAllowed",
            "setProtocolAllowed",
            "setRecipientAllowed",
            "bumpPolicyVersion",
        }
    ),
    "tx_allowlist": frozenset({"setEnabled", "setNone"}),
}


def _arg(a: dict[str, Any], *names: str) -> Any:
    for n in names:
        if a.get(n):
            return a[n]
    raise ChainRevert("BadCallArgs")


def affected_principals(
    calls: list[dict[str, Any]], principal_of: Callable[[str], str | None]
) -> list[str]:
    """Principals the symbolic calls touch, de-duplicated in first-seen order (mirror of the
    contract's `_affected`): moveKey -> the key's current principal and the receiving one;
    createPrincipal/addKey/setPrincipalDailyCap/lock/unlock -> the id argument; deactivateKey,
    setKeyDailyCap and the Tx AllowList setEnabled/setNone -> the principal the key belongs to now
    (an unregistered key gives none).

    `principal_of` takes an address or seed id. Raises `ChainRevert("BadCallArgs")` on a missing argument.
    """
    out: list[str] = []

    def add(pid: str | None) -> None:
        if pid and pid not in out:
            out.append(pid)

    for c in calls:
        target, fn, a = c.get("target"), c.get("fn"), c.get("args") or {}
        if target == "registry":
            if fn == "moveKey":
                add(principal_of(_arg(a, "key")))
                add(_arg(a, "to", "toId"))
            elif fn == "deactivateKey":
                add(principal_of(_arg(a, "key")))
            elif fn in ("createPrincipal", "addKey"):
                add(_arg(a, "id", "principal_id", "principalId"))
        elif target == "vault":
            if fn == "setKeyDailyCap":
                add(principal_of(_arg(a, "key")))
            elif fn in ("setPrincipalDailyCap", "lockPrincipal", "unlockPrincipal"):
                add(_arg(a, "principal_id", "principalId", "id"))
        elif target == "tx_allowlist":
            add(principal_of(_arg(a, "address", "key")))
    return out


@dataclass
class Proposal:
    id: int
    proposer: str
    subject_principal: str | None
    calls: list[dict[str, Any]]
    risk_report_hash: str
    title: str
    # principals the calls touch, derived at propose time (conflict-of-interest set)
    affected: list[str] = field(default_factory=list)
    approvals: int = 0
    approved_by: set[str] = field(default_factory=set)
    executed: bool = False
    cancelled: bool = False
    created_at: int = 0

    @property
    def status(self) -> str:
        return "executed" if self.executed else "cancelled" if self.cancelled else "open"


class CouncilState:
    def __init__(self) -> None:
        self.members: dict[str, str] = {}  # id -> address
        self.member_principal: dict[str, str | None] = {}  # address -> principal id
        self.proposals: dict[int, Proposal] = {}
        self.next_id = 1
