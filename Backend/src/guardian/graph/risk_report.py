"""Risk report before/after + keccak256 of canonical JSON (spec §8.5).

Hash: keccak256 of canonical JSON (sort_keys, separators (",",":"), ensure_ascii=False, utf-8) of
the report WITHOUT ``generatedAt`` (excluded so the hash is stable across runs; the timestamp is
informational only). ``graphVersion`` stays in the hash (= policy_version of the BEFORE snapshot).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from eth_hash.auto import keccak

from guardian.domain.snapshot import PolicySnapshot
from guardian.graph import changes as chg
from guardian.graph.findings import change_findings, compute_findings
from guardian.graph.simulate import simulate_compromise


def build_risk_report(
    snapshot: PolicySnapshot,
    change: chg.ProposedChange,
    compromised: list[str] | None = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    subject = chg.subject_principal(change, snapshot)
    comp = compromised if compromised is not None else ([subject] if subject else [])
    sim = simulate_compromise(snapshot, comp, change)
    after_snap = chg.apply_change(snapshot, change)
    r4 = change_findings(snapshot, change)
    conflicted = sorted({m for f in r4 for m in f["data"]["members"]})
    return {
        "before": sim["before"]["totals"],
        "after": sim["after"]["totals"],
        "findingsBefore": compute_findings(snapshot),
        "findingsAfter": compute_findings(after_snap) + r4,
        "conflictOfInterest": bool(conflicted),
        "conflictedMembers": conflicted,
        "subjectPrincipal": subject,
        "generatedAt": generated_at or datetime.now(UTC).isoformat(timespec="seconds"),
        "graphVersion": snapshot.policy_version,
    }


def canonical_json(report: dict[str, Any]) -> str:
    body = {k: v for k, v in report.items() if k != "generatedAt"}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def risk_report_hash(report: dict[str, Any]) -> str:
    return "0x" + keccak(canonical_json(report).encode()).hex()
