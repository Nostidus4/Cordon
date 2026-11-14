"""GET /api/topups: simulated top-ups joined across C-Chain and L1 (IDX-002)."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.topups import TopUpOut
from guardian.services import org_service

router = APIRouter(prefix="/api", tags=["topups"])


@router.get("/topups", response_model=list[TopUpOut])
async def get_topups(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return org_service.topups(rt)
