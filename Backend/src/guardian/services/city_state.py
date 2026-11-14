"""City states: backend is the single source for the 3D city (8 buildings, spec §10.8).

State per building in {normal, warning, incident, recovery}, a short VI reason and evidence
(tx hash / reason code / proposal id / district id). Derived from live domain data, never scripted.
Windows and thresholds are the named constants below; `GET /api/city/states` and the SSE event
`city_updated` carry the same payload (`city_updated` is published when any building changes).

Rules (precedence inside a building, first match wins). Rule ids are stable and listed in
`shared/buildings.py` (docs/spec/CITY_OPS.md §1); `evaluate_buildings` keeps every rule that holds, in this
order, so the detail endpoint can say which rule decides the colour and which others also hold.
  B01..B07          incident  `<Bxx>.incident_open`: a responder incident is open here (contained / waiting
                              for the Council; highest precedence)
                    recovery  `<Bxx>.incident_recovering`: the incident's fix was executed, verifying
  B01 Hội đồng duyệt incident  B01.conflict   a conflicted approval was attempted in the last CONFLICT_WINDOW_S
                    recovery  B01.executed   a proposal executed in the last RECOVERY_WINDOW_S (beats "open"
                              so the seeded request #12 does not hide the recovery)
                    warning   B01.pending    any open proposal
  B02 Trợ lý AI     warning   B02.unverified the last assistant answer had numbers_verified = false
  B03 Kho tiền có luật
                    incident  B03.paused     vault paused
                    warning   B03.near_cap   some district spent >= DISTRICT_WARN_PCT % of its district cap today
  B04 Cổng chi trả  latest scenario run, latest non-ok pay/swap attempt within ATTEMPT_WINDOW_S:
                    incident  B04.blocked_open    offending district not locked yet
                    recovery  B04.blocked_locked  offending district already locked
                    incident  B04.payroll_kill    payroll kill switch is on (CITY-006)
                    warning   B04.payroll_at_risk a payroll venue is impaired (CITY-006)
  B05 Trạm soi giao dịch
                    incident  B05.shield     an attempt hit DISTRICT_LOCKED / BLOCKED_AT_PROTOCOL in the last
                              SHIELD_WINDOW_S (the shield is repelling the attacker right now)
                    recovery  B05.locked     any district is locked ("đã khoá khu ...")
  B06 Agent cân đối warning   B06.blocked    last agent run was blocked / reverted (e.g. CARD_DAILY_CAP)
                    normal    after a successful swap, no run, or no action needed
  B07 Sổ kiểm toán  warning   B07.high       any HIGH finding is open
  B08 Trung tâm sự cố         B08.worst      worst state of the others: incident > warning > recovery > normal
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from guardian.graph.findings import compute_findings
from guardian.services import views
from guardian.shared.buildings import BUILDINGS as BUILDING_DEFS
from guardian.shared.reason_codes import ReasonCode, reason_text

if TYPE_CHECKING:
    from guardian.services.runtime import Runtime

CONFLICT_WINDOW_S = 600
RECOVERY_WINDOW_S = 300
ATTEMPT_WINDOW_S = 600
SHIELD_WINDOW_S = 120
DISTRICT_WARN_PCT = 80

BUILDINGS: tuple[tuple[str, str], ...] = tuple((b.id, b.name) for b in BUILDING_DEFS)
_RANK = {"normal": 0, "recovery": 1, "warning": 2, "incident": 3}
_SHIELD_REASONS = (ReasonCode.DISTRICT_LOCKED.value, ReasonCode.BLOCKED_AT_PROTOCOL.value)

Match = tuple[str, str, str, list[dict[str, Any]]]  # (rule id, state, reason, evidence)


@dataclass
class BuildingEval:
    """Every rule that holds for a building, in precedence order; the first one decides the colour."""

    matches: list[Match] = field(default_factory=list)
    normal_reason: str = ""
    normal_evidence: list[dict[str, Any]] = field(default_factory=list)

    @property
    def state(self) -> str:
        return self.matches[0][1] if self.matches else "normal"

    @property
    def reason(self) -> str:
        return self.matches[0][2] if self.matches else self.normal_reason

    @property
    def evidence(self) -> list[dict[str, Any]]:
        return self.matches[0][3] if self.matches else self.normal_evidence

    @property
    def rule_id(self) -> str | None:
        return self.matches[0][0] if self.matches else None


def _ev(kind: str, value: Any) -> dict[str, Any]:
    return {"kind": kind, "value": value}


def _present(*evidence: dict[str, Any]) -> list[dict[str, Any]]:
    return [e for e in evidence if e["value"] is not None]


def _m(rule: str, state: str, reason: str, *evidence: dict[str, Any]) -> Match:
    return rule, state, reason, _present(*evidence)


def _lock_tx(rt: Runtime, pid: str) -> str | None:
    for e in reversed(rt.event_log):
        if e.name == "PrincipalLocked" and e.payload.get("principalId") == pid:
            return e.tx_hash
    return None


def _incident_matches(rt: Runtime, bid: str) -> list[Match]:
    """Responder rules of building `bid` (CITY_OPS §4): open beats recovering."""
    out: list[Match] = []
    mine = [i for i in rt.stores.incidents if i.building == bid]
    where = {
        "detected": "đang phát hiện",
        "contained": "đã khoanh vùng",
        "awaiting_council": "đang chờ Hội đồng duyệt",
    }
    for inc in reversed(mine):
        if inc.status in where:
            out.append(
                _m(
                    f"{bid}.incident_open",
                    "incident",
                    f"Sự cố: {inc.title_vi} ({where[inc.status]}).",
                    _ev("incidentId", inc.id),
                    _ev("reasonCode", inc.trigger.get("reasonCode")),
                    _ev("principalId", inc.principal_id),
                    _ev("proposalId", inc.proposal_id),
                )
            )
            break
    for inc in reversed(mine):
        if inc.status == "recovering":
            out.append(
                _m(
                    f"{bid}.incident_recovering",
                    "recovery",
                    f"Sự cố đang hồi phục: {inc.title_vi}.",
                    _ev("incidentId", inc.id),
                    _ev("reasonCode", inc.trigger.get("reasonCode")),
                    _ev("principalId", inc.principal_id),
                    _ev("proposalId", inc.proposal_id),
                )
            )
            break
    return out


def evaluate_buildings(rt: Runtime) -> dict[str, BuildingEval]:
    now = rt.now()
    snap = rt.snapshot()
    st = rt.stores
    ev: dict[str, BuildingEval] = {bid: BuildingEval() for bid, _ in BUILDINGS}
    for bid, e in ev.items():
        if bid != "B08":
            e.matches.extend(_incident_matches(rt, bid))

    # B01 Hội đồng duyệt
    b1 = ev["B01"]
    b1.normal_reason = "Hội đồng không có việc chờ."
    recent_conf = [c for c in st.conflicts if now - c.ts <= CONFLICT_WINDOW_S]
    executed = [
        p
        for p in st.proposals.all()
        if p.executed_at is not None and now - p.executed_at <= RECOVERY_WINDOW_S
    ]
    open_ids = [
        i for i in (p.id for p in st.proposals.all()) if rt.chain.proposal_state(i).status == "open"
    ]
    if recent_conf:
        c = recent_conf[-1]
        b1.matches.append(
            _m(
                "B01.conflict",
                "incident",
                f"Thành viên {c.member} thử duyệt đề xuất #{c.proposal_id} "
                "nhưng bị chặn: xung đột lợi ích.",
                _ev("reasonCode", "CONFLICT_OF_INTEREST"),
                _ev("proposalId", c.proposal_id),
            )
        )
    if executed:
        p = max(executed, key=lambda x: x.executed_at or 0)
        b1.matches.append(
            _m(
                "B01.executed",
                "recovery",
                f"Đề xuất #{p.id} vừa được thực hiện, chính sách v{snap.policy_label}.",
                _ev("txHash", p.executed_tx_hash),
                _ev("proposalId", p.id),
            )
        )
    if open_ids:
        b1.matches.append(
            _m(
                "B01.pending",
                "warning",
                f"{len(open_ids)} đề xuất đang chờ Hội đồng duyệt.",
                *[_ev("proposalId", i) for i in open_ids],
            )
        )

    # B02 Trợ lý AI
    b2 = ev["B02"]
    b2.normal_reason = "Trợ lý trả lời với số liệu đã kiểm chứng."
    last_ans = next(iter(reversed(st.assistant_logs.all())), None)
    if last_ans is not None and not last_ans.numbers_verified:
        b2.matches.append(
            _m(
                "B02.unverified",
                "warning",
                "Câu trả lời gần nhất của trợ lý chưa kiểm chứng được số liệu.",
                _ev("question", last_ans.question_id),
            )
        )

    # B03 Kho tiền có luật
    b3 = ev["B03"]
    b3.normal_reason = "Kho tiền hoạt động bình thường."
    hot = [
        p
        for p in snap.principals.values()
        if p.daily_cap > 0 and p.spent_today * 100 >= p.daily_cap * DISTRICT_WARN_PCT
    ]
    if snap.paused:
        b3.matches.append(
            _m("B03.paused", "incident", "Cả kho đang dừng.", _ev("reasonCode", "VAULT_PAUSED"))
        )
    if hot:
        p = max(hot, key=lambda x: x.spent_today * 1000 // x.daily_cap)
        b3.matches.append(
            _m(
                "B03.near_cap",
                "warning",
                f"Khu {p.label} đã dùng {views.mny(p.spent_today)['display']}/"
                f"{views.mny(p.daily_cap)['display']} hạn mức chung hôm nay.",
                _ev("principalId", p.id),
            )
        )

    # B04 Cổng chi trả
    b4 = ev["B04"]
    b4.normal_reason = "Chi tiêu bình thường."
    latest = st.runs.latest()
    latest_run = latest.id if latest else None
    bad = [
        a
        for a in st.attempts.all()
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
            b4.matches.append(
                _m(
                    "B04.blocked_locked",
                    "recovery",
                    f"Khu {offender.label} đã được khoá sau giao dịch bị chặn.",
                    _ev("reasonCode", a.reason_code),
                    _ev("txHash", a.tx_hash),
                )
            )
        else:
            b4.matches.append(
                _m(
                    "B04.blocked_open",
                    "incident",
                    f"Giao dịch của {a.signer_label} bị chặn: {why}.",
                    _ev("reasonCode", a.reason_code),
                    _ev("txHash", a.tx_hash),
                )
            )

    # B04 payroll float (CITY-006, PAYROLL.md decision 7): added after the old B04 rules
    pay = rt.payroll.snapshot()
    if pay.killed:
        b4.matches.append(
            _m(
                "B04.payroll_kill",
                "incident",
                "Công tắc khẩn cấp quỹ lương đang bật: không đặt thêm tiền ra ngoài.",
                _ev("killReason", pay.kill_reason),
            )
        )
    impaired = [v for v in pay.venues if v.impaired]
    if impaired:
        b4.matches.append(
            _m(
                "B04.payroll_at_risk",
                "warning",
                f"{len(impaired)} nơi gửi quỹ lương đang gặp sự cố, tiền chờ rút về.",
                _ev("venue", impaired[0].label),
            )
        )

    # B05 Trạm soi giao dịch
    b5 = ev["B05"]
    b5.normal_reason = "Không có khu nào bị khoá."
    locked = [p for p in snap.principals.values() if p.locked]
    shield = [
        a
        for a in st.attempts.all()
        if a.reason_code in _SHIELD_REASONS and now - a.ts <= SHIELD_WINDOW_S
    ]
    if shield:
        a = shield[-1]
        b5.matches.append(
            _m(
                "B05.shield",
                "incident",
                f"Lá chắn đang chặn: {a.signer_label} bị chain từ chối.",
                _ev("reasonCode", a.reason_code),
                _ev("txHash", a.tx_hash),
            )
        )
    if locked:
        p = locked[-1]
        b5.matches.append(
            _m(
                "B05.locked",
                "recovery",
                f"Đã khoá khu {p.label}.",
                _ev("principalId", p.id),
                _ev("txHash", _lock_tx(rt, p.id)),
            )
        )

    # B06 Agent cân đối
    b6 = ev["B06"]
    b6.normal_reason = "Agent cân đối sẵn sàng."
    last_run = next(iter(reversed(st.agent_runs.all())), None)
    if last_run is not None and last_run.outcome in ("blocked", "reverted"):
        why = reason_text(last_run.reason_code) if last_run.reason_code else "bị từ chối"
        b6.matches.append(
            _m(
                "B06.blocked",
                "warning",
                f"Agent cân đối bị chặn: {why}.",
                _ev("reasonCode", last_run.reason_code),
            )
        )
    elif last_run is not None and last_run.outcome == "swapped":
        b6.normal_reason = "Agent vừa cân đối danh mục thành công."
        b6.normal_evidence = _present(_ev("txHash", last_run.tx_hash))

    # B07 Sổ kiểm toán
    b7 = ev["B07"]
    b7.normal_reason = "Không có cờ vàng mức cao."
    high = [f for f in compute_findings(snap) if f["severity"] == "HIGH"]
    if high:
        b7.matches.append(
            _m(
                "B07.high",
                "warning",
                f"{len(high)} cờ vàng mức cao đang mở.",
                *[_ev("findingId", f["id"]) for f in high],
            )
        )

    # B08 Trung tâm sự cố: worst of the others
    b8 = ev["B08"]
    others = {bid: e for bid, e in ev.items() if bid != "B08"}
    worst = max((e.state for e in others.values()), key=lambda s: _RANK[s])
    culprits = [bid for bid, e in others.items() if e.state == worst]
    names = {bid: n for bid, n in BUILDINGS}
    if worst == "normal":
        b8.normal_reason = "Thành phố yên bình."
    else:
        label = {"incident": "sự cố", "warning": "cảnh báo", "recovery": "đang phục hồi"}[worst]
        b8.matches.append(
            _m(
                "B08.worst",
                worst,
                f"Đang có {label} ở: " + ", ".join(names[b] for b in culprits) + ".",
                *[_ev("building", b) for b in culprits],
            )
        )
    return ev


def compute_city_states(rt: Runtime) -> dict[str, Any]:
    now = rt.now()
    snap = rt.snapshot()
    ev = evaluate_buildings(rt)
    return {
        "buildings": [
            {
                "id": bid,
                "name": name,
                "state": ev[bid].state,
                "reasonVi": ev[bid].reason,
                "evidence": ev[bid].evidence,
            }
            for bid, name in BUILDINGS
        ],
        "updatedAt": now,
        "policyVersion": snap.policy_version,
        "policyLabel": snap.policy_label,
        "graphVersion": rt.graph_version,
    }
