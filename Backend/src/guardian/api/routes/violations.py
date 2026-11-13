"""GET /api/violations?limit=: the violations board (CITY-005), newest first."""

from fastapi import APIRouter, Query

from guardian.api.deps import RuntimeDep
from guardian.schemas.violation import ViolationOut
from guardian.services import violations

router = APIRouter(prefix="/api", tags=["violations"])


@router.get("/violations", response_model=list[ViolationOut])
async def list_violations(rt: RuntimeDep, limit: int = Query(50, ge=1, le=500)):  # type: ignore[no-untyped-def]
    """Every refused call (reason code as the chain returned it), newest first. Read-only."""
    return violations.list_violations(rt, limit)
