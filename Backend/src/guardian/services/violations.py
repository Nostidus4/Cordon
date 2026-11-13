"""Violations board (CITY-005): every refused call, derived from the recorded attempts (no separate list).

An attempt is a violation when it did not go through (`reverted`, `blocked_at_protocol`, or `blocked` = the
simulate said no and nothing was sent) and carries a reason code. The code is copied, never recomputed, so it
equals what the chain returned.
"""

from __future__ import annotations

from typing import Any

from guardian.services.runtime import AttemptRec, Runtime

_ACTION = {"raw_call": "raw"}


def _source(rt: Runtime, a: AttemptRec) -> str:
    if a.source == "agent":
        return "agent"
    if a.id in rt.stores.fault_attempts:
        return "fault"
    if a.source == "external" or a.scenario_run_id is not None:
        return "attacker"
    if a.source == "copilot":
        return "copilot"
    return "other"


def tag_fault(rt: Runtime, fault_id: str, after_attempt_id: int) -> None:
    """Mark the attempts a fault injection created (id > `after_attempt_id`)."""
    for a in rt.stores.attempts.all():
        if a.id > after_attempt_id:
            rt.stores.fault_attempts[a.id] = fault_id


def violation_out(rt: Runtime, a: AttemptRec) -> dict[str, Any]:
    p = rt.snapshot().principals.get(a.principal_id) if a.principal_id else None
    return {
        "id": a.id,
        "ts": a.ts,
        "source": _source(rt, a),
        "key": a.signer,
        "keyLabel": a.signer_label,
        "principalId": a.principal_id,
        "district": p.label if p else None,
        "action": _ACTION.get(a.action, a.action),
        "reasonCode": a.reason_code,
        "txHash": a.tx_hash,
        "simulated": a.simulated,
        "ref": f"attempt:{a.id}",
    }


def list_violations(rt: Runtime, limit: int = 50) -> list[dict[str, Any]]:
    bad = [a for a in rt.stores.attempts.all() if a.outcome != "ok" and a.reason_code]
    bad.sort(key=lambda a: (a.ts, a.id), reverse=True)
    return [violation_out(rt, a) for a in bad[:limit]]
