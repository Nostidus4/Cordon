"""GET /api/districts/{id}."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.district import DistrictOut
from guardian.services import district_service

router = APIRouter(prefix="/api", tags=["districts"])


@router.get("/districts/{principal_id}", response_model=DistrictOut)
async def district(principal_id: str, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return district_service.district(rt, principal_id)
