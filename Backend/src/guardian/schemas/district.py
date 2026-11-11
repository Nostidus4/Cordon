from __future__ import annotations

from guardian.schemas.common import CamelModel, Money
from guardian.schemas.finding import FindingOut


class DistrictKey(CamelModel):
    address: str
    seed_id: str
    label: str
    kind: str
    daily_cap: Money
    spent_today: Money
    remaining: Money
    active: bool
    allow_listed: bool


class DistrictOut(CamelModel):
    principal_id: str
    label: str
    kind: str
    daily_cap: Money | None = None
    spent_today: Money
    remaining: Money
    you_think: Money
    locked: bool
    keys: list[DistrictKey]
    declared_edges: list[dict[str, str]]
    council: list[str]
    findings: list[FindingOut]
