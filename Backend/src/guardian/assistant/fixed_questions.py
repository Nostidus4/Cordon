"""P0 fixed questions (spec §9.5): templates filled with numbers read from the tools.

Labels from the chain/seed (principal labels, key labels, declared-edge notes) are untrusted: they
are stripped of digits before being spoken and never feed a number. Every number in an answer is
registered in `numbers[]` with the tool `path` it was read from.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from guardian.assistant.tools import AssistantTools
from guardian.assistant.verifier import norm, resolve
from guardian.core.errors import ApiError

HUY_KEY_SEED = "key_agent_rebalance"

QUESTIONS: dict[str, dict[str, str]] = {
    "simulate.huy_too": {"screen": "simulate", "text": "Nếu anh Huy cũng bị chiếm thì sao?"},
    "simulate.why_flag": {"screen": "simulate", "text": "Vì sao khu anh Minh có cờ vàng?"},
    "simulate.how_fix": {"screen": "simulate", "text": "Sửa thế nào?"},
    "request12.huy_agent": {
        "screen": "requests",
        "text": "Có nên giao trợ lý Cân đối cho anh Huy?",
    },
}
FALLBACK_ANSWER = (
    "Mình chưa kiểm chứng được số liệu cho câu hỏi này nên chưa trả lời. "
    "Bạn xem các con số trực tiếp trên màn hình nhé."
)
MAX_WORDS = 80


def resolve_question_id(question: str) -> str:
    q = question.strip()
    if q in QUESTIONS:
        return q
    for qid, meta in QUESTIONS.items():
        if meta["text"].strip().lower() == q.lower():
            return qid
    raise ApiError(422, "UNKNOWN_QUESTION", "Câu hỏi này chưa được hỗ trợ (P0 chỉ có câu cố định).")


def spoken(label: str) -> str:
    """Untrusted label -> safe words: digits removed, short, 'Anh Minh' -> 'anh Minh'."""
    s = re.sub(r"\d+", "", label).strip()[:40] or "khu này"
    return s[0].lower() + s[1:] if s.split()[0] in ("Anh", "Chị") else s


@dataclass
class Built:
    answer: str
    numbers: list[dict[str, Any]] = field(default_factory=list)
    highlight: dict[str, list[str]] = field(default_factory=lambda: {"nodeIds": [], "edgeIds": []})
    suggestions: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[dict[str, str]] = field(default_factory=list)


class _Ctx:
    """Tool results by source name + number registry."""

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


def _label(tools: AssistantTools, pid: str) -> str:
    return spoken(tools.get_district(pid)["label"])


def build(
    qid: str, tools: AssistantTools, principal_ids: list[str] | None = None
) -> tuple[Built, dict[str, Any]]:
    c = _Ctx()
    fn = {
        "simulate.huy_too": _huy_too,
        "simulate.why_flag": _why_flag,
        "simulate.how_fix": _how_fix,
        "request12.huy_agent": _huy_agent,
    }[qid]
    built = fn(c, tools, principal_ids or [])
    built.numbers = c.numbers
    return built, c.data


def _declared_warning(sim: dict[str, Any]) -> list[dict[str, str]]:
    if any("declared" in k["via"] for k in sim["reachedKeys"]):
        return [
            {
                "code": "DATA_DECLARED",
                "text": "Một phần số liệu dựa trên quan hệ tự khai, chưa được kiểm chứng.",
            }
        ]
    return []


def _huy_too(c: _Ctx, t: AssistantTools, _: list[str]) -> Built:
    sim = t.simulate_compromise(["minh", "huy"])
    c.data["simulate"] = sim
    c.data["district"] = t.get_district("minh")
    est = c.num("Ước tính", "simulate.totals.estimated.display")
    pct = c.num("% quỹ chính", "simulate.totals.percentOfMainTreasury")
    enf = c.num("Đã khoá chặt", "simulate.totals.enforced.display")
    a, b = _label(t, "minh"), _label(t, "huy")
    if c.data["district"]["dailyCap"] is None:
        why = f"Lý do lớn nhất: khu {a} chưa có cổng chung."
    else:
        cap = c.num("Cổng chung khu Minh", "district.dailyCap.display")
        why = f"Khu {a} đã có cổng chung {cap} USDC/ngày."
    text = (
        f"Nếu {a} và {b} cùng bị chiếm, kẻ gian có thể chi tới {est} USDC/ngày, "
        f"khoảng {pct}% quỹ chính. Chỉ {enf} USDC/ngày được chặn chắc chắn bằng luật trên "
        f"chuỗi. {why}"
    )
    return Built(text, highlight=sim["highlights"], warnings=_declared_warning(sim))


def _find_r1(findings: list[dict[str, Any]], pid: str) -> int | None:
    for i, f in enumerate(findings):
        if f["ruleId"].startswith("R1") and f["principalId"] == pid:
            return i
    return None


def _why_flag(c: _Ctx, t: AssistantTools, _: list[str]) -> Built:
    findings = t.list_findings()
    c.data["graph"] = {"findings": findings}
    i = _find_r1(findings, "minh")
    a = _label(t, "minh")
    if i is None:
        return Built(f"Khu {a} hiện không có cờ vàng mức cao.")
    sim = t.simulate_compromise(["minh"])
    c.data["simulate"] = sim
    n = c.num("Số thẻ", "simulate.reachedKeys.length")
    maxkey = c.num("Trần riêng mỗi thẻ", f"graph.findings.{i}.data.maxKeyDailyCap.display")
    est = c.num("Ước tính", "simulate.totals.estimated.display")
    text = (
        f"{a[0].upper() + a[1:]} điều khiển {n} thẻ: thẻ của anh ấy, các trợ lý AI và phần mềm "
        f"thanh toán. Mỗi thẻ có trần riêng tối đa {maxkey} USDC/ngày nhưng không có trần "
        f"chung, nên cộng lại có thể tới {est} USDC/ngày."
    )
    return Built(text, highlight=sim["highlights"], warnings=_declared_warning(sim))


def _how_fix(c: _Ctx, t: AssistantTools, principal_ids: list[str]) -> Built:
    findings = t.list_findings()
    c.data["graph"] = {"findings": findings}
    wanted = principal_ids[0] if principal_ids else "minh"
    i = _find_r1(findings, wanted)
    if i is None:
        i = next(
            (j for j, f in enumerate(findings) if f["severity"] == "HIGH" and f["proposal"]), None
        )
    if i is None or not findings[i]["proposal"]:
        return Built("Hiện chưa có cờ vàng nào cần sửa.")
    f = findings[i]
    sim = t.simulate_compromise([f["principalId"]], f["proposal"])
    c.data["simulate"] = sim
    cap = c.num("Hạn mức chung đề xuất", f"graph.findings.{i}.data.suggestedDistrictCap.display")
    before = c.num("Ước tính trước", "simulate.before.totals.estimated.display")
    after = c.num("Ước tính sau", "simulate.after.totals.estimated.display")
    who = _label(t, f["principalId"])
    text = (
        f"Gom các thẻ về cùng khu {who} và đặt hạn mức chung {cap} USDC/ngày. "
        f"Mức có thể mất tối đa mỗi ngày giảm từ {before} xuống {after} USDC."
    )
    return Built(
        text,
        highlight=sim["after"]["highlights"],
        suggestions=[{"title": f"Tạo đề xuất: gom thẻ về khu {who}", "change": f["proposal"]}],
    )


def _huy_agent(c: _Ctx, t: AssistantTools, _: list[str]) -> Built:
    key = t.snapshot_key_address(HUY_KEY_SEED)
    ev = t.evaluate_change({"kind": "move_key", "key": key, "to": "huy"})
    c.data["proposal"] = ev
    huy = _label(t, "huy")
    after = c.num("Ước tính sau khi giao", "proposal.after.estimated.display")
    before = c.num("Ước tính hiện tại", "proposal.before.estimated.display")
    cap = c.num("Hạn mức khu Hội đồng đề xuất", "proposal.suggestion.districtCap.display")
    warnings: list[dict[str, str]] = []
    if ev["conflictedMembers"]:
        warnings.append(
            {
                "code": "CONFLICT_OF_INTEREST",
                "text": f"Anh {huy.split()[-1]} đang ngồi Hội đồng và sẽ giữ một phiếu "
                "duyệt cho chính khu của mình.",
            }
        )
    if ev["concentration"]:
        warnings.append(
            {
                "code": "CONCENTRATION",
                "text": "Quyền chi tập trung vào khu của một thành viên Hội đồng.",
            }
        )
    text = (
        f"{huy[0].upper() + huy[1:]} đang ngồi Hội đồng. Nếu nhận thêm trợ lý Cân đối, khu của "
        f"anh ấy có thể chi tới {after} USDC/ngày (hiện {before}) và vẫn giữ một phiếu "
        f"duyệt: xung đột lợi ích. Nên giao cho khu do Hội đồng sở hữu, hạn mức {cap} "
        "USDC/ngày, chỉ qua chợ đã duyệt."
    )
    return Built(
        text,
        highlight=ev["highlights"],
        warnings=warnings,
        suggestions=[
            {"title": "Tạo khu do Hội đồng sở hữu cho trợ lý Cân đối", "change": ev["suggestion"]}
        ],
    )
