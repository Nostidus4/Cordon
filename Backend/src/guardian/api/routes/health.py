"""GET /api/health: latest block, indexer lag, agent status, demoMode."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.health import HealthOut
from guardian.services import org_service

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthOut)
async def health(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return org_service.health(rt)
