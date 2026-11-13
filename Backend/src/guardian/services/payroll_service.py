"""Payroll float service (docs/spec/PAYROLL.md section 8): API views over `Runtime.payroll` + agent runs.

`Runtime.payroll` is a `DemoPayroll` (today always the in-memory `SimPayroll`, also for CHAIN_MODE=l1: there is no
l1 PayrollPort adapter yet). All state the port does not keep (agent runs, proposal metadata, the demo scale,
which venues the demo froze, the last CFO report) lives in `PayrollState`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from guardian.agent_float.config import DEFAULT_PARAMS
from guardian.agent_float.report import build_facts, write_report
from guardian.agent_float.runner import PayrollAgentRun, run_once
from guardian.chain.base import ChainEvent
from guardian.chain.payroll_base import PayrollTxResult
from guardian.chain.sim.payroll import VENUE_A, VENUE_B
from guardian.core.errors import ApiError
from guardian.domain.payroll_snapshot import PayrollSnapshot, VenueState
from guardian.services import views
from guardian.shared.payroll_reasons import payroll_reason_text

if TYPE_CHECKING:
    from guardian.services.runtime import Runtime

DEFAULT_TIME_SCALE = 4320  # PAYROLL.md section 8: 30 days in 10 minutes
CYCLE_DAYS = 30
THRESHOLD = 2
MAX_RUNS = 200
KILL_REASON_VI = {
    1: "Một thành viên Hội đồng đã bấm công tắc.",
    2: "Công tắc tự bật khi tới hạn rút về.",
    3: "Hệ thống tự bật khi phát hiện sự cố.",
}
FN_VI = {
    "setRoster": "Đổi bảng lương",
    "removePayee": "Gỡ một người khỏi bảng lương",
    "startCycle": "Mở kỳ lương mới",
    "returnReserve": "Trả tiền dự phòng về công ty",
    "withdrawSurplus": "Rút phần dư về công ty",
    "setVenue": "Thêm hoặc gỡ một nơi gửi",
    "setVenueCapBps": "Đổi mức tối đa cho một nơi gửi",
    "setBufferBps": "Đổi mức tiền mặt phải giữ",
    "setDeadlineLead": "Đổi hạn rút về",
    "setFaultTolerance": "Đổi số nơi gửi được phép kẹt",
    "clearImpaired": "Báo một nơi gửi đã ổn lại",
    "resetKill": "Tắt công tắc khẩn cấp",
    "setRungs": "Đổi bậc thang rút về",
    "setAgent": "Cấp hoặc thu quyền agent",
    "lowerRung": "Hạ một bậc thang",
    "killSwitch": "Bật công tắc khẩn cấp",
}


@dataclass
class PayrollState:
    """API-side bookkeeping next to the chain (reset with the demo)."""

    scale: int = DEFAULT_TIME_SCALE
    runs: list[dict[str, Any]] = field(default_factory=list)
    frozen: set[str] = field(default_factory=set)
    proposals: dict[int, dict[str, Any]] = field(default_factory=dict)
    report: dict[str, Any] | None = None
    next_run_id: int = 1


def _state(rt: Runtime) -> PayrollState:
    return rt.payroll_state  # type: ignore[no-any-return]


# ------------------------------------------------------------------ helpers
def member_addr(rt: Runtime, ref: str) -> str:
    try:
        return rt.addr(ref)
    except KeyError as exc:
        raise ApiError(404, "MEMBER_NOT_FOUND", f"Không có thành viên {ref!r}.") from exc


def member_id(rt: Runtime, address: str) -> str:
    for m in rt.snapshot().council:
        if m.address.lower() == address.lower():
            return m.id
    return address


def venue_id(snap: PayrollSnapshot, addr: str) -> str:
    if addr == VENUE_A:
        return "venue_a"
    if addr == VENUE_B:
        return "venue_b"
    return f"venue_{[v.addr for v in snap.venues].index(addr) + 1}"


def resolve_venue(rt: Runtime, ref: str) -> str:
    snap = rt.payroll.snapshot()
    for v in snap.venues:
        if ref in (v.addr, venue_id(snap, v.addr)):
            return v.addr
    raise ApiError(404, "VENUE_NOT_FOUND", f"Không có nơi gửi {ref!r}.")


def _m(v: int) -> dict[str, str]:
    return views.mny(v)


def tx_out(res: PayrollTxResult) -> dict[str, Any]:
    return {
        "ok": res.ok,
        "status": res.status,
        "reasonCode": res.reason_code.value if res.reason_code else None,
        "reasonVi": payroll_reason_text(res.reason_code) if res.reason_code else None,
        "errorRaw": res.error_raw,
        "txHash": res.tx_hash,
        "proposalId": res.proposal_id,
        "events": [e.name for e in res.events],
    }


def event_out(ev: ChainEvent) -> dict[str, Any]:
    return {
        "name": ev.name,
        "block": ev.block,
        "txHash": ev.tx_hash,
        "logIndex": ev.log_index,
        "ts": ev.ts,
        "payload": _jsonable(ev.payload),
        "simulated": ev.simulated,
    }


def _jsonable(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) >= 2**53:
        return str(v)
    return v


def _venue_out(rt: Runtime, snap: PayrollSnapshot, v: VenueState) -> dict[str, Any]:
    return {
        "id": venue_id(snap, v.addr),
        "addr": v.addr,
        "label": v.label,
        "allowed": v.allowed,
        "impaired": v.impaired,
        "frozenHint": v.frozen_hint,
        "frozen": v.addr in _state(rt).frozen,
        "deployed": _m(v.deployed),
        "capAmount": _m(v.cap_amount),
        "due": _m(v.due),
        "assetsOf": _m(v.assets_of),
        "yieldBpsPerDay": v.yield_bps_per_day,
    }


def _rungs(snap: PayrollSnapshot) -> list[dict[str, Any]]:
    out = []
    active = -1
    for i, r in enumerate(snap.rungs):
        if snap.deadline - r.before_deadline <= snap.now:
            active = i
    for i, r in enumerate(snap.rungs):
        out.append(
            {
                "index": i,
                "beforeDeadline": r.before_deadline,
                "startsAt": snap.deadline - r.before_deadline,
                "maxDeployedBps": r.max_deployed_bps,
                "ceilingAmount": _m(r.max_deployed_bps * snap.principal // 10_000),
                "active": i == active,
            }
        )
    return out


def guarantee(snap: PayrollSnapshot) -> dict[str, Any]:
    ok = snap.exposure_at_risk <= snap.coverage
    return {
        "ok": ok,
        "coverage": _m(snap.coverage),
        "exposureAtRisk": _m(snap.exposure_at_risk),
        "headroom": _m(max(0, snap.coverage - snap.exposure_at_risk)),
        "reasonVi": (
            "Dù một nơi gửi bị kẹt, quỹ vẫn đủ trả lương."
            if ok
            else "Dự phòng chưa đủ nếu một nơi gửi bị kẹt."
        ),
    }


def state_out(rt: Runtime) -> dict[str, Any]:
    snap = rt.payroll.snapshot()
    st = _state(rt)
    return {
        "now": snap.now,
        "cycleId": snap.cycle_id,
        "cycleStart": snap.payday - CYCLE_DAYS * snap.day_unit,
        "payday": snap.payday,
        "deadline": snap.deadline,
        "phase": snap.phase,
        "payrollTotal": _m(snap.payroll_total),
        "principal": _m(snap.principal),
        "reserve": _m(snap.reserve),
        "idle": _m(snap.idle),
        "deployedTotal": _m(snap.deployed_total),
        "yieldRealized": _m(snap.yield_realized),
        "bufferAmount": _m(snap.buffer_amount),
        "ceilingAmount": _m(snap.ceiling_amount),
        "nextRungAt": snap.next_rung_at,
        "killed": snap.killed,
        "killReason": snap.kill_reason,
        "killReasonVi": KILL_REASON_VI.get(snap.kill_reason),
        "coverage": _m(snap.coverage),
        "exposureAtRisk": _m(snap.exposure_at_risk),
        "coverageOk": snap.coverage_ok,
        "faultTolerance": snap.fault_tolerance,
        "bufferBps": snap.buffer_bps,
        "dayUnit": snap.day_unit,
        "timeScale": st.scale,
        "executed": snap.executed,
        "venues": [_venue_out(rt, snap, v) for v in snap.venues],
        "rungs": _rungs(snap),
        "roster": [
            {
                "account": p.account,
                "label": f"Người nhận {i + 1}",
                "amount": _m(p.amount),
                "paid": snap.executed,
            }
            for i, p in enumerate(snap.roster)
        ],
        "agents": snap.agents,
        "guarantee": guarantee(snap),
        "vaultCoversPayroll": snap.idle >= snap.payroll_total,
    }


def ladder_out(rt: Runtime) -> dict[str, Any]:
    snap = rt.payroll.snapshot()
    rungs = _rungs(snap)
    cycle_start = snap.payday - CYCLE_DAYS * snap.day_unit
    start_cap = (10_000 - snap.buffer_bps) * snap.principal // 10_000
    curve = [{"ts": cycle_start, "ceilingAmount": _m(start_cap)}]
    curve += [{"ts": r["startsAt"], "ceilingAmount": r["ceilingAmount"]} for r in rungs]
    curve.append({"ts": snap.payday, "ceilingAmount": _m(0)})
    current = max((r["index"] for r in rungs if r["active"]), default=-1)
    return {
        "now": snap.now,
        "cycleStart": cycle_start,
        "deadline": snap.deadline,
        "payday": snap.payday,
        "currentIndex": current,
        "rungs": rungs,
        "curve": curve,
    }


def venues_out(rt: Runtime) -> list[dict[str, Any]]:
    snap = rt.payroll.snapshot()
    return [_venue_out(rt, snap, v) for v in snap.venues]


def roster_out(rt: Runtime) -> list[dict[str, Any]]:
    return state_out(rt)["roster"]  # type: ignore[no-any-return]


def events_out(rt: Runtime, limit: int = 100) -> list[dict[str, Any]]:
    evs = rt.payroll.events_since(0)
    return [event_out(e) for e in evs[-limit:]]


# ------------------------------------------------------------------ publish
def publish_state(rt: Runtime, *, city: bool = True) -> None:
    """After any change: `payroll_updated` (full state) and a city colour refresh."""
    rt.publish("payroll_updated", state_out(rt))
    if city:
        rt.notify_state_changed(graph=False)


def on_chain_event(rt: Runtime, ev: ChainEvent) -> None:
    rt.publish("payroll_event", event_out(ev))


def after(rt: Runtime, res: PayrollTxResult) -> dict[str, Any]:
    publish_state(rt)
    return tx_out(res)


# ------------------------------------------------------------------ demo controls
def advance(rt: Runtime, seconds: int) -> dict[str, Any]:
    rt.payroll.advance_time(seconds)
    publish_state(rt)
    return state_out(rt)


def set_scale(rt: Runtime, scale: int) -> dict[str, Any]:
    _state(rt).scale = scale
    publish_state(rt, city=False)
    return state_out(rt)


def set_frozen(rt: Runtime, ref: str, frozen: bool) -> dict[str, Any]:
    addr = resolve_venue(rt, ref)
    rt.payroll.set_venue_frozen(addr, frozen)
    (_state(rt).frozen.add if frozen else _state(rt).frozen.discard)(addr)
    publish_state(rt)
    return state_out(rt)


def reset(rt: Runtime) -> None:
    rt.payroll.reset()
    rt.payroll_state = PayrollState()
    rt.publish("payroll_updated", state_out(rt))


# ------------------------------------------------------------------ actions
def kill(rt: Runtime, member: str) -> dict[str, Any]:
    return after(rt, rt.payroll.kill_switch(member_addr(rt, member)))


def finalize(rt: Runtime) -> dict[str, Any]:
    return after(rt, rt.payroll.finalize(rt.payroll.keeper))


def execute(rt: Runtime) -> dict[str, Any]:
    return after(rt, rt.payroll.execute_payroll(rt.payroll.keeper))


# ------------------------------------------------------------------ agent + report
def _agent_run_out(rec: PayrollAgentRun, run_id: int) -> dict[str, Any]:
    return {
        "id": run_id,
        "ts": rec.ts,
        "outcome": rec.outcome,
        "actions": rec.actions,
        "steps": rec.steps,
        "reasonText": rec.reason_text,
        "reasonSource": rec.reason_source,
        "reasonHash": rec.reason_hash,
        "untrustedInput": rec.untrusted_input,
        "injectionIgnored": rec.injection_ignored,
        "facts": rec.facts,
    }


def run_agent(
    rt: Runtime, untrusted_input: str | None = None, *, llm_report: bool = False
) -> dict[str, Any]:
    """One agent round. The CFO report uses the LLM only when `llm_report` is asked for explicitly. A `Kill` decision (tighten only) is executed as an automation kill through the first
    Council member's tighten path (the port has no separate automation key)."""
    first_member = rt.snapshot().council[0].address

    def on_kill(_reason: int) -> PayrollTxResult:
        return rt.payroll.kill_switch(first_member)

    run = run_once(
        rt.payroll,
        rt.payroll.agent,
        params=DEFAULT_PARAMS,
        untrusted_input=untrusted_input,
        rt=rt if llm_report else None,
        on_kill=on_kill,
    )
    st = _state(rt)
    out = _agent_run_out(run, st.next_run_id)
    st.next_run_id += 1
    st.runs.append(out)
    del st.runs[:-MAX_RUNS]
    st.report = {
        "ts": run.ts,
        "text": run.reason_text,
        "reasonSource": run.reason_source,
        "reasonHash": run.reason_hash,
        "facts": run.facts,
    }
    publish_state(rt)
    return out


def runs_out(rt: Runtime, limit: int = 50) -> list[dict[str, Any]]:
    return _state(rt).runs[-limit:]


def report_out(rt: Runtime) -> dict[str, Any]:
    """Last report written by an agent run; else a template built from the live state. A GET never calls the
    LLM (a paid call only happens in `run_agent`)."""
    st = _state(rt)
    if st.report is not None:
        return st.report
    snap = rt.payroll.snapshot()
    facts = build_facts(snap)
    text, source, h = write_report(facts, None)
    return {"ts": snap.now, "text": text, "reasonSource": source, "reasonHash": h, "facts": facts}


# ------------------------------------------------------------------ proposals (Governor namespace)
def _describe_call(c: dict[str, Any]) -> str:
    return FN_VI.get(str(c.get("fn")), "Thay đổi luật quỹ lương")


def propose(
    rt: Runtime, member: str, title: str, calls: list[dict[str, Any]], risk_hash: str
) -> dict[str, Any]:
    res = rt.payroll.propose(member_addr(rt, member), title, calls, risk_hash)
    if not res.ok or res.proposal_id is None:
        raise ApiError(
            409,
            res.reason_code.value if res.reason_code else (res.error_raw or "REVERTED"),
            payroll_reason_text(res.reason_code) if res.reason_code else (res.error_raw or ""),
        )
    _state(rt).proposals[res.proposal_id] = {
        "title": title,
        "calls": calls,
        "proposer": member_id(rt, member_addr(rt, member)),
        "riskReportHash": risk_hash,
        "createdAt": rt.payroll.snapshot().now,
    }
    publish_state(rt)
    return proposal_out(rt, res.proposal_id)


def proposal_out(rt: Runtime, pid: int) -> dict[str, Any]:
    rec = _state(rt).proposals.get(pid)
    if rec is None:
        raise ApiError(404, "PROPOSAL_NOT_FOUND", f"Không có đề xuất quỹ lương #{pid}.")
    cp = rt.payroll.proposal_state(pid)
    return {
        "id": pid,
        "title": rec["title"],
        "proposer": rec["proposer"],
        "calls": [
            {"target": c["target"], "fn": c["fn"], "args": _jsonable(c.get("args", {}))}
            for c in rec["calls"]
        ],
        "descriptionVi": [_describe_call(c) for c in rec["calls"]],
        "riskReportHash": rec["riskReportHash"],
        "approvals": cp.approvals,
        "approvedBy": sorted(member_id(rt, a) for a in cp.approved_by),
        "threshold": THRESHOLD,
        "status": cp.status,
        "createdAt": rec["createdAt"],
    }


def list_proposals(rt: Runtime) -> list[dict[str, Any]]:
    return [proposal_out(rt, i) for i in sorted(_state(rt).proposals)]


def _decide(rt: Runtime, pid: int, res: PayrollTxResult) -> dict[str, Any]:
    if not res.ok:
        raise ApiError(
            409,
            res.reason_code.value if res.reason_code else (res.error_raw or "REVERTED"),
            res.error_raw or "Bị từ chối.",
        )
    publish_state(rt)
    return proposal_out(rt, pid)


def approve(rt: Runtime, pid: int, member: str) -> dict[str, Any]:
    proposal_out(rt, pid)  # 404 first
    return _decide(rt, pid, rt.payroll.approve(member_addr(rt, member), pid))


def cancel(rt: Runtime, pid: int, member: str) -> dict[str, Any]:
    proposal_out(rt, pid)
    return _decide(rt, pid, rt.payroll.cancel(member_addr(rt, member), pid))
