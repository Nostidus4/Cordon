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
from guardian.assistant.verifier import NUMBER_RE, norm, verify
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
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
    "additionalProperties": False,
}
SOURCES = ("simulate", "district", "proposal", "graph")


def flatten(node: Any, path: str = "") -> list[tuple[str, str]]:
    """(normalized value, dotted path) for every number a tool result really holds. `{raw, display}` money is one
    value (its display); list lengths get a `.length` entry. Strings are never numbers: labels/memos are untrusted."""
    out: list[tuple[str, str]] = []
    if isinstance(node, dict):
        if "display" in node and "raw" in node:
            return [(norm(node), f"{path}.display")]
        for k, v in node.items():
            out += flatten(v, f"{path}.{k}" if path else str(k))
    elif isinstance(node, list):
        out.append((str(len(node)), f"{path}.length"))
        for i, v in enumerate(node):
            out += flatten(v, f"{path}.{i}")
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        out.append((norm(node), path))
    return out


def _compact(node: Any) -> Any:
    """Prompt-sized view of a tool result: no raw base units, highlights or addresses."""
    if isinstance(node, dict):
        return {k: _compact(v) for k, v in node.items() if k not in ("raw", "highlights")}
    if isinstance(node, list):
        return [_compact(v) for v in node if not (isinstance(v, str) and v.startswith("0x"))]
    return node


def build_numbers(answer: str, data: dict[str, Any]) -> list[dict[str, str]] | None:
    """Every number token of the answer must equal a value some tool of THIS request returned; `numbers[]` is built
    here from those matches (never taken from the model). None if any token has no match."""
    index: dict[str, str] = {}
    for source in SOURCES:
        if source in data:
            for value, path in flatten(data[source], source):
                index.setdefault(value, path)
    numbers: list[dict[str, str]] = []
    for tok in dict.fromkeys(NUMBER_RE.findall(answer)):
        path = index.get(tok)
        if path is None:
            return None
        numbers.append(
            {
                "label": path.split(".")[-2 if path.endswith(".display") else -1],
                "value": tok,
                "source": path.split(".")[0],
                "path": path,
            }
        )
    return numbers


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


def _seed(run: dict[str, Callable[..., Any]], data: dict[str, Any]) -> dict[str, Any]:
    """The snapshot the fixed questions rely on, read through the same tools so its numbers are verifiable too:
    districts, findings and the two-district compromise estimate. Most questions then need no tool round."""
    snap: dict[str, Any] = {}
    for name, args in (
        ("get_graph", {}),
        ("list_findings", {}),
        ("simulate_compromise", {"principals": ["minh", "huy"]}),
    ):
        try:
            snap[name] = _compact(run[name](**args))
        except (ApiError, KeyError, ValueError):
            continue
    return snap


def answer_with_llm(
    session: LlmSession,
    tools: AssistantTools,
    question: str,
    context: dict[str, Any] | None = None,
) -> tuple[fq.Built, bool]:
    """Returns (built, True). Raises `LlmUnavailable` (message says why) on any provider failure or an answer whose
    numbers are not all in this request's tool results."""
    data: dict[str, Any] = {}
    run = _dispatch(tools, data)
    snapshot = untrusted_block("snapshot", json.dumps(_seed(run, data), ensure_ascii=False))
    ctx_note = ""
    if context and context.get("principalIds"):
        ctx_note = "\n" + untrusted_block("screen_context", json.dumps(context["principalIds"]))
    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": snapshot + "\n" + untrusted_block("question", question) + ctx_note,
        }
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
        answer = json.loads(text)["answer"]
        if not isinstance(answer, str):
            raise TypeError
    except (ValueError, KeyError, TypeError) as e:
        raise LlmUnavailable("invalid structured output") from e
    if not answer.strip() or len(answer.split()) > fq.MAX_WORDS:
        raise LlmUnavailable("length: empty or over 80 words")
    numbers = build_numbers(answer, data)
    if numbers is None or not verify(answer, numbers, data):
        known = {v for src in SOURCES if src in data for v, _ in flatten(data[src], src)}
        missing = [t for t in dict.fromkeys(NUMBER_RE.findall(answer)) if t not in known]
        raise LlmUnavailable(f"verify: number(s) in no tool result: {missing[:5]}")
    highlight = data.get("simulate", {}).get("highlights") or {"nodeIds": [], "edgeIds": []}
    return fq.Built(answer, numbers=numbers, highlight=highlight), True
