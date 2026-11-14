"""GET /api/city/buildings[/{id}] (docs/spec/CITY_OPS.md §2): what a building is, which rule colours it, the evidence.

`recent` is built from the stores the building's rules read, never invented.
"""

from __future__ import annotations

from typing import Any

from guardian.chain.base import ChainEvent
from guardian.core.errors import ApiError
from guardian.services import faults
from guardian.services.city_state import evaluate_buildings
from guardian.services.runtime import Runtime
from guardian.shared.buildings import BUILDING_BY_ID, BUILDINGS, BuildingDef
from guardian.shared.reason_codes import ReasonCode, reason_text

RECENT_MAX = 10
_SHIELD_REASONS = (ReasonCode.DISTRICT_LOCKED.value, ReasonCode.BLOCKED_AT_PROTOCOL.value)

EVENT_VI = {
    "Proposed": "Có đề xuất mới trình Hội đồng",
    "Approved": "Một thành viên Hội đồng đã duyệt",
    "Executed": "Đề xuất đã được thực hiện",
    "Cancelled": "Đề xuất đã bị huỷ",
    "Queued": "Đề xuất đủ phiếu, chờ hết giờ mới thực thi",
    "Vetoed": "Một thành viên đã phủ quyết đề xuất",
    "Paid": "Kho chi tiền",
    "Swapped": "Kho đổi token",
    "Paused": "Cả kho bị dừng khẩn cấp",
    "Unpaused": "Kho được mở lại",
    "CapChanged": "Hạn mức được đổi",
    "AllowChanged": "Danh sách được phép thay đổi",
    "PrincipalLocked": "Một khu bị khoá",
    "PrincipalUnlocked": "Một khu được mở khoá",
    "AllowListRoleSet": "Danh sách cho phép giao dịch được cập nhật",
    "EmergencyAction": "Hội đồng siết khẩn cấp",
    "KeyDeactivated": "Một khoá bị tắt",
    "KeyMoved": "Một khoá được chuyển khu",
}
# chain events each building's rules read
EVENT_NAMES: dict[str, tuple[str, ...]] = {
    "B01": ("Proposed", "Approved", "Queued", "Vetoed", "Executed", "Cancelled"),
    "B03": ("Paused", "Unpaused", "CapChanged", "AllowChanged", "Paid", "Swapped"),
    "B05": (
        "PrincipalLocked",
        "PrincipalUnlocked",
        "AllowListRoleSet",
        "EmergencyAction",
        "KeyDeactivated",
    ),
}

Item = tuple[
    int, dict[str, Any]
]  # (ts, RecentItem); insertion order breaks ts ties (later = newer)

INCIDENT_STATUS_VI = {
    "detected": "vừa phát hiện",
    "contained": "đã khoanh vùng",
    "awaiting_council": "chờ Hội đồng duyệt",
    "recovering": "đang hồi phục",
    "resolved": "đã xử lý xong",
}


def info_out(b: BuildingDef) -> dict[str, Any]:
    return {
        "id": b.id,
        "name": b.name,
        "module": b.module,
        "topic": b.topic,
        "summaryVi": b.summary_vi,
        "rules": [{"id": r.id, "state": r.state, "whenVi": r.when_vi} for r in b.rules],
    }


def list_buildings() -> list[dict[str, Any]]:
    return [info_out(b) for b in BUILDINGS]


def _item(
    ts: int,
    kind: str,
    summary: str,
    ref: str,
    *,
    tx: str | None = None,
    simulated: bool = True,
    reason: str | None = None,
) -> dict[str, Any]:
    return {
        "ts": ts,
        "kind": kind,
        "summaryVi": summary,
        "txHash": tx,
        "simulated": simulated,
        "reasonCode": reason,
        "ref": ref,
    }


def _attempt_item(rt: Runtime, a: Any) -> dict[str, Any]:
    what = {"pay": "chi tiền", "swap": "đổi token", "lock": "khoá khu", "raw_call": "gọi hợp đồng"}
    verdict = (
        "đã chạy"
        if a.outcome == "ok"
        else "bị chặn: " + (reason_text(a.reason_code) if a.reason_code else "bị từ chối")
    )
    return _item(
        a.ts,
        "attempt",
        f"{a.signer_label} {what.get(a.action, a.action)} {verdict}",
        f"attempt:{a.id}",
        tx=a.tx_hash,
        simulated=a.simulated,
        reason=a.reason_code,
    )


def _event_item(ev: ChainEvent) -> dict[str, Any]:
    return _item(
        ev.ts,
        "event",
        EVENT_VI.get(ev.name, ev.name),
        f"event:{ev.block}.{ev.log_index}",
        tx=ev.tx_hash,
        simulated=ev.simulated,
    )


def _incident_item(inc: Any) -> dict[str, Any]:
    step = next((s for s in reversed(inc.steps) if s["status"] != "pending"), inc.steps[0])
    return _item(
        step.get("ts") or inc.opened_at,
        "incident",
        f"Sự cố #{inc.id}: {inc.title_vi} ({INCIDENT_STATUS_VI.get(inc.status, inc.status)})",
        f"incident:{inc.id}",
        tx=step.get("txHash"),
    )


def recent_items(rt: Runtime, bid: str) -> list[dict[str, Any]]:
    """Newest first, at most RECENT_MAX, filtered to what building `bid`'s rules read."""
    st = rt.stores
    items: list[Item] = []

    def add(it: dict[str, Any]) -> None:
        items.append((it["ts"], it))

    if bid == "B01":
        for p in st.proposals.all():
            add(_item(p.created_at, "proposal", f"Đề xuất #{p.id}: {p.title}", f"proposal:{p.id}"))
            if p.executed_at is not None:
                add(
                    _item(
                        p.executed_at,
                        "proposal",
                        f"Đề xuất #{p.id} đã được thực hiện",
                        f"proposal:{p.id}",
                        tx=p.executed_tx_hash,
                    )
                )
        for i, c in enumerate(st.conflicts):
            add(
                _item(
                    c.ts,
                    "event",
                    f"{c.member} thử duyệt đề xuất #{c.proposal_id} nhưng bị chặn: xung đột lợi ích",
                    f"conflict:{i}",
                    reason="CONFLICT_OF_INTEREST",
                )
            )
    elif bid == "B02":
        for lg in st.assistant_logs.all():
            verdict = "đã kiểm chứng số liệu" if lg.numbers_verified else "chưa kiểm chứng số liệu"
            add(
                _item(
                    lg.ts,
                    "assistant",
                    f"Trợ lý trả lời ({verdict})",
                    f"assistant:{lg.id}",
                )
            )
    elif bid == "B03":
        for ev in rt.event_log:
            if ev.name in EVENT_NAMES["B03"]:
                add(_event_item(ev))
        for a in st.attempts.all():
            if a.outcome != "ok" and a.reason_code in (
                ReasonCode.RECIPIENT_NOT_ALLOWED.value,
                ReasonCode.VAULT_PAUSED.value,
                ReasonCode.CARD_DAILY_CAP.value,
                ReasonCode.DISTRICT_DAILY_CAP.value,
            ):
                add(_attempt_item(rt, a))
    elif bid == "B04":
        for a in st.attempts.all():
            if a.action in ("pay", "swap"):
                add(_attempt_item(rt, a))
    elif bid == "B05":
        for ev in rt.event_log:
            if ev.name in EVENT_NAMES["B05"]:
                add(_event_item(ev))
        for a in st.attempts.all():
            if a.reason_code in _SHIELD_REASONS:
                add(_attempt_item(rt, a))
    elif bid == "B06":
        from guardian.services.agent_service import AGENT_SEED

        for r in st.agent_runs.all():
            what = {
                "swapped": "đã cân đối danh mục",
                "no_action": "không cần hành động",
                "blocked": "bị chặn",
                "reverted": "bị revert",
            }.get(r.outcome, r.outcome)
            add(
                _item(
                    r.ts,
                    "agent_run",
                    f"Agent {what}",
                    f"agent_run:{r.id}",
                    tx=r.tx_hash,
                    reason=r.reason_code,
                )
            )
        for a in st.attempts.all():
            if a.signer == AGENT_SEED and a.action == "pay":
                add(_attempt_item(rt, a))
    elif bid == "B07":
        for n, entry in enumerate(rt.guard.audit):
            add(_item(entry["ts"], "event", f"Thao tác ký: {entry['action']}", f"audit:{n}"))
    for inc in st.incidents:
        if bid in (inc.building, "B08"):
            add(_incident_item(inc))
    # stable newest-first: sort by ts, keep insertion order for ties (later insertion = newer)
    ordered = sorted(enumerate(items), key=lambda p: (p[1][0], p[0]), reverse=True)
    return [it for _, (_, it) in ordered[:RECENT_MAX]]


def detail(rt: Runtime, bid: str) -> dict[str, Any]:
    b = BUILDING_BY_ID.get(bid)
    if b is None:
        raise ApiError(404, "BUILDING_NOT_FOUND", f"Không có tòa nhà '{bid}'.")
    ev = evaluate_buildings(rt)[bid]
    holding = {m[0] for m in ev.matches}
    open_inc = next(
        (i for i in reversed(rt.stores.incidents) if i.building == bid and i.status != "resolved"),
        None,
    )
    return {
        **info_out(b),
        "state": ev.state,
        "reasonVi": ev.reason,
        "evidence": ev.evidence,
        "rules": [
            {"id": r.id, "state": r.state, "whenVi": r.when_vi, "active": r.id in holding}
            for r in b.rules
        ],
        "activeRuleId": ev.rule_id,
        "recent": recent_items(rt, bid),
        "faults": [f.id for f in faults.FAULTS if f.building == bid],
        "incidentId": open_inc.id if open_inc else None,
    }
