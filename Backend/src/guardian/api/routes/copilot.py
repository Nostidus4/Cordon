"""Copilot (B02, CITY-004; docs/spec/CITY_OPS.md §8). Only `confirm` can send, and it needs DEMO_MODE."""

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.assistant.copilot import eval as copilot_eval
from guardian.assistant.copilot import executor, service
from guardian.core.errors import ApiError
from guardian.schemas.copilot import (
    ConfirmRequest,
    CopilotDraftOut,
    CopilotEvalOut,
    CopilotReply,
    CopilotRequest,
)

router = APIRouter(prefix="/api/assistant/copilot", tags=["copilot"])


@router.post("", response_model=CopilotReply)
async def message(body: CopilotRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    """Prepare-only: a read answer, a refusal, or a PENDING draft. Never changes chain state."""
    return await run_in_threadpool(service.handle, rt, body.message)


@router.get("/drafts", response_model=list[CopilotDraftOut])
async def drafts(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return service.list_drafts(rt)


@router.post(
    "/drafts/{draft_id}/confirm",
    response_model=CopilotDraftOut,
    dependencies=[Depends(demo_signing("copilot.confirm"))],
)
async def confirm(draft_id: int, rt: RuntimeDep, body: ConfirmRequest | None = None):  # type: ignore[no-untyped-def]
    """The ONLY path that sends. 409 when the draft is not pending, or when the checkpoint said `danger`
    and `acknowledgeRisk` is not true."""
    return executor.confirm(rt, draft_id, bool(body and body.acknowledge_risk))


@router.post("/drafts/{draft_id}/reject", response_model=CopilotDraftOut)
async def reject(draft_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    """Never touches the chain."""
    return service.reject(rt, draft_id)


@router.get("/eval", response_model=CopilotEvalOut)
async def eval_report():  # type: ignore[no-untyped-def]
    """Latest report written by `make copilot-eval`."""
    report = copilot_eval.read_report()
    if report is None:
        raise ApiError(
            404, "EVAL_NOT_RUN", "Chưa có báo cáo đánh giá. Chạy `make copilot-eval` trước."
        )
    return report
