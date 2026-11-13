"""GET /api/city/buildings and /api/city/buildings/{id} (docs/spec/CITY_OPS.md §2)."""

from __future__ import annotations

from typing import Literal

from guardian.schemas.city import BuildingState, Evidence
from guardian.schemas.common import CamelModel


class RuleOut(CamelModel):
    id: str
    state: str  # incident | recovery | warning | "worst" (B08.worst: the worst of the other seven)
    when_vi: str


class BuildingInfo(CamelModel):
    id: str
    name: str
    module: str
    topic: str
    summary_vi: str
    rules: list[RuleOut]


class RuleStatus(RuleOut):
    active: bool  # the rule's condition holds right now (the first active rule decides the colour)


class RecentItem(CamelModel):
    ts: int
    kind: Literal["attempt", "event", "proposal", "agent_run", "assistant", "incident"]
    summary_vi: str
    tx_hash: str | None = None
    simulated: bool = True
    reason_code: str | None = None
    ref: str  # "attempt:12", "proposal:13", "incident:1", ...


class BuildingDetail(BuildingInfo):
    state: BuildingState
    reason_vi: str
    evidence: list[Evidence]
    rules: list[RuleStatus]  # type: ignore[assignment]
    active_rule_id: str | None = None
    recent: list[RecentItem]
    faults: list[str]
    incident_id: int | None = None
