"""POST /api/assistant/ask: fixed questions answered from templates + tool numbers (verified)."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.assistant import service
from guardian.schemas.assistant import AskRequest, AssistantAnswer

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


@router.post("/ask", response_model=AssistantAnswer)
async def ask(body: AskRequest, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    ctx = body.context.model_dump() if body.context else None
    return service.ask(rt, body.question, ctx)
