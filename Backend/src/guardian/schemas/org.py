from __future__ import annotations

from guardian.schemas.common import CamelModel, JsonDict, Money


class CouncilMemberOut(CamelModel):
    id: str
    label: str
    address: str
    principal_id: str | None = None


class VaultOut(CamelModel):
    address: str
    balance: Money  # tUSDC
    balance_tkb: Money  # tTKB (18 decimals)
    paused: bool
    label: str


class OrgOut(CamelModel):
    id: str
    name: str
    fictional: bool
    policy_version: int
    policy_label: int
    main_treasury: JsonDict
    vault: VaultOut
    council: list[CouncilMemberOut]
    threshold: int


__all__ = ["CouncilMemberOut", "Money", "OrgOut", "VaultOut"]
