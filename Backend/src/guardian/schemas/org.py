from __future__ import annotations

from guardian.schemas.common import CamelModel, JsonDict, Money


class CouncilMemberOut(CamelModel):
    id: str
    label: str
    address: str
    principal_id: str | None = None


class OrgOut(CamelModel):
    id: str
    name: str
    fictional: bool
    policy_version: int
    policy_label: int
    main_treasury: JsonDict
    vault: JsonDict
    council: list[CouncilMemberOut]
    threshold: int


__all__ = ["CouncilMemberOut", "Money", "OrgOut"]
