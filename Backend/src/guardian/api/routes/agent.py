"""POST /api/agent/run-once: one round of agent-rebalance."""

from fastapi import APIRouter, Depends, Query

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.agent import AgentRunOut
from guardian.services import agent_service

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/runs", response_model=list[AgentRunOut])
async def list_runs(rt: RuntimeDep, limit: int = Query(200, ge=1)):  # type: ignore[no-untyped-def]
    """Agent runs, oldest first (the last `limit`). Read-only."""
    on_chain = agent_service.chain_reason_hashes(rt)
    return [agent_service.agent_run_out(r, on_chain) for r in rt.stores.agent_runs.all()[-limit:]]


@router.post(
    "/run-once", response_model=AgentRunOut, dependencies=[Depends(demo_signing("agent.run_once"))]
)
async def run_once(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return agent_service.run_once(rt)
