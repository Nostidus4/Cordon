"""POST /api/agent/run-once: one round of agent-rebalance."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.agent import AgentRunOut
from guardian.services import agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post(
    "/run-once", response_model=AgentRunOut, dependencies=[Depends(demo_signing("agent.run_once"))]
)
async def run_once(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return agent_service.run_once(rt)
