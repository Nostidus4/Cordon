"""Proposals: draft (not sent), propose, list, approve (member; conflicted member -> 409)."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.core.errors import ApiError
from guardian.schemas.proposal import (
    ApproveRequest,
    DraftOut,
    DraftRequest,
    ProposalOut,
    ProposeRequest,
)
from guardian.services import proposal_service as ps

router = APIRouter(prefix="/api", tags=["proposals"])


@router.post("/proposals/draft", response_model=DraftOut)
async def draft(body: DraftRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.draft(rt, body.finding_id, body.change, body.compromised)


@router.post(
    "/proposals",
    response_model=ProposalOut,
    status_code=201,
    dependencies=[Depends(demo_signing("proposals.propose"))],
)
async def propose(body: ProposeRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.propose(rt, body.member, body.finding_id, body.change, body.title)


@router.get("/proposals", response_model=list[ProposalOut])
async def list_proposals(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.list_proposals(rt)


@router.get("/proposals/{proposal_id}", response_model=ProposalOut)
async def get_proposal(proposal_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    if rt.stores.proposals.get(proposal_id) is None:
        raise ApiError(404, "PROPOSAL_NOT_FOUND", f"Không có đề xuất #{proposal_id}.")
    return ps.proposal_out(rt, proposal_id)


@router.post(
    "/proposals/{proposal_id}/execute",
    response_model=ProposalOut,
    dependencies=[Depends(demo_signing("proposals.execute"))],
)
async def execute(proposal_id: int, body: ApproveRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.execute(rt, proposal_id, body.member)


@router.post(
    "/proposals/{proposal_id}/veto",
    response_model=ProposalOut,
    dependencies=[Depends(demo_signing("proposals.veto"))],
)
async def veto(proposal_id: int, body: ApproveRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.veto(rt, proposal_id, body.member)


@router.post(
    "/proposals/{proposal_id}/approve",
    response_model=ProposalOut,
    dependencies=[Depends(demo_signing("proposals.approve"))],
)
async def approve(proposal_id: int, body: ApproveRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return ps.approve(rt, proposal_id, body.member)
