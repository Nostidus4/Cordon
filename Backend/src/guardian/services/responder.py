"""Incident responder (docs/spec/CITY_OPS.md §4): detect -> contain (tighten only) -> ask the Council -> verify.

Two layers:

* Pure detection rules (`detect_*`, `quiet_since`, `pick_member`): plain data in, plain data out, no chain, no
  clock. They are the part that is unit-tested rule by rule.
* The orchestrator (`react`): reads the stores/snapshot, runs the rules, creates incidents and advances their
  lifecycle `detected -> contained -> awaiting_council -> recovering -> resolved`.

Hard rule of the product: automation may only TIGHTEN. The only chain writes made here are the tightening ones
(`emergency_lock`, `emergency_pause`-class `lower_key_cap(key, 0)`) and `propose` (a request to the Council). Loosening
(unlock, unpause, restoring a cap, re-enabling a key) happens only when the Council executes the proposal; this
module never calls `approve`.

Containment signs with a Council member's demo key who is NOT in the affected district, so it needs DEMO_MODE
(`Settings.auto_contain_enabled`). Without it the responder only detects and suggests (steps stay `pending`).
Scenario runs (attempts with a `scenario_run_id`) are the scripted scene 4: the human lock is the point of the
scene, so the responder ignores them.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from guardian.chain.base import TxResult
from guardian.core.errors import ApiError
from guardian.domain.snapshot import PolicySnapshot
from guardian.services import proposal_service as ps
from guardian.services.city_state import ATTEMPT_WINDOW_S
from guardian.services.runtime import IncidentRec
from guardian.shared.reason_codes import ReasonCode

if TYPE_CHECKING:
    from guardian.services.runtime import Runtime

log = logging.getLogger("guardian.responder")

AGENT_SEED = "key_agent_rebalance"
MIN_BLOCKED_ATTEMPTS = 2
TRIGGER_REASONS = frozenset(
    {
        ReasonCode.RECIPIENT_NOT_ALLOWED.value,
        ReasonCode.PROTOCOL_NOT_ALLOWED.value,
        ReasonCode.DISTRICT_DAILY_CAP.value,
        ReasonCode.CARD_DAILY_CAP.value,
    }
)
CAP_REASONS = frozenset({ReasonCode.DISTRICT_DAILY_CAP.value, ReasonCode.CARD_DAILY_CAP.value})
QUIET_WINDOW_S = 30  # recovering -> resolved after this long with no new blocked attempt (short so a live demo sees the loop close)
MAX_RETRIES = 3

OPEN_STATUSES = ("detected", "contained", "awaiting_council")
STEP_LABELS = {
    "detect": "Phát hiện",
    "contain": "Tự khoanh vùng",
    "propose": "Xin Hội đồng duyệt",
    "recover": "Hồi phục",
    "verify": "Kiểm tra lại",
}


# ====================================================================== pure detection rules
@dataclass(frozen=True)
class AttemptFacts:
    id: int
    ts: int
    signer: str  # seed id
    key: str | None  # key address
    principal_id: str | None
    action: str
    outcome: str
    reason_code: str | None
    scenario_run_id: str | None = None


@dataclass(frozen=True)
class Detection:
    kind: str  # attempts | agent | conflict | assistant | paused
    building: str
    title_vi: str
    detail_vi: str
    principal_id: str | None = None
    key: str | None = None
    key_seed: str | None = None
    reason_code: str | None = None
    attempt_ids: tuple[int, ...] = ()
    extra: dict[str, Any] = field(default_factory=dict)


def is_blocked_trigger(a: AttemptFacts) -> bool:
    return a.outcome != "ok" and a.reason_code in TRIGGER_REASONS and a.scenario_run_id is None


def detect_blocked_attempts(
    attempts: Sequence[AttemptFacts],
    consumed: set[int],
    now: int,
    *,
    labels: dict[str, str] | None = None,
    window_s: int = ATTEMPT_WINDOW_S,
    min_blocked: int = MIN_BLOCKED_ATTEMPTS,
) -> list[Detection]:
    """Rule 1: a district with >= `min_blocked` blocked attempts (RECIPIENT/PROTOCOL_NOT_ALLOWED,
    DISTRICT/CARD_DAILY_CAP) inside `window_s`. The spec says "one key"; keys are grouped by their district because
    the scene-4 attack uses several keys of one district, so the same-key case is a subset.

    Building: attempts from >= 2 distinct keys = a leaked key being tried everywhere -> B05; one key hitting caps ->
    B04; one key hitting the allow-lists -> B03. The subject key is the one with most blocked attempts (the latest on
    a tie)."""
    labels = labels or {}
    by_district: dict[str, list[AttemptFacts]] = {}
    for a in attempts:
        if (
            a.id not in consumed
            and is_blocked_trigger(a)
            and a.principal_id
            and now - a.ts <= window_s
        ):
            by_district.setdefault(a.principal_id, []).append(a)
    out: list[Detection] = []
    for pid, items in by_district.items():
        if len(items) < min_blocked:
            continue
        keys = [a.key for a in items if a.key]
        subject = max(
            dict.fromkeys(keys), key=lambda k: (keys.count(k), len(keys) - keys[::-1].index(k))
        )
        subj_attempt = next(a for a in reversed(items) if a.key == subject)
        reasons = {a.reason_code for a in items}
        district = labels.get(pid, pid)
        if len(set(keys)) >= 2:
            building = "B05"
            title = f"Khoá của khu {district} có dấu hiệu bị lộ"
        elif reasons <= CAP_REASONS:
            building = "B04"
            title = f"Khu {district} liên tục chi vượt hạn mức"
        elif ReasonCode.PROTOCOL_NOT_ALLOWED.value in reasons:
            building = "B03"
            title = f"Khu {district} liên tục dùng sàn chưa được duyệt"
        else:
            building = "B03"
            title = f"Khu {district} liên tục chuyển tiền tới ví chưa duyệt"
        out.append(
            Detection(
                "attempts",
                building,
                title,
                f"{len(items)} lần thử bị chặn trong {window_s // 60} phút "
                f"({', '.join(sorted(r for r in reasons if r))}).",
                principal_id=pid,
                key=subject,
                key_seed=subj_attempt.signer,
                reason_code=items[-1].reason_code,
                attempt_ids=tuple(a.id for a in items),
            )
        )
    return out


def detect_agent_pay(
    attempts: Sequence[AttemptFacts],
    consumed: set[int],
    now: int,
    *,
    agent_seed: str = AGENT_SEED,
    labels: dict[str, str] | None = None,
    window_s: int = ATTEMPT_WINDOW_S,
) -> list[Detection]:
    """Rule 2a (B06): the rebalance agent's key tried to `pay` to a wallet outside the allow-list."""
    labels = labels or {}
    hits = [
        a
        for a in attempts
        if a.id not in consumed
        and a.signer == agent_seed
        and a.action == "pay"
        and a.outcome != "ok"
        and a.reason_code == ReasonCode.RECIPIENT_NOT_ALLOWED.value
        and a.scenario_run_id is None
        and now - a.ts <= window_s
    ]
    if not hits:
        return []
    return [
        Detection(
            "agent",
            "B06",
            "Agent cân đối bị ép chuyển tiền ra ví lạ",
            f"Khoá của agent thử chuyển tiền tới ví chưa duyệt ({len(hits)} lần).",
            principal_id=hits[-1].principal_id,
            key=hits[-1].key,
            key_seed=agent_seed,
            reason_code=ReasonCode.RECIPIENT_NOT_ALLOWED.value,
            attempt_ids=tuple(a.id for a in hits),
        )
    ]


def detect_untrusted_agent_runs(
    runs: Iterable[tuple[int, str | None]], consumed_run_ids: set[int]
) -> list[Detection]:
    """Rule 2b (B06): an agent run was fed untrusted text (`runs` = (run id, untrusted input))."""
    return [
        Detection(
            "agent",
            "B06",
            "Agent cân đối nhận văn bản lạ có lệnh chuyển tiền",
            "Văn bản lạ được nạp vào agent; rule engine không đọc nó, nhưng khoá agent bị siết để chắc chắn.",
            key_seed=AGENT_SEED,
            extra={"agentRunId": rid},
        )
        for rid, text in runs
        if text and rid not in consumed_run_ids
    ]


def detect_conflicts(
    conflicts: Sequence[tuple[str, int]], consumed_indexes: set[int]
) -> list[tuple[int, Detection]]:
    """Rule 3 (B01): a Council approval was refused for conflict of interest. `conflicts` = (member, proposal id)
    in store order; returns (index, detection)."""
    return [
        (
            i,
            Detection(
                "conflict",
                "B01",
                f"Thành viên {member} tự duyệt đề xuất của chính khu mình",
                f"Hợp đồng chặn lần duyệt của {member} cho đề xuất #{pid}: xung đột lợi ích.",
                reason_code="CONFLICT_OF_INTEREST",
                extra={"proposalId": pid, "conflictIndex": i},
            ),
        )
        for i, (member, pid) in enumerate(conflicts)
        if i not in consumed_indexes
    ]


def detect_unverified_answers(
    logs: Iterable[tuple[int, bool]], consumed_ids: set[int]
) -> list[Detection]:
    """Rule 4 (B02): an assistant answer with numbers the verifier could not confirm. `logs` = (id, verified)."""
    return [
        Detection(
            "assistant",
            "B02",
            "Trợ lý trả lời số liệu chưa kiểm chứng",
            f"Câu trả lời #{lid} có số liệu không kiểm chứng được.",
            extra={"assistantLogId": lid},
        )
        for lid, verified in logs
        if not verified and lid not in consumed_ids
    ]


def detect_paused(paused: bool, has_open_paused_incident: bool) -> list[Detection]:
    """Rule 5 (B03): the whole vault is paused."""
    if not paused or has_open_paused_incident:
        return []
    return [
        Detection(
            "paused",
            "B03",
            "Cả kho tiền đang bị dừng",
            "Kho đang ở trạng thái dừng khẩn cấp; mở lại cần Hội đồng 2/3.",
            reason_code=ReasonCode.VAULT_PAUSED.value,
        )
    ]


def pick_member(snap: PolicySnapshot, avoid_principals: Iterable[str | None]) -> str | None:
    """First Council member (store order) who is not bound to any affected district."""
    avoid = {p for p in avoid_principals if p}
    return next((m.id for m in snap.council if m.principal_id not in avoid), None)


def quiet_since(recovering_since: int, blocked_after: Iterable[int]) -> int:
    """Start of the current quiet period: the later of 'recovery began' and the last NEW blocked attempt."""
    return max([recovering_since, *blocked_after])


# ====================================================================== incident output
def incident_out(inc: IncidentRec) -> dict[str, Any]:
    t = inc.trigger
    return {
        "id": inc.id,
        "building": inc.building,
        "faultId": inc.fault_id,
        "titleVi": inc.title_vi,
        "status": inc.status,
        "openedAt": inc.opened_at,
        "resolvedAt": inc.resolved_at,
        "subject": {"principalId": inc.principal_id, "key": inc.key},
        "trigger": {
            "reasonCode": t.get("reasonCode"),
            "attemptIds": list(t.get("attemptIds", [])),
            "agentRunId": t.get("agentRunId"),
            "assistantLogId": t.get("assistantLogId"),
            "proposalId": t.get("proposalId"),
        },
        "steps": [dict(s) for s in inc.steps],
        "proposalId": inc.proposal_id,
    }


def list_incidents(rt: Runtime, status: str = "all") -> list[dict[str, Any]]:
    items = [i for i in rt.stores.incidents if status != "open" or i.status != "resolved"]
    return [incident_out(i) for i in sorted(items, key=lambda i: i.id, reverse=True)]


def get_incident(rt: Runtime, incident_id: int) -> dict[str, Any]:
    inc = next((i for i in rt.stores.incidents if i.id == incident_id), None)
    if inc is None:
        raise ApiError(404, "INCIDENT_NOT_FOUND", f"Không có sự cố #{incident_id}.")
    return incident_out(inc)


# ====================================================================== orchestrator
@dataclass
class ReactResult:
    changed: bool = False  # an incident was created or moved: the city may look different
    chain_touched: bool = False  # a tx was sent: graph version bump needed


def _set_step(
    inc: IncidentRec,
    key: str,
    status: str,
    detail: str | None = None,
    *,
    ts: int | None = None,
    tx_hash: str | None = None,
) -> None:
    for s in inc.steps:
        if s["key"] == key:
            s["status"] = status
            if detail is not None:
                s["detailVi"] = detail
            if ts is not None:
                s["ts"] = ts
            if tx_hash is not None:
                s["txHash"] = tx_hash
            return
    raise KeyError(key)


def _new_steps(now: int, detail: str) -> list[dict[str, Any]]:
    steps = [
        {
            "key": k,
            "labelVi": label,
            "status": "pending",
            "ts": None,
            "detailVi": "",
            "txHash": None,
        }
        for k, label in STEP_LABELS.items()
    ]
    steps[0].update(status="done", ts=now, detailVi=detail)
    return steps


def _attempt_facts(rt: Runtime) -> list[AttemptFacts]:
    keys = {k.seed_id: k.address for k in rt.snapshot().keys.values()}
    return [
        AttemptFacts(
            a.id,
            a.ts,
            a.signer,
            keys.get(a.signer),
            a.principal_id,
            a.action,
            a.outcome,
            a.reason_code,
            a.scenario_run_id,
        )
        for a in rt.stores.attempts
    ]


def _consumed(rt: Runtime) -> tuple[set[int], set[int], set[int], set[int]]:
    """(attempt ids, agent run ids, assistant log ids, conflict indexes) already tied to an incident."""
    att: set[int] = set()
    runs: set[int] = set()
    logs: set[int] = set()
    conf: set[int] = set()
    for i in rt.stores.incidents:
        att.update(i.trigger.get("attemptIds", ()))
        for key, bucket in (
            ("agentRunId", runs),
            ("assistantLogId", logs),
            ("conflictIndex", conf),
        ):
            if i.trigger.get(key) is not None:
                bucket.add(i.trigger[key])
    return att, runs, logs, conf


def _publish(rt: Runtime, inc: IncidentRec) -> None:
    rt.publish("incident_updated", incident_out(inc))


def _open(rt: Runtime, det: Detection) -> IncidentRec:
    now = rt.now()
    trigger: dict[str, Any] = {"reasonCode": det.reason_code, "attemptIds": list(det.attempt_ids)}
    trigger.update(det.extra)
    key, pid = det.key, det.principal_id
    if key is None and det.key_seed:
        ks = next((k for k in rt.snapshot().keys.values() if k.seed_id == det.key_seed), None)
        if ks is not None:
            key, pid = ks.address, ks.principal_id
    inc = IncidentRec(
        id=rt.stores.next_incident_id(),
        building=det.building,
        title_vi=det.title_vi,
        status="detected",
        opened_at=now,
        kind=det.kind,
        principal_id=pid,
        key=key,
        trigger=trigger,
        steps=_new_steps(now, det.detail_vi),
        internal={"key_seed": det.key_seed, "retries": 0},
    )
    rt.stores.incidents.append(inc)
    log.info("incident %s opened: %s (%s)", inc.id, inc.title_vi, inc.building)
    return inc


def _group_key(inc: IncidentRec | Detection) -> tuple[str, str | None]:
    """One open incident per district (attempts), per agent, per vault pause."""
    return inc.kind, inc.principal_id if inc.kind == "attempts" else None


def react(rt: Runtime) -> ReactResult:
    """Run the responder once; idempotent, not re-entrant. Called from `Runtime.responder_tick` (state changes,
    the ticker, chain events)."""
    res = ReactResult()
    if not rt.settings.responder_enabled or rt._in_responder:
        return res
    rt._in_responder = True
    try:
        _react(rt, res)
    finally:
        rt._in_responder = False
    return res


def _react(rt: Runtime, res: ReactResult) -> None:
    now = rt.now()
    snap = rt.snapshot()
    labels = {pid: p.label for pid, p in snap.principals.items()}
    c_att, c_runs, c_logs, c_conf = _consumed(rt)
    facts = _attempt_facts(rt)
    fresh: list[Detection] = []
    fresh += detect_agent_pay(facts, c_att, now, labels=labels)
    fresh += detect_untrusted_agent_runs(
        ((r.id, r.untrusted_input) for r in rt.stores.agent_runs), c_runs
    )
    # attempts consumed by the agent rule must not count again in the district rule
    taken = c_att | {i for d in fresh for i in d.attempt_ids}
    fresh += detect_blocked_attempts(facts, taken, now, labels=labels)
    fresh += [
        d
        for _, d in detect_conflicts(
            [(c.member, c.proposal_id) for c in rt.stores.conflicts], c_conf
        )
    ]
    fresh += detect_unverified_answers(
        ((lg.id, lg.numbers_verified) for lg in rt.stores.assistant_logs), c_logs
    )
    has_open_pause = any(i.kind == "paused" and i.status != "resolved" for i in rt.stores.incidents)
    fresh += detect_paused(snap.paused, has_open_pause)

    for det in fresh:
        existing = next(
            (
                i
                for i in rt.stores.incidents
                if i.status != "resolved"
                and det.kind in ("attempts", "agent")
                and _group_key(i) == _group_key(det)
            ),
            None,
        )
        if existing is not None:
            # same district / agent already has an incident: fold new attempts in while it is still open;
            # while recovering they stay unconsumed and push the quiet period back (see _verify)
            if existing.status in OPEN_STATUSES:
                ids = existing.trigger.setdefault("attemptIds", [])
                new = [i for i in det.attempt_ids if i not in ids]
                if new:
                    ids.extend(new)
                    res.changed = True
                    _publish(rt, existing)
                for k in ("agentRunId",):
                    if det.extra.get(k) is not None and existing.trigger.get(k) is None:
                        existing.trigger[k] = det.extra[k]
                        res.changed = True
                        _publish(rt, existing)
            continue
        inc = _open(rt, det)
        _publish(rt, inc)
        res.changed = True

    for inc in list(rt.stores.incidents):
        if inc.status == "resolved":
            continue
        if _advance(rt, inc, res):
            res.changed = True
            _publish(rt, inc)


def _signature(inc: IncidentRec) -> tuple[Any, ...]:
    return (inc.status, inc.proposal_id, tuple((x["status"], x["detailVi"]) for x in inc.steps))


def _advance(rt: Runtime, inc: IncidentRec, res: ReactResult) -> bool:
    """Move one incident as far as it can go right now. Returns True when anything changed."""
    changed = False
    for _ in range(8):
        before = _signature(inc)
        _step_once(rt, inc, res)
        if _signature(inc) == before:
            break
        changed = True
    return changed


def _step_once(rt: Runtime, inc: IncidentRec, res: ReactResult) -> None:
    if inc.kind in ("conflict", "assistant"):
        _close_immediately(rt, inc)
    elif (
        inc.kind == "paused"
        and inc.status in ("detected", "contained", "awaiting_council")
        and not rt.snapshot().paused
    ):
        # someone reopened the vault by another route (not our proposal): nothing left to ask the Council
        _set_step(inc, "propose", "skipped", "Kho đã được mở lại.")
        _set_step(inc, "recover", "done", "Kho đã mở lại.", ts=rt.now())
        _set_step(inc, "verify", "active", "Đang kiểm tra lại.")
        inc.internal["recovering_since"] = rt.now()
        inc.status = "recovering"
    elif inc.status == "detected":
        _contain(rt, inc, res)
    elif inc.status == "contained":
        _propose(rt, inc, res)
    elif inc.status == "awaiting_council":
        _watch_proposal(rt, inc, res)
    elif inc.status == "recovering":
        _verify(rt, inc)


def _close_immediately(rt: Runtime, inc: IncidentRec) -> None:
    """B01 / B02: nothing on chain to fix; record, mark, close (CITY_OPS §4.2)."""
    now = rt.now()
    if inc.kind == "assistant":
        lid = inc.trigger.get("assistantLogId")
        for lg in rt.stores.assistant_logs:
            if lg.id == lid:
                lg.flagged_untrusted = True
        _set_step(inc, "contain", "done", "Đã đánh dấu câu trả lời là không tin cậy.", ts=now)
    else:
        _set_step(inc, "contain", "skipped", "Hợp đồng đã tự chặn lần duyệt này.")
    _set_step(inc, "propose", "skipped", "Không cần đề xuất.")
    _set_step(inc, "recover", "skipped", "Không có gì cần hồi phục.")
    _set_step(inc, "verify", "done", "Đã ghi nhận, sự cố tự đóng.", ts=now)
    inc.status, inc.resolved_at = "resolved", now


def _fail(inc: IncidentRec, step: str, why: str) -> None:
    inc.internal["retries"] = inc.internal.get("retries", 0) + 1
    _set_step(inc, step, "pending", why)


def _contain(rt: Runtime, inc: IncidentRec, res: ReactResult) -> None:
    now = rt.now()
    snap = rt.snapshot()
    if inc.kind == "paused":
        # the vault is already stopped: that IS the containment, nothing to sign
        _set_step(inc, "contain", "done", "Kho đã dừng sẵn, không phải ký thêm.", ts=now)
        inc.status = "contained"
        return
    if inc.kind == "attempts":
        p = snap.principals.get(inc.principal_id or "")
        label = p.label if p else inc.principal_id
        suggestion = f"Gợi ý: khoá khu {label}."
        if p is not None and p.locked:
            _set_step(inc, "contain", "done", f"Khu {label} đã được khoá sẵn.", ts=now)
            inc.status = "contained"
            return
    else:  # agent
        ks = snap.keys.get(inc.key or "")
        suggestion = "Gợi ý: hạ hạn mức thẻ của agent về 0."
        if ks is None:
            _set_step(inc, "contain", "skipped", "Không tìm thấy khoá của agent.")
            return
        if ks.daily_cap == 0:
            _set_step(inc, "contain", "done", "Hạn mức thẻ của agent đã bằng 0.", ts=now)
            inc.status = "contained"
            return
    if not rt.settings.auto_contain_enabled:
        _set_step(inc, "contain", "pending", f"Chế độ chỉ phát hiện. {suggestion}")
        return
    if inc.internal.get("retries", 0) >= MAX_RETRIES:
        return
    member = pick_member(snap, [inc.principal_id])
    if member is None:
        _fail(inc, "contain", "Không có thành viên Hội đồng nằm ngoài khu bị ảnh hưởng.")
        return
    inc.internal["member"] = member
    if inc.kind == "attempts":
        tx: TxResult = rt.chain.emergency_lock(member, inc.principal_id or "")
        what = f"Khoá khu {label}"
    else:
        ks = snap.keys[inc.key or ""]
        inc.internal["old_key_cap"] = ks.daily_cap
        tx = rt.chain.lower_key_cap(member, ks.address, 0)
        what = f"Hạ hạn mức thẻ {ks.label} về 0"
    res.chain_touched = True
    if tx.status != "ok":
        _fail(
            inc,
            "contain",
            f"{what} chưa được: {tx.reason_code.value if tx.reason_code else tx.error_raw}.",
        )
        return
    _set_step(inc, "contain", "done", f"{what} (ký bởi {member}).", ts=rt.now(), tx_hash=tx.tx_hash)
    inc.status = "contained"


def _fix_calls(rt: Runtime, inc: IncidentRec) -> tuple[list[dict[str, Any]], str | None, str]:
    """(calls in graph vocabulary, subject district, detail) of the fix proposal."""
    snap = rt.snapshot()
    bump = {"target": "vault", "fn": "bumpPolicyVersion", "args": {}}
    if inc.kind == "paused":
        return [{"target": "vault", "fn": "unpauseAll", "args": {}}, bump], None, "mở lại cả kho"
    if inc.kind == "agent":
        old = int(inc.internal.get("old_key_cap") or 0)
        ks = snap.keys[inc.key or ""]
        return (
            [
                {
                    "target": "vault",
                    "fn": "setKeyDailyCap",
                    "args": {"key": ks.address, "cap": str(old)},
                },
                bump,
            ],
            ks.principal_id,
            "trả lại hạn mức thẻ cho agent",
        )
    calls: list[dict[str, Any]] = []
    detail = "mở lại khu"
    ks = snap.keys.get(inc.key or "")
    if ks is not None and ks.active:
        calls.append({"target": "registry", "fn": "deactivateKey", "args": {"key": ks.address}})
        inc.internal["deactivate_key"] = True
        detail = "tắt khoá nghi bị lộ, mở lại khu"
    calls.append(
        {"target": "vault", "fn": "unlockPrincipal", "args": {"principalId": inc.principal_id}}
    )
    calls.append(bump)
    return calls, inc.principal_id, detail


def _propose(rt: Runtime, inc: IncidentRec, res: ReactResult) -> None:
    if not rt.settings.auto_contain_enabled:
        _set_step(
            inc, "propose", "pending", "Chế độ chỉ phát hiện: chưa soạn đề xuất cho Hội đồng."
        )
        return
    if inc.internal.get("retries", 0) >= MAX_RETRIES:
        return
    snap = rt.snapshot()
    calls, subject, what = _fix_calls(rt, inc)
    member = inc.internal.get("member") or pick_member(snap, [subject, inc.principal_id])
    if member is None:
        _fail(inc, "propose", "Không có thành viên Hội đồng để gửi đề xuất.")
        return
    title = f"Sự cố #{inc.id}: {what}"
    try:
        out = ps.propose_calls(rt, member, title, subject, calls)
    except Exception as e:
        log.exception("responder could not propose for incident %s", inc.id)
        _fail(inc, "propose", f"Chưa gửi được đề xuất: {e}")
        return
    inc.proposal_id = out["id"]
    inc.status = "awaiting_council"
    _set_step(inc, "propose", "active", f"Đề xuất #{out['id']}: {what}.", ts=rt.now())
    res.chain_touched = True


def _watch_proposal(rt: Runtime, inc: IncidentRec, res: ReactResult) -> None:
    pid = inc.proposal_id
    if pid is None:
        inc.status = "contained"
        return
    try:
        cp = rt.chain.proposal_state(pid)
    except KeyError:
        return
    if cp.executed:
        rec = rt.stores.proposals.get(pid)
        now = rt.now()
        at = rec.executed_at if rec and rec.executed_at else now
        inc.internal["recovering_since"] = at
        _set_step(inc, "propose", "done", f"Hội đồng đã duyệt đề xuất #{pid}.")
        _set_step(
            inc,
            "recover",
            "done",
            "Đề xuất đã được thực hiện.",
            ts=at,
            tx_hash=rec.executed_tx_hash if rec else None,
        )
        _set_step(inc, "verify", "active", "Đang kiểm tra lại, chờ yên ổn.")
        inc.status = "recovering"
    elif cp.cancelled:
        _set_step(inc, "propose", "pending", f"Đề xuất #{pid} đã bị huỷ, soạn lại.")
        inc.proposal_id = None
        inc.status = "contained"
        inc.internal["retries"] = inc.internal.get("retries", 0) + 1


def _recovered(rt: Runtime, inc: IncidentRec) -> bool:
    snap = rt.snapshot()
    if inc.kind == "paused":
        return not snap.paused
    ks = snap.keys.get(inc.key or "")
    if inc.kind == "agent":
        return ks is not None and ks.daily_cap >= int(inc.internal.get("old_key_cap") or 0)
    p = snap.principals.get(inc.principal_id or "")
    key_ok = not inc.internal.get("deactivate_key") or ks is None or not ks.active
    return (p is None or not p.locked) and key_ok


def _verify(rt: Runtime, inc: IncidentRec) -> None:
    now = rt.now()
    since = inc.internal.get("recovering_since", now)
    own = set(inc.trigger.get("attemptIds", ()))
    newer = [
        a.ts
        for a in rt.stores.attempts
        if a.id not in own
        and a.ts >= since
        and a.outcome != "ok"
        and a.reason_code in TRIGGER_REASONS
        and a.scenario_run_id is None
        and (inc.kind != "attempts" or a.principal_id == inc.principal_id)
    ]
    start = quiet_since(since, newer)
    if not _recovered(rt, inc):
        _set_step(inc, "verify", "active", "Trạng thái chưa trở lại như trước sự cố.")
        return
    if now - start < QUIET_WINDOW_S:
        _set_step(
            inc,
            "verify",
            "active",
            f"Đang kiểm tra lại: cần {QUIET_WINDOW_S} giây yên ổn, không có lần thử bị chặn mới.",
        )
        return
    _set_step(
        inc, "verify", "done", "Đã kiểm tra lại: ổn định, không có lần thử bị chặn mới.", ts=now
    )
    inc.status, inc.resolved_at = "resolved", now


def tag_fault(rt: Runtime, fault_id: str, since_incident_id: int) -> list[IncidentRec]:
    """Mark incidents opened by a fault injection (id > `since_incident_id`) with the fault id."""
    tagged = [i for i in rt.stores.incidents if i.id > since_incident_id and i.fault_id is None]
    for i in tagged:
        i.fault_id = fault_id
        _publish(rt, i)
    return tagged
