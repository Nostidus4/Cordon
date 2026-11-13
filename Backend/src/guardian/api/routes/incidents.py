"""GET /api/incidents[?status=open|all] and /api/incidents/{id} (docs/spec/CITY_OPS.md §4.4). Read-only."""

from typing import Literal

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.incident import IncidentOut
from guardian.services import responder

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=list[IncidentOut])
async def list_incidents(rt: RuntimeDep, status: Literal["open", "all"] = "all"):  # type: ignore[no-untyped-def]
    rt.responder_tick()  # time-based transitions (recovering -> resolved) are current when read
    return responder.list_incidents(rt, status)


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    rt.responder_tick()
    return responder.get_incident(rt, incident_id)
