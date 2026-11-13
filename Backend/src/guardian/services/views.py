"""Domain/graph dicts -> API JSON (camelCase, money as {raw, display}); ProposedChange in/out.

Pure functions, no state. Everything the routes, SSE and the assistant tools show goes through here
so there is exactly one place that formats money.
"""

from __future__ import annotations

from typing import Any

from guardian.chain.base import ChainEvent
from guardian.core.errors import ApiError
from guardian.graph import changes as chg
from guardian.shared.money import money

USDC = 6
_MONEY_NODE_KEYS = ("balance", "dailyCap", "spentToday")
_MONEY_FINDING_KEYS = (
    "maxKeyDailyCap",
    "suggestedDistrictCap",
    "exposureBefore",
    "exposureAfter",
    "threshold",
)


def mny(base: int | str, decimals: int = USDC) -> dict[str, str]:
    return money(int(base), decimals)


def mny_or_none(base: int | str | None) -> dict[str, str] | None:
    return None if base is None else mny(base)


# --------------------------------------------------------------------------- ProposedChange
def _amount(v: Any, field: str) -> int:
    if isinstance(v, dict):
        v = v.get("raw")
    if isinstance(v, bool) or not isinstance(v, (int, str)):
        raise ApiError(422, "VALIDATION_ERROR", f"change.{field}: expected integer base units")
    try:
        n = int(v)
    except ValueError as e:
        raise ApiError(422, "VALIDATION_ERROR", f"change.{field}: not an integer") from e
    if n < 0:
        raise ApiError(422, "VALIDATION_ERROR", f"change.{field}: must be >= 0")
    return n


def change_in(raw: dict[str, Any]) -> chg.ProposedChange:
    """Accept camelCase or snake_case, amounts as int | "123" | {raw, display}."""

    def g(*names: str) -> Any:
        for n in names:
            if n in raw:
                return raw[n]
        return None

    def need(field: str, *names: str) -> Any:
        v = g(*names)
        if v is None:
            raise ApiError(422, "VALIDATION_ERROR", f"change.{field} is required")
        return v

    kind = raw.get("kind")
    if kind == "merge_district":
        return {
            "kind": "merge_district",
            "into": str(need("into", "into")),
            "keys": [str(k) for k in need("keys", "keys")],
            "district_cap": _amount(
                need("districtCap", "districtCap", "district_cap"), "districtCap"
            ),
        }
    if kind == "set_district_cap":
        return {
            "kind": "set_district_cap",
            "principal_id": str(need("principalId", "principalId", "principal_id")),
            "cap": _amount(need("cap", "cap"), "cap"),
        }
    if kind == "set_key_cap":
        return {
            "kind": "set_key_cap",
            "key": str(need("key", "key")),
            "cap": _amount(need("cap", "cap"), "cap"),
        }
    if kind == "move_key":
        return {"kind": "move_key", "key": str(need("key", "key")), "to": str(need("to", "to"))}
    if kind == "create_district":
        out: chg.CreateDistrict = {
            "kind": "create_district",
            "principal_id": str(need("principalId", "principalId", "principal_id")),
            "label": str(need("label", "label")),
            "owner": "council",
            "keys": [str(k) for k in g("keys") or []],
            "district_cap": _amount(
                need("districtCap", "districtCap", "district_cap"), "districtCap"
            ),
        }
        po = g("protocolOnly", "protocol_only")
        if po is not None:
            out["protocol_only"] = bool(po)
        return out
    raise ApiError(422, "VALIDATION_ERROR", f"change.kind: unknown kind {kind!r}")


def change_out(c: chg.ProposedChange) -> dict[str, Any]:
    k = c["kind"]
    if k == "merge_district":
        return {
            "kind": k,
            "into": c["into"],
            "keys": list(c["keys"]),
            "districtCap": mny(c["district_cap"]),
        }
    if k == "set_district_cap":
        return {"kind": k, "principalId": c["principal_id"], "cap": mny(c["cap"])}
    if k == "set_key_cap":
        return {"kind": k, "key": c["key"], "cap": mny(c["cap"])}
    if k == "move_key":
        return {"kind": k, "key": c["key"], "to": c["to"]}
    out = {
        "kind": k,
        "principalId": c["principal_id"],
        "label": c["label"],  # create_district
        "owner": c["owner"],
        "keys": list(c["keys"]),
        "districtCap": mny(c["district_cap"]),
    }
    if "protocol_only" in c:
        out["protocolOnly"] = c["protocol_only"]
    return out


def calls_out(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Symbolic Council calls: amounts already decimal strings -> {raw, display} for `cap`."""
    out = []
    for c in calls:
        a = dict(c["args"])
        if "cap" in a:
            a["cap"] = mny(a["cap"])
        out.append({"target": c["target"], "fn": c["fn"], "args": a})
    return out


def chain_calls(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """graph.changes.to_calls vocabulary (toId/principalId/cap:str) -> SimChain vocabulary
    (to/principal_id/cap:int). TODO(owner of graph/changes.py): unify the two vocabularies."""
    out = []
    for c in calls:
        a = dict(c["args"])
        if "toId" in a:
            a["to"] = a.pop("toId")
        if "principalId" in a:
            a["principal_id"] = a.pop("principalId")
        if "cap" in a:
            a["cap"] = int(a["cap"])
        if c["fn"] == "createPrincipal":
            a.setdefault("kind", "SERVICE")
        out.append({"target": c["target"], "fn": c["fn"], "args": a})
    return out


# --------------------------------------------------------------------------- findings / sim
def api_finding(f: dict[str, Any]) -> dict[str, Any]:
    data = dict(f.get("data", {}))
    for k in _MONEY_FINDING_KEYS:
        if k in data:
            data[k] = mny(data[k])
    return {
        "id": f["id"],
        "ruleId": f["rule"],
        "severity": f["severity"],
        "principalId": f["principal_id"],
        "title": f["title"],
        "data": data,
        "proposal": change_out(f["proposal"]) if f.get("proposal") else None,
    }


def api_sim(sim: dict[str, Any]) -> dict[str, Any]:
    t = sim["totals"]
    return {
        "reachedKeys": sim["reachedKeys"],
        "perDistrict": [
            {
                "principalId": d["principalId"],
                "enforced": mny(d["enforced"]),
                "estimated": mny(d["estimated"]),
                "note": d["note"],
            }
            for d in sim["perDistrict"]
        ],
        "totals": api_totals(t),
        "highlights": sim["highlights"],
        "findings": [api_finding(f) for f in sim["findings"]],
    }


def api_totals(t: dict[str, Any]) -> dict[str, Any]:
    return {
        "youThink": mny(t["youThink"]),
        "enforced": mny(t["enforced"]),
        "estimated": mny(t["estimated"]),
        "vaultBalance": mny(t["vaultBalance"]),
        "percentOfMainTreasury": t["percentOfMainTreasury"],
    }


def api_risk_report(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "before": api_totals(r["before"]),
        "after": api_totals(r["after"]),
        "findingsBefore": [api_finding(f) for f in r["findingsBefore"]],
        "findingsAfter": [api_finding(f) for f in r["findingsAfter"]],
        "conflictOfInterest": r["conflictOfInterest"],
        "conflictedMembers": r["conflictedMembers"],
        "subjectPrincipal": r["subjectPrincipal"],
        "generatedAt": r["generatedAt"],
        "graphVersion": r["graphVersion"],
    }


def api_graph(g: dict[str, Any], version: int) -> dict[str, Any]:
    nodes = []
    for n in g["nodes"]:
        d = dict(n["data"])
        for k in _MONEY_NODE_KEYS:
            if d.get(k) is not None:
                d[k] = mny(d[k])
        nodes.append({**n, "data": d})
    districts = [
        {**d, "dailyCap": mny_or_none(d["dailyCap"]), "spentToday": mny(d["spentToday"])}
        for d in g["districts"]
    ]
    return {
        "version": version,
        "policyVersion": g["policyVersion"],
        "policyLabel": g["policyLabel"],
        "block": g["block"],
        "nodes": nodes,
        "edges": g["edges"],
        "districts": districts,
    }


# --------------------------------------------------------------------------- events
_EVENT_MONEY: dict[str, tuple[str, ...]] = {
    "Paid": ("keySpentAfter", "principalSpentAfter"),
    "Swapped": ("keySpentAfter", "principalSpentAfter"),
    "CapChanged": ("oldCap", "newCap"),
    "TopUpRecorded": ("amount",),
}


def api_event(ev: ChainEvent, decimals: dict[str, int]) -> dict[str, Any]:
    """`decimals` maps token address -> decimals (amounts of Paid/Swapped use the token's)."""
    p = dict(ev.payload)
    for k in _EVENT_MONEY.get(ev.name, ()):
        if k in p:
            p[k] = mny(p[k])
    if ev.name == "Paid":
        p["amount"] = mny(p["amount"], decimals.get(p["token"], USDC))
    elif ev.name == "Swapped":
        p["amountIn"] = mny(p["amountIn"], decimals.get(p["tokenIn"], USDC))
        p["amountOut"] = mny(p["amountOut"], decimals.get(p["tokenOut"], USDC))
    return {
        "name": ev.name,
        "block": ev.block,
        "txHash": ev.tx_hash,
        "logIndex": ev.log_index,
        "payload": p,
        "ts": ev.ts,
        "simulated": ev.simulated,
    }
