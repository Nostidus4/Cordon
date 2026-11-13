"""POST /api/assistant/ask: fixed question -> tools -> template -> verifier -> log."""

from __future__ import annotations

from typing import Any

from guardian.assistant import fixed_questions as fq
from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import verify
from guardian.core.errors import ApiError
from guardian.services.runtime import AssistantLogRec, Runtime

FREE_TEXT_ID = "free_text"


def ask(
    rt: Runtime,
    question: str,
    context: dict[str, Any] | None = None,
    *,
    allow_free_text: bool = False,
) -> dict[str, Any]:
    """`allow_free_text` (CITY_OPS F02, never set by the public route): a question outside the fixed P0 set is not an
    error but a refusal: the assistant states no number it cannot verify, the log row is `numbers_verified=false`."""
    try:
        qid = fq.resolve_question_id(question)
    except ApiError:
        if not allow_free_text:
            raise
        qid = FREE_TEXT_ID
    ctx_in = context or {}
    verified = False
    built = fq.Built(fq.FALLBACK_ANSWER)
    try:
        if qid == FREE_TEXT_ID:
            raise ValueError("free text is not answered in P0")  # -> refusal below
        candidate, data = fq.build(qid, AssistantTools(rt), ctx_in.get("principalIds"))
        if len(candidate.answer.split()) <= fq.MAX_WORDS and verify(
            candidate.answer, candidate.numbers, data
        ):
            built, verified = candidate, True
    except ApiError:
        raise
    except Exception:  # noqa: BLE001 - any tool failure -> safe fallback, never a wrong number
        verified = False
    rt.stores.assistant_logs.append(
        AssistantLogRec(
            id=rt.stores.next_id(),
            ts=rt.now(),
            question_id=qid,
            question=question,
            answer=built.answer,
            numbers_verified=verified,
            screen=ctx_in.get("screen"),
        )
    )
    rt.notify_state_changed(graph=False)
    return {
        "questionId": qid,
        "answer": built.answer,
        "numbers": built.numbers,
        "highlight": built.highlight,
        "suggestions": built.suggestions,
        "warnings": built.warnings,
        "numbersVerified": verified,
    }
