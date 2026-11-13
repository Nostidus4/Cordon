"""Free-text assistant (issue AI-002): LLM + read-only tools, every number verified, else the safe fallback.

Only the five read-only tools below are exposed; there is no write tool and this module never touches `ChainPort`.
The LLM's `numbers[]` are re-read from the real tool results by `verifier.verify`; a failure returns None and the
caller answers with the fixed fallback (`numbersVerified=false`).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

from guardian.assistant import fixed_questions as fq
from guardian.assistant.prompt import ASSISTANT_SYSTEM, untrusted_block
from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import verify
from guardian.core.errors import ApiError
from guardian.core.llm import LlmSession, LlmUnavailable

log = logging.getLogger("guardian.assistant")

_NONE: dict[str, Any] = {"type": "object", "properties": {}, "additionalProperties": False}


def _tool(name: str, desc: str, props: dict[str, Any] | None = None) -> dict[str, Any]:
    schema = (
        _NONE
        if not props
        else {
            "type": "object",
            "properties": props,
            "required": list(props),
            "additionalProperties": False,
        }
    )
    return {"name": name, "description": desc, "strict": True, "input_schema": schema}


TOOL_DECLS: list[dict[str, Any]] = [
    _tool("get_graph", "Snapshot: policy version and every district with balances and caps."),
    _tool(
        "simulate_compromise",
        "What an attacker can spend per day if these districts' keys are compromised.",
        {"principals": {"type": "array", "items": {"type": "string"}}},
    ),
    _tool(
        "get_district",
        "One district: label, keys, daily cap, spent today.",
        {"principal_id": {"type": "string"}},
    ),
    _tool("get_proposal", "One Council proposal.", {"proposal_id": {"type": "integer"}}),
    _tool("list_findings", "Risk findings (rules R1..R4) with the numbers behind them."),
]

ANSWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "numbers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "value": {"type": "string"},
                    "source": {
                        "type": "string",
                        "enum": ["simulate", "district", "proposal", "graph"],
                    },
                    "path": {"type": "string"},
                },
                "required": ["label", "value", "source", "path"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["answer", "numbers"],
    "additionalProperties": False,
}


def _dispatch(tools: AssistantTools, data: dict[str, Any]) -> dict[str, Callable[..., Any]]:
    """name -> runner that stores the result under its source and returns it."""

    def graph() -> Any:
        res = tools.get_graph()
        data["graph"] = {**data.get("graph", {}), **res}
        return res

    def findings() -> Any:
        res = tools.list_findings()
        data["graph"] = {**data.get("graph", {}), "findings": res}
        return res

    def simulate(principals: list[str]) -> Any:
        data["simulate"] = res = tools.simulate_compromise([str(p) for p in principals])
        return res

    def district(principal_id: str) -> Any:
        data["district"] = res = tools.get_district(str(principal_id))
        return res

    def proposal(proposal_id: int) -> Any:
        data["proposal"] = res = tools.get_proposal(int(proposal_id))
        return res

    return {
        "get_graph": graph,
        "list_findings": findings,
        "simulate_compromise": simulate,
        "get_district": district,
        "get_proposal": proposal,
    }


def answer_with_llm(
    session: LlmSession,
    tools: AssistantTools,
    question: str,
    context: dict[str, Any] | None = None,
) -> tuple[fq.Built, bool]:
    """Returns (built, verified). Raises `LlmUnavailable` on any provider failure or an unverifiable result."""
    data: dict[str, Any] = {}
    run = _dispatch(tools, data)
    ctx_note = ""
    if context and context.get("principalIds"):
        ctx_note = "\n" + untrusted_block("screen_context", json.dumps(context["principalIds"]))
    messages: list[dict[str, Any]] = [
        {"role": "user", "content": untrusted_block("question", question) + ctx_note}
    ]
    calls = 0
    while True:
        turn = session.complete(
            system=ASSISTANT_SYSTEM,
            messages=messages,
            tools=TOOL_DECLS,
            schema=ANSWER_SCHEMA,
            effort="low",
            max_tokens=2048,
        )
        if not turn.tool_calls:
            break
        calls += len(turn.tool_calls)
        if calls > session.max_tool_calls:
            raise LlmUnavailable("too many tool calls")
        results: list[dict[str, Any]] = []
        for tc in turn.tool_calls:
            fn = run.get(tc.name)
            if fn is None:  # not one of the five read-only tools: rejected, never executed
                log.warning("assistant: rejected unknown tool %r", tc.name[:60])
                results.append(_result(tc.id, "Công cụ không tồn tại hoặc không được phép.", True))
                continue
            try:
                out = fn(**tc.input)
            except (ApiError, TypeError, ValueError, KeyError) as e:
                results.append(_result(tc.id, f"Lỗi: {type(e).__name__}", True))
                continue
            payload = json.dumps(out, ensure_ascii=False, default=str)
            results.append(_result(tc.id, untrusted_block(tc.name, payload), False))
        messages.append({"role": "assistant", "content": turn.assistant_content})
        messages.append({"role": "user", "content": results})
    return _finish(turn.text, data)


def _result(tool_use_id: str, content: str, is_error: bool) -> dict[str, Any]:
    r: dict[str, Any] = {"type": "tool_result", "tool_use_id": tool_use_id, "content": content}
    if is_error:
        r["is_error"] = True
    return r


def _finish(text: str, data: dict[str, Any]) -> tuple[fq.Built, bool]:
    try:
        raw = json.loads(text)
        answer, numbers = raw["answer"], raw["numbers"]
        if not isinstance(answer, str) or not isinstance(numbers, list):
            raise TypeError
        numbers = [{k: str(n[k]) for k in ("label", "value", "source", "path")} for n in numbers]
    except (ValueError, KeyError, TypeError) as e:
        raise LlmUnavailable("invalid structured output") from e
    if len(answer.split()) > fq.MAX_WORDS or not answer.strip():
        return fq.Built(fq.FALLBACK_ANSWER), False
    if not all(n["source"] in ("simulate", "district", "proposal", "graph") for n in numbers):
        return fq.Built(fq.FALLBACK_ANSWER), False
    if not verify(answer, numbers, data):
        return fq.Built(fq.FALLBACK_ANSWER), False
    highlight = data.get("simulate", {}).get("highlights") or {"nodeIds": [], "edgeIds": []}
    return fq.Built(answer, numbers=numbers, highlight=highlight), True
