from __future__ import annotations

from typing import Any, Literal

from guardian.schemas.common import CamelModel

BuildingState = Literal["normal", "warning", "incident", "recovery"]


class Evidence(CamelModel):
    kind: str
    value: Any


class Building(CamelModel):
    id: str
    name: str
    state: BuildingState
    reason_vi: str
    evidence: list[Evidence]


class CityStates(CamelModel):
    buildings: list[Building]
    updated_at: int
    policy_version: int
    graph_version: int
