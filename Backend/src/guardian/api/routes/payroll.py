"""/api/payroll/*: payroll float state, agent, kill switch, Governor proposals, demo controls (PAYROLL.md section 8).

Every POST signs with a demo key, so it needs DEMO_MODE (`demo_signing`); GETs are read-only.
"""

from typing import Any

from fastapi import APIRouter, Depends, Query

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.payroll import (
    PayrollAdvanceRequest,
    PayrollAgentRunOut,
    PayrollAgentRunRequest,
    PayrollEventOut,
    PayrollLadderOut,
    PayrollMemberRequest,
    PayrollPayeeOut,
    PayrollProposalOut,
    PayrollProposeRequest,
    PayrollReportOut,
    PayrollScaleRequest,
    PayrollStateOut,
    PayrollTxOut,
    PayrollVenueOut,
)
from guardian.services import payroll_service as ps

router = APIRouter(prefix="/api/payroll", tags=["payroll"])


# ------------------------------------------------------------------ reads
@router.get("", response_model=PayrollStateOut)
async def state(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.state_out(rt)


@router.get("/venues", response_model=list[PayrollVenueOut])
async def venues(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.venues_out(rt)


@router.get("/ladder", response_model=PayrollLadderOut)
async def ladder(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.ladder_out(rt)


@router.get("/roster", response_model=list[PayrollPayeeOut])
async def roster(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.roster_out(rt)


@router.get("/events", response_model=list[PayrollEventOut])
async def events(rt: RuntimeDep, limit: int = Query(100, ge=1, le=1000)):  # type: ignore[no-untyped-def]
    return ps.events_out(rt, limit)


@router.get("/runs", response_model=list[PayrollAgentRunOut])
async def runs(rt: RuntimeDep, limit: int = Query(50, ge=1, le=200)):  # type: ignore[no-untyped-def]
    return ps.runs_out(rt, limit)


@router.get("/report", response_model=PayrollReportOut)
async def report(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.report_out(rt)


# ------------------------------------------------------------------ demo controls (DEMO_MODE)
@router.post(
    "/demo/advance",
    response_model=PayrollStateOut,
    dependencies=[Depends(demo_signing("payroll.advance"))],
)
async def advance(body: PayrollAdvanceRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.advance(rt, body.seconds)


@router.post(
    "/demo/scale",
    response_model=PayrollStateOut,
    dependencies=[Depends(demo_signing("payroll.scale"))],
)
async def scale(body: PayrollScaleRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.set_scale(rt, body.scale)


@router.post(
    "/demo/venues/{venue}/freeze",
    response_model=PayrollStateOut,
    dependencies=[Depends(demo_signing("payroll.freeze"))],
)
async def freeze(venue: str, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.set_frozen(rt, venue, True)


@router.post(
    "/demo/venues/{venue}/unfreeze",
    response_model=PayrollStateOut,
    dependencies=[Depends(demo_signing("payroll.unfreeze"))],
)
async def unfreeze(venue: str, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.set_frozen(rt, venue, False)


@router.post(
    "/demo/reset",
    response_model=PayrollStateOut,
    dependencies=[Depends(demo_signing("payroll.reset"))],
)
async def demo_reset(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    ps.reset(rt)
    ps.publish_state(rt)
    return ps.state_out(rt)


# ------------------------------------------------------------------ agent + money paths
@router.post(
    "/agent/run",
    response_model=PayrollAgentRunOut,
    dependencies=[Depends(demo_signing("payroll.agent_run"))],
)
async def agent_run(rt: RuntimeDep, body: PayrollAgentRunRequest | None = None):  # type: ignore[no-untyped-def]
    return ps.run_agent(rt, body.untrusted_input if body else None)


@router.post(
    "/kill", response_model=PayrollTxOut, dependencies=[Depends(demo_signing("payroll.kill"))]
)
async def kill(rt: RuntimeDep, body: PayrollMemberRequest | None = None):  # type: ignore[no-untyped-def]
    return ps.kill(rt, body.member if body else "lan")


@router.post(
    "/finalize",
    response_model=PayrollTxOut,
    dependencies=[Depends(demo_signing("payroll.finalize"))],
)
async def finalize(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.finalize(rt)


@router.post(
    "/execute",
    response_model=PayrollTxOut,
    dependencies=[Depends(demo_signing("payroll.execute"))],
)
async def execute(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.execute(rt)


# ------------------------------------------------------------------ Governor proposals (own id namespace)
@router.get("/proposals", response_model=list[PayrollProposalOut])
async def list_proposals(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.list_proposals(rt)


@router.get("/proposals/{proposal_id}", response_model=PayrollProposalOut)
async def get_proposal(proposal_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.proposal_out(rt, proposal_id)


@router.post(
    "/proposals",
    response_model=PayrollProposalOut,
    status_code=201,
    dependencies=[Depends(demo_signing("payroll.propose"))],
)
async def propose(body: PayrollProposeRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    calls: list[dict[str, Any]] = [c.model_dump(by_alias=False) for c in body.calls]
    return ps.propose(rt, body.member, body.title, calls, body.risk_report_hash)


@router.post(
    "/proposals/{proposal_id}/approve",
    response_model=PayrollProposalOut,
    dependencies=[Depends(demo_signing("payroll.approve"))],
)
async def approve(proposal_id: int, body: PayrollMemberRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.approve(rt, proposal_id, body.member)


@router.post(
    "/proposals/{proposal_id}/cancel",
    response_model=PayrollProposalOut,
    dependencies=[Depends(demo_signing("payroll.cancel"))],
)
async def cancel(proposal_id: int, body: PayrollMemberRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.cancel(rt, proposal_id, body.member)
