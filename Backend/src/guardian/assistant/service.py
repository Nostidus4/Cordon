"""POST /api/assistant/ask: fixed question -> tools -> template -> verifier -> log."""

from __future__ import annotations

from typing import Any

from guardian.assistant import fixed_questions as fq
from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import verify
from guardian.core.errors import ApiError
from guardian.services.runtime import AssistantLogRec, Runtime


def ask(rt: Runtime, question: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    qid = fq.resolve_question_id(question)
    ctx_in = context or {}
    verified = False
    built = fq.Built(fq.FALLBACK_ANSWER)
    try:
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
