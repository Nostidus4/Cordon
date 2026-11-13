"""GraphSnapshot (spec §8.3) with money as {raw, display} in node data and districts."""

from __future__ import annotations

from typing import Any

from pydantic import Field

from guardian.schemas.common import CamelModel, Money


class GraphNode(CamelModel):
    id: str
    type: str
    label: str
    data: dict[str, Any]


class GraphEdge(CamelModel):
    id: str
    from_: str = Field(alias="from")
    to: str
    type: str
    source: str


class GraphDistrict(CamelModel):
    principal_id: str
    label: str
    kind: str
    daily_cap: Money | None = None
    spent_today: Money
    locked: bool
    keys: list[str]


class GraphSnapshot(CamelModel):
    version: int
    policy_version: int
    policy_label: int
    block: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    districts: list[GraphDistrict]
