"""Draft, propose, approve (conflict-of-interest), list, executed-state sync (spec §6.5, §8.6)."""

from __future__ import annotations

from typing import Any

from guardian.chain.errors import ChainRevert
from guardian.chain.sim import SimChain
from guardian.core.errors import ApiError
from guardian.domain.snapshot import PolicySnapshot
from guardian.graph import changes as chg
from guardian.graph.findings import compute_findings
from guardian.graph.risk_report import build_risk_report, risk_report_hash
from guardian.services import views
from guardian.services.runtime import ProposalRec, Runtime

THRESHOLD = 2
CONFLICT_TEXT = (
    "Người sắp nhận thêm quyền đang ngồi Hội đồng: không được tự duyệt đề xuất "
    "này (xung đột lợi ích)."
)


def member_ids(snap: PolicySnapshot) -> list[str]:
    return [m.id for m in snap.council]


def require_member(snap: PolicySnapshot, member: str) -> str:
    if member not in member_ids(snap):
        raise ApiError(422, "UNKNOWN_MEMBER", f"Không có thành viên Hội đồng '{member}'.")
    return member


def conflicted_members(snap: PolicySnapshot, subject: str | None) -> list[str]:
    """Same rule as the contract: member bound (memberPrincipal) to the subject district."""
    return [m.id for m in snap.council if subject and m.principal_id == subject]


def make_title(snap: PolicySnapshot, change: chg.ProposedChange) -> str:
    k = change["kind"]

    def dist(pid: str) -> str:
        p = snap.principals.get(pid)
        return f"khu {p.label}" if p else f"khu {pid}"

    if k == "merge_district":
        return (
            f"Gom {len(change['keys'])} thẻ về {dist(change['into'])}, hạn mức chung "
            f"{chg.fmt_usdc(change['district_cap'])}"
        )
    if k == "set_district_cap":
        p = snap.principals.get(change["principal_id"])
        cur = p.daily_cap if p else 0
        verb = "Tăng" if change["cap"] > cur else "Đặt"
        old = f"{chg.fmt_usdc(cur)} -> " if cur else ""
        return (
            f"{verb} hạn mức chung {dist(change['principal_id'])} "
            f"{old}{chg.fmt_usdc(change['cap'])}"
        )
    if k == "set_key_cap":
        ks = snap.keys.get(change["key"])
        return f"Đặt hạn mức thẻ {ks.label if ks else change['key']} {chg.fmt_usdc(change['cap'])}"
    if k == "move_key":
        ks = snap.keys.get(change["key"])
        return f"Chuyển thẻ {ks.label if ks else change['key']} sang {dist(change['to'])}"
    return (
        f"Tạo {change['label']} do Hội đồng sở hữu, hạn mức {chg.fmt_usdc(change['district_cap'])}"
    )


def resolve_change(
    snap: PolicySnapshot, finding_id: str | None, change_raw: dict[str, Any] | None
) -> chg.ProposedChange:
    if finding_id:
        f = next((f for f in compute_findings(snap) if f["id"] == finding_id), None)
        if f is None:
            raise ApiError(404, "FINDING_NOT_FOUND", "Không có finding này (có thể đã được xử lý).")
        if not f.get("proposal"):
            raise ApiError(422, "NO_PROPOSAL", "Finding này không có đề xuất tự sinh.")
        return f["proposal"]  # type: ignore[no-any-return]
    if change_raw is None:
        raise ApiError(422, "VALIDATION_ERROR", "Cần findingId hoặc change.")
    return views.change_in(change_raw)


def build_draft(
    snap: PolicySnapshot, change: chg.ProposedChange, compromised: list[str] | None = None
) -> dict[str, Any]:
    try:
        calls = chg.to_calls(snap, change)
        report = build_risk_report(snap, change, compromised)
    except (ValueError, KeyError) as e:
        raise ApiError(422, "INVALID_CHANGE", f"Thay đổi không hợp lệ: {e}") from e
    subject = chg.subject_principal(change, snap)
    return {
        "change": change,
        "calls": calls,
        "description_vi": chg.describe_vi(calls, snap),
        "report": report,
        "hash": risk_report_hash(report),
        "subject": subject,
        "title": make_title(snap, change),
        "classification": chg.classify(change, snap),
    }


def draft_out(d: dict[str, Any], finding_id: str | None = None) -> dict[str, Any]:
    conflicted = sorted(set(d["report"]["conflictedMembers"]))
    return {
        "title": d["title"],
        "findingId": finding_id,
        "change": views.change_out(d["change"]),
        "calls": views.calls_out(d["calls"]),
        "descriptionVi": d["description_vi"],
        "riskReport": views.api_risk_report(d["report"]),
        "riskReportHash": d["hash"],
        "subjectPrincipal": d["subject"],
        "classification": d["classification"],
        "requiresCouncil": d["classification"] == "loosen",
        "conflictedMembers": conflicted,
        "warnings": (
            [{"code": "CONFLICT_OF_INTEREST", "text": CONFLICT_TEXT}] if conflicted else []
        ),
        "sent": False,
    }


def draft(
    rt: Runtime,
    finding_id: str | None,
    change_raw: dict[str, Any] | None,
    compromised: list[str] | None,
) -> dict[str, Any]:
    snap = rt.snapshot()
    change = resolve_change(snap, finding_id, change_raw)
    return draft_out(build_draft(snap, change, compromised), finding_id)


def propose(
    rt: Runtime,
    member: str,
    finding_id: str | None,
    change_raw: dict[str, Any] | None,
    title: str | None = None,
    *,
    snap: PolicySnapshot | None = None,
    report_basis: str = "live",
) -> dict[str, Any]:
    snap = snap or rt.snapshot()
    require_member(rt.snapshot(), member)
    change = resolve_change(snap, finding_id, change_raw)
    d = build_draft(snap, change)
    pid = rt.chain.propose(
        member, title or d["title"], d["subject"], views.chain_calls(d["calls"]), d["hash"]
    )
    rt.stores.proposals[pid] = ProposalRec(
        id=pid,
        title=title or d["title"],
        subject_principal=d["subject"],
        change=dict(change),
        calls=d["calls"],
        description_vi=d["description_vi"],
        risk_report=d["report"],
        risk_report_hash=d["hash"],
        proposer=member,
        created_at=rt.now(),
        finding_id=finding_id,
        report_basis=report_basis,
    )
    rt.notify_state_changed((pid,), graph=False)
    return proposal_out(rt, pid)


def approve(rt: Runtime, proposal_id: int, member: str) -> dict[str, Any]:
    snap = rt.snapshot()
    require_member(snap, member)
    rec = rt.stores.proposals.get(proposal_id)
    if rec is None:
        raise ApiError(404, "PROPOSAL_NOT_FOUND", f"Không có đề xuất #{proposal_id}.")
    res = rt.chain.approve(member, proposal_id)
    if res.status != "ok":
        if res.error_raw == "ConflictOfInterest":
            from guardian.services.runtime import ConflictRec

            rt.stores.conflicts.append(ConflictRec(rt.now(), member, proposal_id))
            rt.notify_state_changed(graph=False)
        raise ChainRevert(res.error_raw or "reverted", res.reason_code)
    cp = rt.chain.council.proposals[proposal_id]
    if cp.executed and rec.executed_at is None:
        rec.executed_at = rt.now()
        rec.executed_tx_hash = res.tx_hash
    rt.notify_state_changed((proposal_id,), graph=cp.executed)
    return proposal_out(rt, proposal_id)


def proposal_out(rt: Runtime, proposal_id: int) -> dict[str, Any]:
    rec = rt.stores.proposals[proposal_id]
    cp = rt.chain.council.proposals[proposal_id]
    snap = rt.snapshot()
    by_addr = {m.address: m.id for m in snap.council}
    approved = sorted(by_addr[a] for a in cp.approved_by)
    status = cp.status
    conflicted = sorted(
        set(conflicted_members(snap, rec.subject_principal))
        | set(rec.risk_report["conflictedMembers"])
    )
    members = []
    for m in snap.council:
        is_conf = m.id in conflicted_members(snap, rec.subject_principal)
        reason = None
        if status != "open":
            reason = "Đề xuất không còn mở."
        elif m.id in approved:
            reason = "Đã duyệt."
        elif is_conf:
            reason = (
                f"{m.label} sẽ nhận thêm quyền ở khu này nên không được duyệt (xung đột lợi ích)."
            )
        members.append(
            {
                "id": m.id,
                "label": m.label,
                "principalId": m.principal_id,
                "approved": m.id in approved,
                "conflicted": is_conf,
                "canApprove": reason is None,
                "disabledReason": reason,
            }
        )
    return {
        "id": rec.id,
        "title": rec.title,
        "status": status,
        "subjectPrincipal": rec.subject_principal,
        "proposer": rec.proposer,
        "approvals": approved,
        "approvalCount": cp.approvals,
        "threshold": THRESHOLD,
        "members": members,
        "conflictedMembers": conflicted,
        "change": views.change_out(rec.change) if rec.change else None,  # type: ignore[arg-type]
        "calls": views.calls_out(rec.calls),
        "descriptionVi": rec.description_vi,
        "riskReport": views.api_risk_report(rec.risk_report),
        "riskReportHash": rec.risk_report_hash,
        "reportBasis": rec.report_basis,
        "warnings": (
            [{"code": "CONFLICT_OF_INTEREST", "text": CONFLICT_TEXT}] if conflicted else []
        ),
        "findingId": rec.finding_id,
        "createdAt": rec.created_at,
        "executedAt": rec.executed_at,
        "executedTxHash": rec.executed_tx_hash,
    }


def list_proposals(rt: Runtime) -> list[dict[str, Any]]:
    return [proposal_out(rt, i) for i in sorted(rt.stores.proposals, reverse=True)]


def reference_v2_snapshot() -> PolicySnapshot:
    """Clean policy-v2 state (no spend): the baseline the seeded request #12 is evaluated on."""
    ref = SimChain()
    ref.apply_policy_v2()
    return ref.snapshot()
