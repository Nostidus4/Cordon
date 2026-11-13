"""Copilot message handling: message -> intent -> read answer | refusal | PENDING draft. Nothing here sends.

Sending lives only in `executor.py` (the confirm endpoint). This module never imports it, never calls a ChainPort
write, and a draft it stores is `pending` until a person confirms or rejects it.
"""

from __future__ import annotations

import logging
from typing import Any

from guardian.assistant.copilot import intent as it
from guardian.assistant.copilot import reads
from guardian.assistant.copilot.checkpoint import Checkpoint, default_checkpoint
from guardian.assistant.copilot.models import CopilotDraftRec, draft_out
from guardian.assistant.copilot.tools import CopilotError, CopilotTools, Prepared
from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import verify
from guardian.core.errors import ApiError
from guardian.core.llm import llm_enabled
from guardian.services.runtime import AssistantLogRec, Runtime

log = logging.getLogger("guardian.copilot")

MAX_MESSAGE_CHARS = 600
FORECAST_REPLY = (
    "Mình không dự đoán giá hay khuyên mua bán. Mình chỉ đọc số liệu thật của kho "
    "và soạn lệnh chi khi bạn yêu cầu rõ ràng."
)
INJECTION_REPLY = (
    "Mình không bỏ qua luật hay chuyển tiền theo lệnh như vậy. Hạn mức và danh sách người nhận "
    "là do hợp đồng trên chain giữ, mình chỉ soạn lệnh bình thường để bạn xác nhận."
)
UNKNOWN_REPLY = (
    "Mình chưa hiểu yêu cầu này. Bạn thử hỏi số liệu (ví dụ: “Khu anh Minh còn chi được bao nhiêu?”) "
    "hoặc ra lệnh rõ ràng (ví dụ: “Chuyển 5.000 USDC cho nhà cung cấp cloud”)."
)


def _checkpoint(rt: Runtime, override: Checkpoint | None) -> Checkpoint:
    return override or getattr(rt, "copilot_checkpoint", None) or default_checkpoint()


def create_draft(
    rt: Runtime, spec: Prepared, message: str, checkpoint: Checkpoint | None = None
) -> CopilotDraftRec:
    """Store a `pending` draft and run it through the checkpoint (B05 when present). Does not send."""
    res = None
    try:
        res = _checkpoint(rt, checkpoint).check(rt, dict(spec.prepared))
    except Exception:
        log.warning("copilot checkpoint failed", exc_info=True)
    rec = CopilotDraftRec(
        id=rt.stores.next_id(),
        created_at=rt.now(),
        intent=spec.kind,
        message=message,
        prepared=spec.prepared,
        internal=spec.internal,
        details=spec.details,
        summary_vi=spec.summary_vi,
        tx_check_id=res.id if res else None,
        tx_check_level=res.level if res else None,
    )
    rt.stores.copilot_drafts[rec.id] = rec
    return rec


def _reply(
    intent: str,
    text: str,
    numbers: list[dict[str, Any]] | None = None,
    verified: bool = True,
    draft: dict[str, Any] | None = None,
    highlight: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    return {
        "intent": intent,
        "replyVi": text,
        "numbers": numbers or [],
        "numbersVerified": verified,
        "draft": draft,
        "highlight": highlight or {"nodeIds": [], "edgeIds": []},
    }


def _draft_reply(rec: CopilotDraftRec, spec: Prepared) -> dict[str, Any]:
    out = draft_out(rec)
    text = (
        f"Mình đã soạn lệnh, CHƯA gửi gì cả. {spec.summary_vi} Bấm “Xác nhận gửi” nếu đúng ý bạn."
    )
    if rec.tx_check_level == "danger":
        text += " Trạm soi báo mức nguy hiểm, bạn cần xác nhận rủi ro thêm một lần."
    data = {"draft": out}
    numbers = []
    for label, value in spec.numbers:
        path = (
            "draft.details.amount.display"
            if label != "Tối thiểu nhận"
            else "draft.details.minOut.display"
        )
        numbers.append({"label": label, "value": value, "source": "draft", "path": path})
    ok = verify(text, numbers, data)
    return _reply(spec.kind, text, numbers if ok else [], ok, out)


def handle(
    rt: Runtime,
    message: str,
    checkpoint: Checkpoint | None = None,
    *,
    use_llm: bool = True,
) -> dict[str, Any]:
    msg = message.strip()
    if not msg or len(msg) > MAX_MESSAGE_CHARS:
        raise ApiError(422, "VALIDATION_ERROR", "Tin nhắn phải từ 1 đến 600 ký tự.")
    parsed = it.parse(msg)
    kind = parsed.kind
    if kind == "injection_refused":
        out = _reply(kind, INJECTION_REPLY)
    elif kind == "forecast_refused":
        out = _reply(kind, FORECAST_REPLY)
    elif kind in ("pay", "swap"):
        out = _prepare(rt, parsed, msg, checkpoint)
    else:
        out = _read_or_unknown(rt, parsed, msg, checkpoint, use_llm)
    _record(rt, msg, out)
    return out


def _prepare(
    rt: Runtime, parsed: it.Intent, msg: str, checkpoint: Checkpoint | None
) -> dict[str, Any]:
    tools = CopilotTools(rt)
    p = parsed.params
    try:
        if parsed.kind == "pay":
            spec = tools.prepare_pay(p["key"], p["to"], p["amount"], p["token"], p.get("memo", ""))
        else:
            spec = tools.prepare_swap(
                p["key"], p["protocol"], p["amountIn"], p["tokenIn"], p["tokenOut"], p["minOut"]
            )
    except CopilotError as e:
        return _reply("unknown", str(e))
    return _draft_reply(create_draft(rt, spec, msg, checkpoint), spec)


def _read_or_unknown(
    rt: Runtime, parsed: it.Intent, msg: str, checkpoint: Checkpoint | None, use_llm: bool
) -> dict[str, Any]:
    if parsed.kind == "read":
        ans = reads.answer(AssistantTools(rt), msg, it.normalize(msg))
        if ans is not None:
            return _reply("read", ans.text, ans.numbers, ans.verified, highlight=ans.highlight)
    if use_llm and llm_enabled(rt.settings):
        from guardian.assistant.copilot import llm_path  # lazy: only when an LLM is configured

        out = llm_path.run(rt, msg, checkpoint)
        if out is not None:
            return out
    return _reply("unknown", parsed.missing_vi or UNKNOWN_REPLY)


def _record(rt: Runtime, msg: str, out: dict[str, Any]) -> None:
    rt.stores.assistant_logs.add(
        AssistantLogRec(
            id=rt.stores.next_id(),
            ts=rt.now(),
            question_id=f"copilot.{out['intent']}",
            question=msg,
            answer=out["replyVi"],
            numbers_verified=bool(out["numbersVerified"]),
            screen="assistant",
        )
    )
    rt.notify_state_changed(graph=False)


# ----------------------------------------------------------------------------- drafts
def list_drafts(rt: Runtime) -> list[dict[str, Any]]:
    """Newest first."""
    return [draft_out(d) for d in sorted(rt.stores.copilot_drafts.values(), key=lambda d: -d.id)]


def get_draft(rt: Runtime, draft_id: int) -> CopilotDraftRec:
    d = rt.stores.copilot_drafts.get(draft_id)
    if d is None:
        raise ApiError(404, "DRAFT_NOT_FOUND", "Không có lệnh nháp này.")
    return d  # type: ignore[no-any-return]


def reject(rt: Runtime, draft_id: int) -> dict[str, Any]:
    """Only `pending` can be rejected. Never touches the chain."""
    d = get_draft(rt, draft_id)
    if d.status != "pending":
        raise ApiError(409, "DRAFT_NOT_PENDING", _not_pending_vi(d.status))
    d.status = "rejected"
    rt.notify_state_changed(graph=False)
    return draft_out(d)


def _not_pending_vi(status: str) -> str:
    return {
        "rejected": "Lệnh nháp này đã bị huỷ, không gửi được nữa.",
        "confirmed": "Lệnh nháp này đang được gửi.",
        "sent": "Lệnh nháp này đã được gửi rồi.",
        "blocked": "Lệnh nháp này đã được gửi và bị chặn rồi.",
    }.get(status, "Lệnh nháp này không còn chờ xác nhận.")
