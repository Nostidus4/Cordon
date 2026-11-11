"""POST /api/simulate: SimResult, or before/after when a ProposedChange is given."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.simulate import SimulateRequest, SimulateResponse
from guardian.services import graph_service

router = APIRouter(prefix="/api", tags=["simulate"])


@router.post("/simulate", response_model=SimulateResponse, response_model_exclude_none=True)
async def simulate(body: SimulateRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return graph_service.simulate(rt, body.compromised, body.change)
