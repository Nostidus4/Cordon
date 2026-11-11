"""Rules R1..R4 (spec §8.5).

Finding dict: {"id", "rule", "severity", "principal_id", "title" (vi), "data", "proposal"}.
``proposal`` is a ProposedChange (see changes.py) or None.

Interpretation choices (spec is loose):
- R1 fires per principal ONLY when it reaches >= 2 live keys that belong to DIFFERENT districts
  via on-chain HOLDS_KEY + declared/inferred CONTROLS/ADMINS (followed transitively) and those keys
  have no shared district cap covering them. A district with several keys of its own (e.g. `huy`,
  two keys in one district) is NOT flagged, even with principalDailyCap == 0 (lead decision: R1
  disappears once the keys are merged under one district, i.e. after policy v2).
- R2 fires per live AGENT/SERVICE key while NO recipient is allow-listed in the vault.
- R3 fires per declared ADMINS edge A -> (service/agent key or its district) where A is also an
  operator (holds a live HUMAN key) and the administered key is still in another district. It
  disappears once the key is merged into A's district.
- R4 is change-driven (`change_findings`): a change that gives the subject district (the receiver of
  keys/caps) more exposure than before, ending above R4_EXPOSURE_THRESHOLD, while a Council member
  is bound to that district (memberPrincipal == subject).
"""

from __future__ import annotations

from typing import Any

from guardian.domain.snapshot import PolicySnapshot
from guardian.graph import changes as chg

R1 = "R1_MULTI_KEY_NO_SHARED_CAP"
R2 = "R2_AGENT_NO_ALLOWLIST"
R3 = "R3_ADMIN_IS_OPERATOR"
R4 = "R4_COUNCIL_CONCENTRATION"

# "X" of rule R4 (spec leaves it open): estimated exposure above this => concentration. 50.000 tUSDC
R4_EXPOSURE_THRESHOLD = 50_000 * 1_000_000
# Suggested cap of a Council-owned district (§9.5: "hạn mức 100.000")
R4_SUGGESTED_COUNCIL_CAP = 100_000 * 1_000_000
R4_SUGGESTED_DISTRICT_ID = "council_ops"

_CAP_FACTOR_NUM, _CAP_FACTOR_DEN = 3, 2  # x1.5
_UNIT = 1_000_000  # round up to whole USDC


def suggested_shared_cap(snap: PolicySnapshot, keys: list[str]) -> int:
    """max(keyDailyCap) x 1.5, rounded up to a whole USDC (seed: 20.000 -> 30.000)."""
    m = max((snap.keys[k].daily_cap for k in keys if k in snap.keys), default=0)
    scaled = m * _CAP_FACTOR_NUM // _CAP_FACTOR_DEN
    return -(-scaled // _UNIT) * _UNIT


def _live(snap: PolicySnapshot, addr: str) -> bool:
    k = snap.keys.get(addr)
    return bool(k and k.active)


def reachable_keys(snap: PolicySnapshot, pid: str) -> list[str]:
    """Own keys + keys reached through declared/inferred edges (transitive), in stable order."""
    out: dict[str, None] = {}
    seen = {pid}
    stack = [pid]
    while stack:
        cur = stack.pop()
        if cur in snap.principals:
            for a in snap.principals[cur].keys:
                out.setdefault(a)
        for e in snap.declared_edges:
            if e.from_principal != cur:
                continue
            if e.to in snap.principals and e.to not in seen:
                seen.add(e.to)
                stack.append(e.to)
            elif e.to in snap.keys:
                out.setdefault(e.to)
    return [a for a in out if a in snap.keys]


def _fid(rule: str, subject: str) -> str:
    return f"{rule}:{subject}"


def _r1(snap: PolicySnapshot) -> list[dict[str, Any]]:
    res = []
    for pid, p in snap.principals.items():
        own = [a for a in p.keys if _live(snap, a)]
        if not own:
            continue
        keys = [a for a in reachable_keys(snap, pid) if _live(snap, a)]
        districts = sorted({snap.keys[a].principal_id for a in keys})
        if len(districts) < 2:
            continue
        merge_keys = keys
        cap = suggested_shared_cap(snap, merge_keys)
        res.append(
            {
                "id": _fid(R1, pid),
                "rule": R1,
                "severity": "HIGH",
                "principal_id": pid,
                "title": f"{p.label} điều khiển {len(merge_keys)} thẻ nhưng chưa có cổng chung.",
                "data": {
                    "keys": merge_keys,
                    "districts": districts,
                    "reason": "cross_district",
                    "maxKeyDailyCap": str(max(snap.keys[a].daily_cap for a in merge_keys)),
                    "suggestedDistrictCap": str(cap),
                },
                "proposal": {
                    "kind": "merge_district",
                    "into": pid,
                    "keys": merge_keys,
                    "district_cap": cap,
                },
            }
        )
    return res


def _r2(snap: PolicySnapshot) -> list[dict[str, Any]]:
    if any(r.allowed for r in snap.recipients):
        return []
    res = []
    for a, k in snap.keys.items():
        if k.active and k.kind in ("AGENT", "SERVICE"):
            res.append(
                {
                    "id": _fid(R2, a),
                    "rule": R2,
                    "severity": "MEDIUM",
                    "principal_id": k.principal_id,
                    "title": f"Thẻ {k.label} chưa có danh sách người nhận được duyệt.",
                    "data": {"key": a},
                    "proposal": None,
                }
            )
    return res


def _r3(snap: PolicySnapshot) -> list[dict[str, Any]]:
    res = []
    for e in snap.declared_edges:
        if e.relation != "admins" or e.from_principal not in snap.principals:
            continue
        admin = snap.principals[e.from_principal]
        if e.to in snap.keys:
            targets = [e.to]
        elif e.to in snap.principals:
            targets = list(snap.principals[e.to].keys)
        else:
            continue
        svc = [
            a
            for a in targets
            if a in snap.keys
            and snap.keys[a].active
            and snap.keys[a].kind in ("SERVICE", "AGENT")
            and snap.keys[a].principal_id != admin.id
        ]
        is_operator = any(
            snap.keys[a].kind == "HUMAN" and snap.keys[a].active
            for a in admin.keys
            if a in snap.keys
        )
        if not svc or not is_operator:
            continue
        own = [a for a in admin.keys if _live(snap, a)]
        cap = suggested_shared_cap(snap, own + svc)
        res.append(
            {
                "id": _fid(R3, e.id),
                "rule": R3,
                "severity": "MEDIUM",
                "principal_id": admin.id,
                "title": f"{admin.label} vừa quản trị vừa vận hành thẻ dịch vụ.",
                "data": {"edge": e.id, "keys": svc},
                "proposal": {
                    "kind": "merge_district",
                    "into": admin.id,
                    "keys": svc,
                    "district_cap": max(cap, admin.daily_cap),
                },
            }
        )
    return res


def compute_findings(snapshot: PolicySnapshot) -> list[dict[str, Any]]:
    """R1-R3 for a snapshot (R4 is evaluated per ProposedChange: see change_findings)."""
    return _r1(snapshot) + _r2(snapshot) + _r3(snapshot)


def has_high(findings: list[dict[str, Any]], principal_id: str) -> bool:
    return any(f["principal_id"] == principal_id and f["severity"] == "HIGH" for f in findings)


def change_findings(snapshot: PolicySnapshot, change: chg.ProposedChange) -> list[dict[str, Any]]:
    """R4 for a ProposedChange applied to ``snapshot`` (the BEFORE state)."""
    from guardian.graph.simulate import simulate_compromise  # local: simulate imports findings

    subject = chg.subject_principal(change, snapshot)
    if subject is None:
        return []
    members = [m for m in snapshot.council if m.principal_id == subject]
    if not members:
        return []
    after = chg.apply_change(snapshot, change)

    def exposure(s: PolicySnapshot) -> int:
        if subject not in s.principals:
            return 0
        return int(simulate_compromise(s, [subject])["totals"]["estimated"])

    before_x, after_x = exposure(snapshot), exposure(after)
    if not (after_x > R4_EXPOSURE_THRESHOLD and after_x > before_x):
        return []
    moved = [change["key"]] if change["kind"] == "move_key" else list(change.get("keys", []))
    return [
        {
            "id": _fid(R4, subject),
            "rule": R4,
            "severity": "HIGH",
            "principal_id": subject,
            "title": (
                "Người sắp nhận thêm quyền đang ngồi Hội đồng và giữ phiếu duyệt: xung đột lợi ích."
            ),
            "data": {
                "conflictOfInterest": True,
                "members": [m.id for m in members],
                "exposureBefore": str(before_x),
                "exposureAfter": str(after_x),
                "threshold": str(R4_EXPOSURE_THRESHOLD),
            },
            "proposal": {
                "kind": "create_district",
                "principal_id": R4_SUGGESTED_DISTRICT_ID,
                "label": "Khu do Hội đồng sở hữu",
                "owner": "council",
                "keys": moved,
                "district_cap": R4_SUGGESTED_COUNCIL_CAP,
                "protocol_only": True,
            },
        }
    ]
