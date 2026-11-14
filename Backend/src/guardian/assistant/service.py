"""POST /api/assistant/ask: fixed question -> tools -> template -> verifier -> log."""

from __future__ import annotations

import logging
from typing import Any

from guardian.assistant import fixed_questions as fq
from guardian.assistant.freetext import answer_with_llm
from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import verify
from guardian.core.errors import ApiError
from guardian.core.llm import LlmUnavailable, llm_enabled, open_session
from guardian.services.runtime import AssistantLogRec, Runtime

FREE_TEXT_ID = "free_text"
log = logging.getLogger("guardian.assistant")


def ask(
    rt: Runtime,
    question: str,
    context: dict[str, Any] | None = None,
    *,
    allow_free_text: bool = False,
) -> dict[str, Any]:
    """A question outside the fixed P0 set is free text. With the LLM enabled it goes through the read-only tool loop and
    every number is verified (AI-002); otherwise it is a 422 on the public route, and for `allow_free_text` (CITY_OPS F02)
    a refusal: the assistant states no number it cannot verify, the log row is `numbers_verified=false`."""
    llm_on = llm_enabled(rt.settings)
    try:
        qid = fq.resolve_question_id(question)
    except ApiError:
        if not (allow_free_text or llm_on):
            raise
        qid = FREE_TEXT_ID
    ctx_in = context or {}
    verified = False
    built = fq.Built(fq.FALLBACK_ANSWER)
    try:
        if qid == FREE_TEXT_ID:
            built, verified = _free_text(rt, question, ctx_in)
        else:
            candidate, data = fq.build(qid, AssistantTools(rt), ctx_in.get("principalIds"))
            if len(candidate.answer.split()) <= fq.MAX_WORDS and verify(
                candidate.answer, candidate.numbers, data
            ):
                built, verified = candidate, True
    except ApiError:
        raise
    except Exception:  # noqa: BLE001 - any tool failure -> safe fallback, never a wrong number
        verified = False
    return _record(rt, qid, question, built, verified, ctx_in)


def _free_text(rt: Runtime, question: str, ctx: dict[str, Any]) -> tuple[fq.Built, bool]:
    """LLM path; any failure or unverifiable number -> the fixed fallback, `numbers_verified=false`."""
    try:
        return answer_with_llm(open_session(rt), AssistantTools(rt), question, ctx)
    except LlmUnavailable as e:
        log.info("assistant free text -> fallback (%s)", e)
    except ApiError:
        raise
    except Exception:
        log.warning("assistant free text failed unexpectedly", exc_info=True)
    return fq.Built(fq.FALLBACK_ANSWER), False


def _record(
    rt: Runtime,
    qid: str,
    question: str,
    built: fq.Built,
    verified: bool,
    ctx_in: dict[str, Any],
) -> dict[str, Any]:
    log.info("assistant answer question_id=%s numbers_verified=%s", qid, verified)
    rt.stores.assistant_logs.add(
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
