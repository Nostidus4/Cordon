"""GuardianCouncil state (spec §6.5): members, proposals, allowed call targets."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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


@dataclass
class Proposal:
    id: int
    proposer: str
    subject_principal: str | None
    calls: list[dict[str, Any]]
    risk_report_hash: str
    title: str
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
