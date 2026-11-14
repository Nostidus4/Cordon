"""L1: rebuild the proposal records from the Council after an API restart (no Postgres, or an empty store).

The Council keeps everything a proposal record needs except the risk report body and the `change` the API
was given. `getProposal` gives title, subject, proposer, calls and the report hash; the live status (approvals,
queued, vetoed) is always read from the chain by `proposal_service.proposal_out`, so it is right by
construction. Records already in the store win and are never overwritten.
"""

from __future__ import annotations

import logging
from typing import Any

from guardian.graph import changes as chg
from guardian.graph.simulate import simulate_compromise
from guardian.services.runtime import ProposalRec, Runtime

log = logging.getLogger("guardian.proposal_rebuild")
REBUILT_BASIS = "rebuilt_from_chain"


def infer_change(calls: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The `ProposedChange` that `graph.changes.to_calls` would have turned into these calls, or None."""
    body = [c for c in calls if c["fn"] != "bumpPolicyVersion"]
    if not body or any(c["target"] not in ("registry", "vault") for c in body):
        return None
    moves = [c for c in body if c["fn"] == "moveKey"]
    caps = [c for c in body if c["fn"] == "setPrincipalDailyCap"]
    creates = [c for c in body if c["fn"] == "createPrincipal"]
    if len(moves) + len(caps) + len(creates) != len(body) or len(caps) > 1 or len(creates) > 1:
        return None
    if creates:
        c, cap = creates[0]["args"], caps[0]["args"] if caps else None
        pid = c["id"]
        ok = cap is not None and cap["principalId"] == pid and body[0] is creates[0]
        if not ok or any(m["args"]["toId"] != pid for m in moves):
            return None
        return {
            "kind": "create_district",
            "principal_id": pid,
            "label": c["label"],
            "owner": "council",
            "keys": [m["args"]["key"] for m in moves],
            "district_cap": int(cap["cap"]),  # type: ignore[index]
        }
    if caps and moves:
        into = caps[0]["args"]["principalId"]
        if any(m["args"]["toId"] != into for m in moves):
            return None
        return {
            "kind": "merge_district",
            "into": into,
            "keys": [m["args"]["key"] for m in moves],
            "district_cap": int(caps[0]["args"]["cap"]),
        }
    if caps:
        return {
            "kind": "set_district_cap",
            "principal_id": caps[0]["args"]["principalId"],
            "cap": int(caps[0]["args"]["cap"]),
        }
    if len(moves) == 1:
        return {"kind": "move_key", "key": moves[0]["args"]["key"], "to": moves[0]["args"]["toId"]}
    kcaps = [c for c in body if c["fn"] == "setKeyDailyCap"]
    if len(kcaps) == 1 and len(body) == 1:
        return {
            "kind": "set_key_cap",
            "key": kcaps[0]["args"]["key"],
            "cap": int(kcaps[0]["args"]["cap"]),
        }
    return None


def _executed_events(rt: Runtime) -> dict[int, tuple[int, str]]:
    """proposal id -> (ts, tx hash) of the current Council's `Executed` events (kept in `event_log`)."""
    first = int(rt.chain.dep.deploy_block)
    out: dict[int, tuple[int, str]] = {}
    for ev in rt.event_log:
        if ev.name == "Executed" and ev.block >= first:
            out[int(ev.payload["id"])] = (ev.ts, ev.tx_hash)
    return out


def rebuild_from_chain(rt: Runtime) -> list[int]:
    """Add a `ProposalRec` for every Council proposal the store lacks. Returns the ids added.

    A proposal cancelled by its proposer with no approval is skipped: the demo-reset script fills the counter
    with such placeholders (ids 1..11) and they are noise on the board. Never raises: a failed read is logged."""
    if not rt.is_l1:
        return []
    added: list[int] = []
    try:
        count = rt.chain.proposal_count()
    except Exception:
        log.exception("cannot read the Council proposal count; proposals not rebuilt")
        return []
    snap = rt.snapshot()
    by_addr = {m.address: m.id for m in snap.council}
    executed = _executed_events(rt)
    for pid in range(1, count + 1):
        if rt.stores.proposals.get(pid) is not None:
            continue
        try:
            head = rt.chain.proposal_header(pid)
            state = rt.chain.proposal_state(pid)
        except Exception:
            log.exception("cannot rebuild proposal #%s", pid)
            continue
        if state.cancelled and state.approvals == 0 and state.vetoed_by is None:
            continue
        calls = [*head["calls"], {"target": "vault", "fn": "bumpPolicyVersion", "args": {}}]
        change = infer_change(calls)
        subject = head["subject_principal"]
        sim = simulate_compromise(snap, [subject] if subject else [])
        conflicted = sorted({m.id for m in snap.council if subject and m.principal_id == subject})
        report = {
            "before": sim["totals"],
            "after": sim["totals"],
            "findingsBefore": [],
            "findingsAfter": [],
            "conflictOfInterest": bool(conflicted),
            "conflictedMembers": conflicted,
            "subjectPrincipal": subject,
            "generatedAt": _iso(head["created_at"]),
            "graphVersion": snap.policy_version,
        }
        ex = executed.get(pid) if state.executed else None
        rt.stores.proposals.add(
            ProposalRec(
                id=pid,
                title=head["title"],
                subject_principal=subject,
                change=change,
                calls=calls,
                description_vi=chg.describe_vi(calls, snap),
                risk_report=report,
                risk_report_hash=head["risk_report_hash"],
                proposer=by_addr.get(head["proposer"], head["proposer"]),
                created_at=head["created_at"],
                report_basis=REBUILT_BASIS,
                executed_at=ex[0] if ex else (head["created_at"] if state.executed else None),
                executed_tx_hash=ex[1] if ex else None,
            )
        )
        added.append(pid)
    if added:
        log.info("rebuilt proposals %s from the Council", added)
    return added


def _iso(ts: int) -> str:
    from datetime import UTC, datetime

    return datetime.fromtimestamp(ts, UTC).isoformat(timespec="seconds")
