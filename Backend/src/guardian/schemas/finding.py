from __future__ import annotations

from typing import Any

from guardian.schemas.common import CamelModel


class FindingOut(CamelModel):
    id: str
    rule_id: str
    severity: str
    principal_id: str
    title: str
    data: dict[str, Any]
    proposal: dict[str, Any] | None = None  # ProposedChange (camelCase, amounts as Money)
