"""GET /api/findings: open findings (R1-R3)."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.finding import FindingOut
from guardian.services import graph_service

router = APIRouter(prefix="/api", tags=["findings"])


@router.get("/findings", response_model=list[FindingOut])
async def findings(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return graph_service.findings(rt)
