"""POST /api/actions/lock and /pause: a Council member tightens (1 signature)."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.action import ActionOut, LockRequest, PauseRequest
from guardian.services import action_service

router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.post(
    "/lock", response_model=ActionOut, dependencies=[Depends(demo_signing("actions.lock"))]
)
async def lock(body: LockRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return action_service.lock(rt, body.member, body.principal_id)


@router.post(
    "/pause", response_model=ActionOut, dependencies=[Depends(demo_signing("actions.pause"))]
)
async def pause(body: PauseRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return action_service.pause(rt, body.member)
