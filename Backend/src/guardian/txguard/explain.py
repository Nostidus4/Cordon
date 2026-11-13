"""Plain-language explanation of a check, written ONLY from the state diff.

The template always works. The LLM (optional, `core.llm` adapter) only rephrases: its text is accepted when every
number in it is one of the diff's displayed amounts (same guardrail idea as `agent_rebalance/reason_writer`), has no
address or link and is short; otherwise, and on any provider failure, the template is used.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from guardian.assistant.verifier import NUMBER_RE
from guardian.core.llm import LlmUnavailable, open_session
from guardian.schemas.txguard import StateDiff, TxFinding, TxNumber
from guardian.shared.reason_codes import reason_text

log = logging.getLogger("guardian.txguard")

MAX_EXPLANATION_CHARS = 500
EXPLAIN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"explanation": {"type": "string"}},
    "required": ["explanation"],
    "additionalProperties": False,
}
EXPLAIN_SYSTEM = (
    "Bạn giải thích cho người không rành kỹ thuật một giao dịch SẮP ĐƯỢC KÝ, bằng tiếng Việt, 2 đến 3 câu ngắn. "
    "Chỉ dựa vào khối <diff> bên dưới: không bịa số, không thêm số nào ngoài các số có trong <diff>, "
    "không viết địa chỉ ví hay đường link. Nếu <diff> có cảnh báo thì nói rõ. Trả lời bằng JSON đúng định dạng yêu cầu."
)
_LINK_RE = re.compile(r"0x[0-9a-fA-F]|https?://|www\.")


def _tok(token: str) -> str:
    return "một loại tiền lạ" if token.startswith("0x") else token


def numbers_of(diff: StateDiff) -> list[TxNumber]:
    """Every amount the explanation may quote (an unlimited approval is described in words, not by its 78 digits)."""
    out = [TxNumber(label="Số tiền chuyển ra", value=f.amount.display) for f in diff.outflows]
    out += [TxNumber(label="Số nhận về (ước tính)", value=f.amount.display) for f in diff.inflows]
    out += [
        TxNumber(label="Số được cấp quyền", value=a.amount.display)
        for a in diff.approvals
        if not a.unlimited
    ]
    return out


def allowed_numbers(diff: StateDiff) -> set[str]:
    """The diff's amounts plus digits inside the diff's own label text (an organisation label may carry some)."""
    allowed = {n.value for n in numbers_of(diff)}
    allowed.update(NUMBER_RE.findall(diff.recipient_label or ""))
    return allowed


def numbers_in_diff(text: str, diff: StateDiff) -> bool:
    allowed = allowed_numbers(diff)
    return all(tok in allowed for tok in NUMBER_RE.findall(text))


def template_text(kind: str, diff: StateDiff, findings: list[TxFinding], level: str) -> str:
    who = diff.recipient_label or (
        "một địa chỉ đã duyệt" if diff.recipient_known else "một địa chỉ lạ"
    )
    parts: list[str] = []
    if kind == "pay" and diff.outflows:
        f = diff.outflows[0]
        parts.append(f"Giao dịch này chuyển {f.amount.display} {_tok(f.token)} từ kho tới {who}.")
    elif kind == "swap" and diff.outflows:
        o = diff.outflows[0]
        text = f"Giao dịch này đổi {o.amount.display} {_tok(o.token)}"
        if diff.inflows:
            i = diff.inflows[0]
            text += f" lấy khoảng {i.amount.display} {_tok(i.token)}"
        parts.append(f"{text} qua {who}.")
    elif diff.approvals:
        a = diff.approvals[0]
        amount = "không giới hạn số" if a.unlimited else a.amount.display
        parts.append(f"Giao dịch này cho {who} quyền tiêu {amount} {_tok(a.token)} của kho.")
    else:
        parts.append(f"Giao dịch này gọi thẳng tới {who}, chưa đọc được nó sẽ làm gì với tiền.")
    if diff.chain_reason is not None:
        parts.append(f"Hợp đồng sẽ từ chối giao dịch này: {reason_text(diff.chain_reason, 'vi')}.")
    if findings:
        parts.append("Cảnh báo: " + "; ".join(f.title_vi.lower() for f in findings) + ".")
    parts.append(
        {
            "danger": "Nên từ chối giao dịch này.",
            "caution": "Nên xem kỹ trước khi gửi.",
            "safe": "Chưa thấy dấu hiệu bất thường, nhưng vẫn nên kiểm tra lại người nhận.",
        }[level]
    )
    return " ".join(parts)


def _diff_block(kind: str, diff: StateDiff, findings: list[TxFinding]) -> str:
    return (
        "<diff>\n"
        + json.dumps(
            {
                "kind": kind,
                "outflows": [{"token": f.token, "amount": f.amount.display} for f in diff.outflows],
                "inflows": [{"token": f.token, "amount": f.amount.display} for f in diff.inflows],
                "approvals": [
                    {
                        "token": a.token,
                        "amount": "không giới hạn" if a.unlimited else a.amount.display,
                    }
                    for a in diff.approvals
                ],
                "recipient": diff.recipient_label
                or ("đã duyệt" if diff.recipient_known else "địa chỉ lạ"),
                "chainWouldReject": reason_text(diff.chain_reason, "vi")
                if diff.chain_reason
                else None,
                "warnings": [f.title_vi for f in findings],
            },
            ensure_ascii=False,
        )
        + "\n</diff>"
    )


def llm_acceptable(text: str, diff: StateDiff) -> bool:
    t = text.strip()
    if not t or len(t) > MAX_EXPLANATION_CHARS or _LINK_RE.search(t):
        return False
    return numbers_in_diff(t, diff)


def _llm_text(rt: Any, kind: str, diff: StateDiff, findings: list[TxFinding]) -> str:
    turn = open_session(rt, rt.settings.llm_reason_timeout_seconds).complete(
        system=EXPLAIN_SYSTEM,
        messages=[{"role": "user", "content": _diff_block(kind, diff, findings)}],
        schema=EXPLAIN_SCHEMA,
        effort="low",
        max_tokens=1024,
    )
    try:
        text = json.loads(turn.text)["explanation"]
    except (ValueError, KeyError, TypeError) as e:
        raise LlmUnavailable("invalid structured output") from e
    if not isinstance(text, str):
        raise LlmUnavailable("invalid structured output")
    return text.strip()


def explain(
    rt: Any, kind: str, diff: StateDiff, findings: list[TxFinding], level: str
) -> tuple[str, str]:
    """(text, source in {"llm", "template"}). Any failure or a number outside the diff -> template."""
    if rt is not None:
        try:
            text = _llm_text(rt, kind, diff, findings)
            if llm_acceptable(text, diff):
                return text, "llm"
            log.warning("tx explanation rejected by the number guardrail; using the template")
        except LlmUnavailable as e:
            log.info("tx explanation -> template (%s)", e)
        except Exception:
            log.warning("tx explanation failed unexpectedly", exc_info=True)
    return template_text(kind, diff, findings, level), "template"
