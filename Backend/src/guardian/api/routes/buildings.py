"""GET /api/city/buildings and /api/city/buildings/{id} (docs/spec/CITY_OPS.md §2). Read-only."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.building import BuildingDetail, BuildingInfo
from guardian.services import building_service

router = APIRouter(prefix="/api/city", tags=["city"])


@router.get("/buildings", response_model=list[BuildingInfo])
async def list_buildings():  # type: ignore[no-untyped-def]
    return building_service.list_buildings()


@router.get("/buildings/{building_id}", response_model=BuildingDetail)
async def get_building(building_id: str, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return building_service.detail(rt, building_id)
