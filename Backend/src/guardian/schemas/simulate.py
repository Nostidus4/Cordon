"""POST /api/simulate (spec §8.4, §8.6): SimResult, or {before, after} when `change` is given."""

from __future__ import annotations

from typing import Any

from guardian.schemas.common import CamelModel, Highlights, Money
from guardian.schemas.finding import FindingOut


class SimulateRequest(CamelModel):
    compromised: list[str]
    change: dict[str, Any] | None = None  # ProposedChange (camelCase or snake_case)


class ReachedKey(CamelModel):
    key: str
    via: list[str]


class PerDistrict(CamelModel):
    principal_id: str
    enforced: Money
    estimated: Money
    note: str


class Totals(CamelModel):
    you_think: Money
    enforced: Money
    estimated: Money
    vault_balance: Money
    percent_of_main_treasury: float


class SimResult(CamelModel):
    reached_keys: list[ReachedKey]
    per_district: list[PerDistrict]
    totals: Totals
    highlights: Highlights
    findings: list[FindingOut]


class SimulateResponse(CamelModel):
    """SimResult fields when no change; before/after when a change is simulated."""

    reached_keys: list[ReachedKey] | None = None
    per_district: list[PerDistrict] | None = None
    totals: Totals | None = None
    highlights: Highlights | None = None
    findings: list[FindingOut] | None = None
    before: SimResult | None = None
    after: SimResult | None = None
