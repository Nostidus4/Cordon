"""POST /api/demo/reset and /api/demo/policy-v2 (spec §14.2; DEMO_MODE only)."""

from typing import Any

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.proposal import ProposalOut
from guardian.services import demo_reset

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/reset", dependencies=[Depends(demo_signing("demo.reset"))])
async def reset(rt: RuntimeDep) -> dict[str, Any]:
    return await demo_reset.reset(rt)


@router.post(
    "/policy-v2", response_model=ProposalOut, dependencies=[Depends(demo_signing("demo.policy_v2"))]
)
async def policy_v2(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return demo_reset.apply_policy_v2(rt)
