"""City states: backend is the single source for the 3D city (8 buildings, spec §10.8).

State per building in {normal, warning, incident, recovery}, a short VI reason and evidence
(tx hash / reason code / proposal id / district id). Derived from live domain data, never scripted.
Windows and thresholds are the named constants below; `GET /api/city/states` and the SSE event
`city_updated` carry the same payload (`city_updated` is published when any building changes).

Rules (precedence inside a building, first match wins):
  B01 Hội đồng      incident  a conflicted approval was attempted in the last CONFLICT_WINDOW_S
                    recovery  a proposal executed in the last RECOVERY_WINDOW_S (beats "open"
                              so the seeded request #12 does not hide the recovery)
                    warning   any open proposal
  B02 Giáo dục      warning   the last assistant answer had numbers_verified = false
  B03 Kho tiền      incident  vault paused
                    warning   some district spent >= DISTRICT_WARN_PCT % of its district cap today
  B04 Tiêu dùng     latest scenario run, latest non-ok pay/swap attempt within ATTEMPT_WINDOW_S:
                    incident  offending district not locked yet
                    recovery  offending district already locked
  B05 An toàn       incident  an attempt hit DISTRICT_LOCKED / BLOCKED_AT_PROTOCOL in the last
                              SHIELD_WINDOW_S (the shield is repelling the attacker right now)
                    recovery  any district is locked ("đã khoá khu ...")
  B06 Tăng trưởng   warning   last agent run was blocked / reverted (e.g. CARD_DAILY_CAP)
                    normal    after a successful swap, no run, or no action needed
  B07 Trách nhiệm   warning   any HIGH finding is open
  B08 Quảng trường  worst state of the others: incident > warning > recovery > normal
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from guardian.graph.findings import compute_findings
from guardian.services import views
from guardian.shared.reason_codes import ReasonCode, reason_text

if TYPE_CHECKING:
    from guardian.services.runtime import Runtime

CONFLICT_WINDOW_S = 600
RECOVERY_WINDOW_S = 300
ATTEMPT_WINDOW_S = 600
SHIELD_WINDOW_S = 120
DISTRICT_WARN_PCT = 80

BUILDINGS: tuple[tuple[str, str], ...] = (
    ("B01", "Hội đồng"),
    ("B02", "Giáo dục"),
    ("B03", "Kho tiền"),
    ("B04", "Tiêu dùng"),
    ("B05", "An toàn"),
    ("B06", "Tăng trưởng"),
    ("B07", "Trách nhiệm"),
    ("B08", "Quảng trường"),
)
_RANK = {"normal": 0, "recovery": 1, "warning": 2, "incident": 3}
_SHIELD_REASONS = (ReasonCode.DISTRICT_LOCKED.value, ReasonCode.BLOCKED_AT_PROTOCOL.value)


def _ev(kind: str, value: Any) -> dict[str, Any]:
    return {"kind": kind, "value": value}


def _b(state: str, reason: str, *evidence: dict[str, Any]) -> tuple[str, str, list[dict[str, Any]]]:
    return state, reason, [e for e in evidence if e["value"] is not None]


def _lock_tx(rt: Runtime, pid: str) -> str | None:
    for e in reversed(rt.sim.events):
        if e.name == "PrincipalLocked" and e.payload.get("principalId") == pid:
            return e.tx_hash
    return None


def compute_city_states(rt: Runtime) -> dict[str, Any]:
    now = rt.now()
    snap = rt.snapshot()
    st = rt.stores
    result: dict[str, tuple[str, str, list[dict[str, Any]]]] = {}

    # B01 Hội đồng
    recent_conf = [c for c in st.conflicts if now - c.ts <= CONFLICT_WINDOW_S]
    executed = [
        p
        for p in st.proposals.values()
        if p.executed_at is not None and now - p.executed_at <= RECOVERY_WINDOW_S
    ]
    open_ids = [i for i in sorted(st.proposals) if rt.sim.council.proposals[i].status == "open"]
    if recent_conf:
        c = recent_conf[-1]
        result["B01"] = _b(
            "incident",
            f"Thành viên {c.member} thử duyệt đề xuất #{c.proposal_id} "
            "nhưng bị chặn: xung đột lợi ích.",
            _ev("reasonCode", "CONFLICT_OF_INTEREST"),
            _ev("proposalId", c.proposal_id),
        )
    elif executed:
        p = max(executed, key=lambda x: x.executed_at or 0)
        result["B01"] = _b(
            "recovery",
            f"Đề xuất #{p.id} vừa được thực hiện, chính sách v{snap.policy_version}.",
            _ev("txHash", p.executed_tx_hash),
            _ev("proposalId", p.id),
        )
    elif open_ids:
        result["B01"] = _b(
            "warning",
            f"{len(open_ids)} đề xuất đang chờ Hội đồng duyệt.",
            *[_ev("proposalId", i) for i in open_ids],
        )
    else:
        result["B01"] = _b("normal", "Hội đồng không có việc chờ.")

    # B02 Giáo dục
    last_ans = st.assistant_logs[-1] if st.assistant_logs else None
    if last_ans is not None and not last_ans.numbers_verified:
        result["B02"] = _b(
            "warning",
            "Câu trả lời gần nhất của trợ lý chưa kiểm chứng được số liệu.",
            _ev("question", last_ans.question_id),
        )
    else:
        result["B02"] = _b("normal", "Trợ lý trả lời với số liệu đã kiểm chứng.")

    # B03 Kho tiền
    hot = [
        p
        for p in snap.principals.values()
        if p.daily_cap > 0 and p.spent_today * 100 >= p.daily_cap * DISTRICT_WARN_PCT
    ]
    if snap.paused:
        result["B03"] = _b("incident", "Cả kho đang dừng.", _ev("reasonCode", "VAULT_PAUSED"))
    elif hot:
        p = max(hot, key=lambda x: x.spent_today * 1000 // x.daily_cap)
        result["B03"] = _b(
            "warning",
            f"Khu {p.label} đã dùng {views.mny(p.spent_today)['display']}/"
            f"{views.mny(p.daily_cap)['display']} hạn mức chung hôm nay.",
            _ev("principalId", p.id),
        )
    else:
        result["B03"] = _b("normal", "Kho tiền hoạt động bình thường.")

    # B04 Tiêu dùng
    latest_run = next(reversed(st.runs), None) if st.runs else None
    bad = [
        a
        for a in st.attempts
        if latest_run is not None
        and a.scenario_run_id == latest_run
        and a.action in ("pay", "swap")
        and a.outcome != "ok"
        and now - a.ts <= ATTEMPT_WINDOW_S
    ]
    if bad:
        a = bad[-1]
        offender = snap.principals.get(a.principal_id or "")
        why = reason_text(a.reason_code) if a.reason_code else "bị từ chối"
        if offender is not None and offender.locked:
            result["B04"] = _b(
                "recovery",
                f"Khu {offender.label} đã được khoá sau giao dịch bị chặn.",
                _ev("reasonCode", a.reason_code),
                _ev("txHash", a.tx_hash),
            )
        else:
            result["B04"] = _b(
                "incident",
                f"Giao dịch của {a.signer_label} bị chặn: {why}.",
                _ev("reasonCode", a.reason_code),
                _ev("txHash", a.tx_hash),
            )
    else:
        result["B04"] = _b("normal", "Chi tiêu bình thường.")

    # B05 An toàn
    locked = [p for p in snap.principals.values() if p.locked]
    shield = [
        a for a in st.attempts if a.reason_code in _SHIELD_REASONS and now - a.ts <= SHIELD_WINDOW_S
    ]
    if shield:
        a = shield[-1]
        result["B05"] = _b(
            "incident",
            f"Lá chắn đang chặn: {a.signer_label} bị chain từ chối.",
            _ev("reasonCode", a.reason_code),
            _ev("txHash", a.tx_hash),
        )
    elif locked:
        p = locked[-1]
        result["B05"] = _b(
            "recovery",
            f"Đã khoá khu {p.label}.",
            _ev("principalId", p.id),
            _ev("txHash", _lock_tx(rt, p.id)),
        )
    else:
        result["B05"] = _b("normal", "Không có khu nào bị khoá.")

    # B06 Tăng trưởng
    last_run = st.agent_runs[-1] if st.agent_runs else None
    if last_run is not None and last_run.outcome in ("blocked", "reverted"):
        why = reason_text(last_run.reason_code) if last_run.reason_code else "bị từ chối"
        result["B06"] = _b(
            "warning", f"Agent cân đối bị chặn: {why}.", _ev("reasonCode", last_run.reason_code)
        )
    elif last_run is not None and last_run.outcome == "swapped":
        result["B06"] = _b(
            "normal", "Agent vừa cân đối danh mục thành công.", _ev("txHash", last_run.tx_hash)
        )
    else:
        result["B06"] = _b("normal", "Agent cân đối sẵn sàng.")

    # B07 Trách nhiệm
    high = [f for f in compute_findings(snap) if f["severity"] == "HIGH"]
    if high:
        result["B07"] = _b(
            "warning",
            f"{len(high)} cờ vàng mức cao đang mở.",
            *[_ev("findingId", f["id"]) for f in high],
        )
    else:
        result["B07"] = _b("normal", "Không có cờ vàng mức cao.")

    # B08 Quảng trường: worst of the others
    worst = max((s for s, _, _ in result.values()), key=lambda s: _RANK[s])
    culprits = [bid for bid, (s, _, _) in result.items() if s == worst]
    names = {bid: n for bid, n in BUILDINGS}
    if worst == "normal":
        result["B08"] = _b("normal", "Thành phố yên bình.")
    else:
        label = {"incident": "sự cố", "warning": "cảnh báo", "recovery": "đang phục hồi"}[worst]
        result["B08"] = _b(
            worst,
            f"Đang có {label} ở: " + ", ".join(names[b] for b in culprits) + ".",
            *[_ev("building", b) for b in culprits],
        )

    return {
        "buildings": [
            {
                "id": bid,
                "name": name,
                "state": result[bid][0],
                "reasonVi": result[bid][1],
                "evidence": result[bid][2],
            }
            for bid, name in BUILDINGS
        ],
        "updatedAt": now,
        "policyVersion": snap.policy_version,
        "graphVersion": rt.graph_version,
    }
