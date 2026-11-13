"""GET /api/faults and POST /api/faults/{id}/inject (docs/spec/CITY_OPS.md §3)."""

from __future__ import annotations

from guardian.schemas.common import CamelModel


class FaultDef(CamelModel):
    id: str
    building: str
    title_vi: str
    what_vi: str
    expect_vi: str


class FaultAction(CamelModel):
    label_vi: str
    ok: bool  # the real call went through (False for a call the chain rightly refused)
    tx_hash: str | None = None
    simulated: bool = True
    reason_code: str | None = None


class FaultResult(CamelModel):
    fault_id: str
    building: str
    at: int
    actions: list[FaultAction]
    incident_id: int | None = None
