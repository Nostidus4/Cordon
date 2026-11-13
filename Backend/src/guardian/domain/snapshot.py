"""Read-only policy state shared by the chain layer (producer) and graph/simulate/findings (consumers).

Contract between `guardian.chain` and `guardian.graph`: the chain layer (sim or real) builds a
`PolicySnapshot`; graph code only reads it and never mutates it (copy with `dataclasses.replace`
/ `copy.deepcopy` when applying a ProposedChange). All amounts are int base units of tUSDC
(6 decimals): 20.000 USDC == 20_000_000_000.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

PrincipalKindT = Literal["HUMAN", "AGENT", "SERVICE"]
KeyKindT = Literal["HUMAN", "AGENT", "SERVICE"]
RelationT = Literal["controls", "admins"]


@dataclass
class KeyState:
    address: str  # checksum hex, e.g. "0xAbC..."
    seed_id: str  # stable seed name, e.g. "key_minh"
    label: str  # display label (untrusted text)
    kind: KeyKindT
    principal_id: str  # district the key belongs to on-chain
    active: bool
    daily_cap: int  # keyDailyCap
    spent_today: int  # keySpent[key][today]
    allow_listed: bool  # Tx AllowList role != None


@dataclass
class PrincipalState:
    id: str  # e.g. "minh"
    label: str  # e.g. "Anh Minh"
    kind: PrincipalKindT
    daily_cap: int  # principalDailyCap, 0 = not set
    spent_today: int  # principalSpent[id][today]
    locked: bool
    keys: list[str] = field(default_factory=list)  # key addresses


@dataclass
class DeclaredEdge:
    id: str  # e.g. "e:minh-controls-agent_data"
    from_principal: str
    to: str  # principal id or key address
    relation: RelationT
    note: str  # untrusted text
    source: Literal["declared", "inferred"] = "declared"


@dataclass
class CouncilMember:
    id: str  # "trang" | "lan" | "huy"
    label: str
    address: str
    principal_id: str | None  # memberPrincipal, None if none


@dataclass
class Recipient:
    address: str
    seed_id: str  # e.g. "vendor_cloud"
    label: str
    allowed: bool


@dataclass
class Protocol:
    address: str
    seed_id: str  # "mock_dex" | "evil_dex"
    label: str
    selector: str  # "0x...." swapExactIn
    allowed: bool


@dataclass
class Token:
    address: str
    symbol: str  # tUSDC | tTKB | tSCAM
    decimals: int
    allowed: bool


@dataclass
class PolicySnapshot:
    policy_version: int
    block: int
    day_index: int
    paused: bool
    vault_balance: int  # tUSDC in PolicyVault
    main_treasury: int  # tUSDC in Safe on C-Chain (2.000.000)
    principals: dict[str, PrincipalState]
    keys: dict[str, KeyState]  # by address
    declared_edges: list[DeclaredEdge]
    council: list[CouncilMember]
    recipients: list[Recipient]
    protocols: list[Protocol]
    tokens: list[Token]
    # vault.policyVersion() of the freshly seeded set (deployments file `policyBaseline`). Every executed
    # proposal bumps the contract's counter, so a real deployment starts above 1; the label hides that.
    policy_baseline: int = 1

    @property
    def policy_label(self) -> int:
        """The version people see: v1 at the start of scene 1, v2 after the merge proposal."""
        return self.policy_version - self.policy_baseline + 1
