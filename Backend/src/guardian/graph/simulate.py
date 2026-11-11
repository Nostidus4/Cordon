"""simulateCompromise: youThink / enforced / estimated, highlights (spec §8.4).

Definitions (all ints, base units):
- key remaining  = max(0, keyDailyCap - keySpent) if the key is active AND allow-listed else 0.
- district remaining(p): 0 if locked or no live key; if principalDailyCap > 0 then
  cap - spentToday (spec §8.4 step 3, NOT min'ed with the sum of key caps: that is what makes
  "v2 + request #12" give 130.000); else the sum of the live keys' remaining.
- enforced  = min(vault, sum remaining over S0 (selected districts, on-chain HOLDS_KEY)).
- estimated = min(vault, sum remaining over S0 + everything reachable through declared/inferred
  CONTROLS/ADMINS edges, transitively). A key reached by an edge counts only for itself, and
  nothing is counted twice (a district/key already in the set adds nothing).
- youThink(p) = district cap if set (> 0) else sum of daily caps of the district's HUMAN keys.
  So v1 minh = 20.000, v2 minh = 30.000 (the district cap), v2+#12 = 130.000.
"""

from __future__ import annotations

from typing import Any

from guardian.domain.snapshot import PolicySnapshot, PrincipalState
from guardian.graph import changes as chg

Source = str  # "onchain" | "declared" | "inferred"


def key_remaining(snap: PolicySnapshot, addr: str) -> int:
    k = snap.keys[addr]
    if not k.active or not k.allow_listed:
        return 0
    return max(0, k.daily_cap - k.spent_today)


def live_keys(snap: PolicySnapshot, p: PrincipalState) -> list[str]:
    return [
        a for a in p.keys if a in snap.keys and snap.keys[a].active and snap.keys[a].allow_listed
    ]


def district_remaining(
    snap: PolicySnapshot, p: PrincipalState, only: set[str] | None = None
) -> int:
    """Remaining daily budget of a district; ``only`` restricts to a subset of keys (partial reach)."""
    if p.locked:
        return 0
    keys = [a for a in live_keys(snap, p) if only is None or a in only]
    if not keys:
        return 0
    if p.daily_cap > 0:
        return max(0, p.daily_cap - p.spent_today)
    return sum(key_remaining(snap, a) for a in keys)


def you_think(snap: PolicySnapshot, p: PrincipalState) -> int:
    if p.daily_cap > 0:
        return p.daily_cap
    return sum(
        snap.keys[a].daily_cap for a in p.keys if a in snap.keys and snap.keys[a].kind == "HUMAN"
    )


def percent_of_treasury(amount: int, main_treasury: int) -> float:
    if main_treasury <= 0:
        return 0.0
    return round(amount * 1000 / main_treasury) / 10  # one decimal, integer math before rounding


def _vi_note(p: PrincipalState, via_declared: bool, remaining: int) -> str:
    if p.locked:
        return "Khu đã bị khoá: không chi được."
    prefix = "Tới được qua cạnh tự khai. " if via_declared else ""
    if p.daily_cap > 0:
        return prefix + "Có cổng chung: tối đa bằng hạn mức chung của khu."
    return prefix + "Chưa có cổng chung: mỗi thẻ có trần riêng, cộng lại."


def simulate_compromise(
    snapshot: PolicySnapshot,
    compromised: list[str],
    change: chg.ProposedChange | None = None,
) -> dict[str, Any]:
    """§8.4. With ``change`` returns {"before": SimResult, "after": SimResult} (change applied to a copy)."""
    if change is not None:
        return {
            "before": simulate_compromise(snapshot, compromised),
            "after": simulate_compromise(chg.apply_change(snapshot, change), compromised),
        }
    from guardian.graph.findings import compute_findings  # local: findings imports simulate

    snap = snapshot
    s0 = [p for p in dict.fromkeys(compromised) if p in snap.principals]
    s0_set = set(s0)

    # key -> set of via sources; reached districts via edges; partial keys
    via: dict[str, set[str]] = {}
    edge_ids: list[str] = []
    for p in s0:
        for a in snap.principals[p].keys:
            if a in snap.keys:
                via.setdefault(a, set()).add("onchain")

    sx: dict[str, str] = {}  # whole districts reached via edges -> source
    partial: dict[str, set[str]] = {}  # district -> individually reached keys
    frontier = list(s0)
    seen = set(s0)
    while frontier:
        cur = frontier.pop()
        for e in snap.declared_edges:
            if e.from_principal != cur:
                continue
            if e.to in snap.principals:
                if e.to in s0_set:
                    continue
                edge_ids.append(e.id)
                sx.setdefault(e.to, e.source)
                for a in snap.principals[e.to].keys:
                    if a in snap.keys:
                        via.setdefault(a, set()).add(e.source)
                if e.to not in seen:
                    seen.add(e.to)
                    frontier.append(e.to)
            elif e.to in snap.keys:
                owner = snap.keys[e.to].principal_id
                if owner in s0_set:
                    continue
                edge_ids.append(e.id)
                via.setdefault(e.to, set()).add(e.source)
                partial.setdefault(owner, set()).add(e.to)
    for pid in sx:
        partial.pop(pid, None)

    per: list[dict[str, str]] = []
    enforced_sum = 0
    estimated_sum = 0
    for pid in s0:
        r = district_remaining(snap, snap.principals[pid])
        enforced_sum += r
        estimated_sum += r
        per.append(
            {
                "principalId": pid,
                "enforced": str(r),
                "estimated": str(r),
                "note": _vi_note(snap.principals[pid], False, r),
            }
        )
    for pid in sx:
        r = district_remaining(snap, snap.principals[pid])
        estimated_sum += r
        per.append(
            {
                "principalId": pid,
                "enforced": "0",
                "estimated": str(r),
                "note": _vi_note(snap.principals[pid], True, r),
            }
        )
    for pid, ks in partial.items():
        r = district_remaining(snap, snap.principals[pid], only=ks)
        estimated_sum += r
        per.append(
            {
                "principalId": pid,
                "enforced": "0",
                "estimated": str(r),
                "note": _vi_note(snap.principals[pid], True, r),
            }
        )

    enforced = min(snap.vault_balance, enforced_sum)
    estimated = min(snap.vault_balance, estimated_sum)
    think = sum(you_think(snap, snap.principals[p]) for p in s0)

    reached_principals = list(s0) + list(sx) + list(partial)
    reached_keys = [{"key": a, "via": sorted(v)} for a, v in via.items()]
    node_ids = [f"p:{p}" for p in reached_principals] + [f"k:{a}" for a in via]
    holds = [
        f"e:p:{p}-HOLDS_KEY-k:{a}" for p in s0 for a in snap.principals[p].keys if a in snap.keys
    ]
    all_findings = compute_findings(snap)
    reached_set = set(reached_principals)

    return {
        "reachedKeys": reached_keys,
        "perDistrict": per,
        "totals": {
            "youThink": str(think),
            "enforced": str(enforced),
            "estimated": str(estimated),
            "vaultBalance": str(snap.vault_balance),
            "percentOfMainTreasury": percent_of_treasury(estimated, snap.main_treasury),
        },
        "highlights": {"nodeIds": node_ids, "edgeIds": holds + list(dict.fromkeys(edge_ids))},
        "findings": [f for f in all_findings if f["principal_id"] in reached_set],
    }
