"""GET /api/graph and GET /api/city/states."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.city import CityStates
from guardian.schemas.graph import GraphSnapshot
from guardian.services import graph_service

router = APIRouter(prefix="/api", tags=["graph"])


@router.get("/graph", response_model=GraphSnapshot)
async def get_graph(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return graph_service.graph(rt)


@router.get("/city/states", response_model=CityStates, tags=["city"])
async def city_states(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return rt.city_states()
