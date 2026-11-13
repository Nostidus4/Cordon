"""POST /api/assistant/ask: fixed questions answered from templates + tool numbers (verified)."""

from fastapi import APIRouter, Query

from guardian.api.deps import RuntimeDep
from guardian.assistant import service
from guardian.schemas.assistant import AskRequest, AssistantAnswer, AssistantLogOut

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/ask", response_model=AssistantAnswer)
async def ask(body: AskRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    ctx = body.context.model_dump() if body.context else None
    return service.ask(rt, body.question, ctx)


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
        for r in rt.stores.assistant_logs[-limit:]
    ]
