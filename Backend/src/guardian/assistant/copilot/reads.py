"""Copilot read answers: the four fixed questions plus a few district/finding lookups, all built from the existing
read-only `AssistantTools` and passed through `verifier.verify` (every number in the text is in `numbers[]` and
re-read from its tool result). Deterministic: no LLM. A topic it does not know -> None (intent `unknown`)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from guardian.assistant import fixed_questions as fq
from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import norm, resolve, verify
from guardian.core.errors import ApiError

DISTRICTS = {
    "minh": "minh",
    "huy": "huy",
    "lan": "lan",
    "du lieu": "agent_data",
    "thanh toan quoc te": "agent_intl_pay",
    "can doi": "agent_rebalance",
    "phan mem thanh toan": "svc_payment",
}


@dataclass
class ReadAnswer:
    text: str
    numbers: list[dict[str, Any]] = field(default_factory=list)
    verified: bool = False
    highlight: dict[str, list[str]] = field(default_factory=lambda: {"nodeIds": [], "edgeIds": []})
    question_id: str = "copilot.read"


class _Ctx:
    def __init__(self) -> None:
        self.data: dict[str, Any] = {}
        self.numbers: list[dict[str, Any]] = []

    def num(self, label: str, path: str) -> str:
        value = norm(resolve(self.data, path))
        if not any(n["path"] == path for n in self.numbers):
            self.numbers.append(
                {"label": label, "value": value, "source": path.split(".")[0], "path": path}
            )
        return value


def _district_of(t: str) -> str:
    for key, pid in DISTRICTS.items():
        if re.search(r"\b" + key + r"\b", t):
            return pid
    return "minh"


def _fixed_question(t: str) -> str | None:
    if re.search(
        r"huy cung bi chiem|huy.*(also|too).*compromis|compromis.*(minh and huy|minh va huy)", t
    ):
        return "simulate.huy_too"
    if re.search(r"vi sao.*co vang|why.*(yellow|flag)", t):
        return "simulate.why_flag"
    if re.search(r"\bsua the nao\b|how (do i|to|can i) fix|lam sao sua", t):
        return "simulate.how_fix"
    if re.search(r"can doi.*huy|huy.*can doi|rebalance.*huy", t):
        return "request12.huy_agent"
    return None


def _build(t: str, tools: AssistantTools, raw: str) -> tuple[fq.Built, dict[str, Any]] | None:
    qid: str | None
    try:
        qid = fq.resolve_question_id(raw)
    except ApiError:
        qid = _fixed_question(t)
    if qid is not None:
        built, data = fq.build(qid, tools, None)
        built.suggestions = []  # the Copilot never turns a read answer into a proposal
        return built, data
    c = _Ctx()
    topic = _topic(t, tools, c)
    if topic is None:
        return None
    topic.numbers = c.numbers
    return topic, c.data


def _topic(t: str, tools: AssistantTools, c: _Ctx) -> fq.Built | None:
    pid = _district_of(t)
    if re.search(
        r"\bbao nhieu (co|rui ro|finding)|how many (risk|flags?|findings)|\bso (co|rui ro)\b", t
    ):
        c.data["graph"] = {"findings": tools.list_findings()}
        n = c.num("Số cờ rủi ro", "graph.findings.length")
        return fq.Built(f"Hiện có {n} cờ rủi ro đang mở.")
    if re.search(r"bao nhieu khu|how many districts", t):
        c.data["graph"] = tools.get_graph()
        n = c.num("Số khu", "graph.districts.length")
        return fq.Built(f"Thành phố có {n} khu.")
    if re.search(r"phien ban (chinh sach|luat)|policy version", t):
        c.data["graph"] = tools.get_graph()
        v = c.num("Phiên bản luật", "graph.policyVersion")
        return fq.Built(f"Bộ luật đang chạy là phiên bản {v}.")
    if re.search(r"bi chiem|compromis|bi lo khoa|key leak", t):
        c.data["simulate"] = sim = tools.simulate_compromise([pid])
        c.data["district"] = tools.get_district(pid)
        est = c.num("Ước tính", "simulate.totals.estimated.display")
        who = fq.spoken(c.data["district"]["label"])
        return fq.Built(
            f"Nếu khu {who} bị chiếm, kẻ gian có thể chi tới {est} USDC/ngày.",
            highlight=sim["highlights"],
        )
    if re.search(r"bi khoa|khoa chua|\blocked\b|is .* locked", t):
        c.data["district"] = d = tools.get_district(pid)
        who = fq.spoken(d["label"])
        state = "đang bị khoá" if d["locked"] else "không bị khoá"
        return fq.Built(f"Khu {who} hiện {state}.")
    if re.search(r"han muc (chung|khu)|cong chung|district (cap|limit)", t):
        c.data["district"] = d = tools.get_district(pid)
        who = fq.spoken(d["label"])
        if d["dailyCap"] is None:
            return fq.Built(f"Khu {who} chưa có hạn mức chung.")
        cap = c.num("Hạn mức chung", "district.dailyCap.display")
        return fq.Built(f"Hạn mức chung của khu {who} là {cap} USDC/ngày.")
    if re.search(r"han muc (the|khoa|rieng)|(card|key) (cap|limit)", t):
        c.data["district"] = d = tools.get_district(pid)
        who = fq.spoken(d["label"])
        cap = c.num("Hạn mức thẻ", "district.keys.0.dailyCap.display")
        return fq.Built(f"Thẻ của khu {who} chi tối đa {cap} USDC/ngày.")
    if re.search(r"da (chi|tieu)|spent|chi hom nay", t):
        c.data["district"] = d = tools.get_district(pid)
        who = fq.spoken(d["label"])
        s = c.num("Đã chi hôm nay", "district.spentToday.display")
        return fq.Built(f"Khu {who} hôm nay đã chi {s} USDC.")
    if re.search(r"con (chi|tieu) duoc|con lai|remaining|\bleft\b|(can|still) .{0,20}spend", t):
        c.data["district"] = d = tools.get_district(pid)
        who = fq.spoken(d["label"])
        r = c.num("Còn chi được", "district.remaining.display")
        return fq.Built(f"Khu {who} hôm nay còn chi được {r} USDC.")
    m = re.search(r"(?:de xuat|proposal|request)\s*#?\s*(\d+)", t)
    if m:
        c.data["proposal"] = p = tools.get_proposal(int(m.group(1)))
        pid_s = c.num("Mã đề xuất", "proposal.id")
        got = c.num("Số phiếu", "proposal.approvalCount")
        need = c.num("Phiếu cần", "proposal.threshold")
        return fq.Built(f"Đề xuất {pid_s} đang có {got}/{need} phiếu, trạng thái {p['status']}.")
    return None


def answer(rt_tools: AssistantTools, raw: str, t: str) -> ReadAnswer | None:
    """None when the topic is unknown. A tool failure or an unverifiable number gives the fixed fallback
    (`verified=False`): the Copilot never states a number it could not re-read."""
    try:
        built_data = _build(t, rt_tools, raw)
    except ApiError:
        return ReadAnswer(fq.FALLBACK_ANSWER, [], False)
    except Exception:  # noqa: BLE001 - any tool failure -> safe fallback
        return ReadAnswer(fq.FALLBACK_ANSWER, [], False)
    if built_data is None:
        return None
    built, data = built_data
    ok = len(built.answer.split()) <= fq.MAX_WORDS and verify(built.answer, built.numbers, data)
    if not ok:
        return ReadAnswer(fq.FALLBACK_ANSWER, [], False)
    return ReadAnswer(built.answer, built.numbers, True, built.highlight)
