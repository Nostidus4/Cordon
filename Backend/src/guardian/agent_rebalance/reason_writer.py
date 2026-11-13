"""LLM writes one VI sentence only; template fallback; reasonHash (spec §7.1, issue AGT-001).

The decision (amount/token/DEX) is computed by the rule engine BEFORE this module runs and `Decision` is frozen:
the LLM only phrases it. Its sentence is accepted only if it carries the decision's displayed amount and no other
number or token; otherwise (and on any provider failure) the template is used.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from eth_utils import keccak

from guardian.agent_rebalance.rule_engine import Decision
from guardian.assistant.prompt import REASON_SYSTEM, untrusted_block
from guardian.assistant.verifier import NUMBER_RE
from guardian.core.llm import LlmUnavailable, open_session
from guardian.shared.money import fmt_display

log = logging.getLogger("guardian.agent")

REASON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"reason": {"type": "string"}},
    "required": ["reason"],
    "additionalProperties": False,
}
MAX_REASON_CHARS = 300
_TOKEN_RE = re.compile(r"\bt[A-Z]{2,}\b")  # tUSDC, tTKB, tDOGE...
_SAFE_TOKENS = {"tUSDC", "tTKB"}


def _pct(bps: int) -> str:
    return f"{bps // 100},{bps % 100:02d}".rstrip("0").rstrip(",")


def template_reason(d: Decision) -> str:
    return (
        f"Tỉ trọng tTKB đang là {_pct(d.ttkb_weight_bps)}% thấp hơn mục tiêu "
        f"{_pct(d.target_bps)}%, nên đổi {fmt_display(d.amount_in)} tUSDC sang tTKB."
    )


def reason_hash(text: str) -> str:
    return "0x" + keccak(text=text).hex()


def _allowed_numbers(d: Decision) -> set[str]:
    return {
        fmt_display(d.amount_in),
        fmt_display(d.gap),
        fmt_display(d.total_value),
        _pct(d.ttkb_weight_bps),
        _pct(d.target_bps),
    }


def reason_acceptable(text: str, d: Decision) -> bool:
    """Guardrail: the sentence states the decision's amount, no other amount/number, no foreign token, no address/link."""
    if not text.strip() or len(text) > MAX_REASON_CHARS or "\n" in text.strip():
        return False
    numbers = NUMBER_RE.findall(text)
    if fmt_display(d.amount_in) not in numbers or any(
        n not in _allowed_numbers(d) for n in numbers
    ):
        return False
    if any(t not in _SAFE_TOKENS for t in _TOKEN_RE.findall(text)):
        return False
    return not re.search(r"0x[0-9a-fA-F]|https?://|www\.", text)


def decision_block(d: Decision) -> str:
    return (
        "<decision>\n"
        + json.dumps(
            {
                "tokenIn": d.token_in,
                "tokenOut": d.token_out,
                "amountIn": fmt_display(d.amount_in),
                "gap": fmt_display(d.gap),
                "ttkbWeightPercent": _pct(d.ttkb_weight_bps),
                "targetPercent": _pct(d.target_bps),
                "totalValue": fmt_display(d.total_value),
            },
            ensure_ascii=False,
        )
        + "\n</decision>"
    )


def _llm_reason(rt: Any, d: Decision, untrusted_input: str | None) -> str:
    prompt = decision_block(d)
    if untrusted_input:  # F06: foreign text reaches the prompt, but only as data
        prompt += "\n" + untrusted_block("agent_input", untrusted_input)
    turn = open_session(rt, rt.settings.llm_reason_timeout_seconds).complete(
        system=REASON_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        schema=REASON_SCHEMA,
        effort="low",
        max_tokens=1024,
    )
    try:
        reason = json.loads(turn.text)["reason"]
    except (ValueError, KeyError, TypeError) as e:
        raise LlmUnavailable("invalid structured output") from e
    if not isinstance(reason, str):
        raise LlmUnavailable("invalid structured output")
    return reason.strip()


def write_reason(
    d: Decision, rt: Any = None, untrusted_input: str | None = None
) -> tuple[str, str]:
    """Returns (sentence, reason_source in {"llm", "template"}). Never changes `d`; any failure -> template."""
    if rt is not None:
        try:
            text = _llm_reason(rt, d, untrusted_input)
            if reason_acceptable(text, d):
                return text, "llm"
            log.warning("agent reason rejected by guardrail; using the template")
        except LlmUnavailable as e:
            log.info("agent reason -> template (%s)", e)
        except Exception:
            log.warning("agent reason failed unexpectedly", exc_info=True)
    return template_reason(d), "template"
