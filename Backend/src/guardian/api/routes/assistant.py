"""POST /api/assistant/ask: fixed questions from templates; free text only through the verified LLM path."""

from fastapi import APIRouter, Query
from starlette.concurrency import run_in_threadpool

from guardian.api.deps import RuntimeDep
from guardian.assistant import service
from guardian.schemas.assistant import AskRequest, AssistantAnswer, AssistantLogOut

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/ask", response_model=AssistantAnswer)
async def ask(body: AskRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    ctx = body.context.model_dump() if body.context else None
    # off the event loop: a free-text answer can wait on the LLM for up to LLM_TIMEOUT_SECONDS, and this path only reads
    # chain state and appends a log row, so it is safe beside the loop (SSE keeps flowing meanwhile)
    return await run_in_threadpool(service.ask, rt, body.question, ctx)


@router.get("/logs", response_model=list[AssistantLogOut])
async def logs(rt: RuntimeDep, limit: int = Query(200, ge=1)):  # type: ignore[no-untyped-def]
    """Assistant answers, oldest first (the last `limit`). Read-only."""
    return [
        {
            "id": r.id,
            "ts": r.ts,
            "questionId": r.question_id,
            "question": r.question,
            "answer": r.answer,
            "numbersVerified": r.numbers_verified,
            "screen": r.screen,
            "flaggedUntrusted": r.flagged_untrusted,
        }
        for r in rt.stores.assistant_logs.all()[-limit:]
    ]
