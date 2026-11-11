"""District detail: keys, caps, spent today, locked, declared edges, findings."""

from __future__ import annotations

from typing import Any

from guardian.core.errors import ApiError
from guardian.graph.simulate import district_remaining, key_remaining, you_think
from guardian.services import views
from guardian.services.runtime import Runtime


def district(rt: Runtime, principal_id: str) -> dict[str, Any]:
    snap = rt.snapshot()
    p = snap.principals.get(principal_id)
    if p is None:
        raise ApiError(404, "DISTRICT_NOT_FOUND", f"Không có khu '{principal_id}'.")
    keys = [snap.keys[a] for a in p.keys if a in snap.keys]
    return {
        "principalId": p.id,
        "label": p.label,
        "kind": p.kind,
        "dailyCap": views.mny_or_none(p.daily_cap or None),
        "spentToday": views.mny(p.spent_today),
        "remaining": views.mny(district_remaining(snap, p)),
        "youThink": views.mny(you_think(snap, p)),
        "locked": p.locked,
        "keys": [
            {
                "address": k.address,
                "seedId": k.seed_id,
                "label": k.label,
                "kind": k.kind,
                "dailyCap": views.mny(k.daily_cap),
                "spentToday": views.mny(k.spent_today),
                "remaining": views.mny(key_remaining(snap, k.address)),
                "active": k.active,
                "allowListed": k.allow_listed,
            }
            for k in keys
        ],
        "declaredEdges": [
            {
                "id": e.id,
                "from": e.from_principal,
                "to": e.to,
                "relation": e.relation.upper(),
                "source": e.source,
                "note": e.note,
            }
            for e in snap.declared_edges
            if e.from_principal == p.id or e.to == p.id or e.to in {k.address for k in keys}
        ],
        "council": [m.id for m in snap.council if m.principal_id == p.id],
        "findings": [views.api_finding(f) for f in rt.findings() if f["principal_id"] == p.id],
    }
