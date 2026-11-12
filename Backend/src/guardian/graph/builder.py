"""Build GraphSnapshot from a PolicySnapshot (spec §8.3).

Ids: "p:<id>", "k:<addr>", "m:<id>", "r:<addr>", "proto:<addr>", "t:<addr>", "treasury", "vault",
"council"; edges "e:<from>-<REL>-<to>" (declared edges keep their own id). Amounts are strings.
"""

from __future__ import annotations

from typing import Any

from guardian.domain.snapshot import PolicySnapshot
from guardian.graph.findings import has_high

GRAPH_VERSION = 1


def build_graph(snapshot: PolicySnapshot, findings: list[dict[str, Any]]) -> dict[str, Any]:
    s = snapshot
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []

    def node(nid: str, typ: str, label: str, **data: Any) -> None:
        nodes.append({"id": nid, "type": typ, "label": label, "data": data})

    def edge(eid: str, frm: str, to: str, typ: str, source: str) -> None:
        edges.append({"id": eid, "from": frm, "to": to, "type": typ, "source": source})

    node("treasury", "Treasury", "Quỹ chính", balance=str(s.main_treasury))
    node("vault", "Vault", "Kho chi tiêu", balance=str(s.vault_balance), paused=s.paused)
    node("council", "Council", "Hội đồng")
    edge("e:treasury-FUNDS-vault", "treasury", "vault", "FUNDS", "onchain")

    for m in s.council:
        node(f"m:{m.id}", "Member", m.label, address=m.address, principalId=m.principal_id)
        edge(f"e:m:{m.id}-APPROVES-council", f"m:{m.id}", "council", "APPROVES", "onchain")

    for pid, p in s.principals.items():
        node(
            f"p:{pid}",
            "Principal",
            p.label,
            kind=p.kind,
            dailyCap=str(p.daily_cap) if p.daily_cap > 0 else None,
            spentToday=str(p.spent_today),
            locked=p.locked,
            hasHighFinding=has_high(findings, pid),
        )
    for a, k in s.keys.items():
        node(
            f"k:{a}",
            "Key",
            k.label,
            kind=k.kind,
            dailyCap=str(k.daily_cap),
            spentToday=str(k.spent_today),
            locked=s.principals[k.principal_id].locked if k.principal_id in s.principals else False,
            allowListed=k.allow_listed,
            active=k.active,
            principalId=k.principal_id,
            hasHighFinding=has_high(findings, k.principal_id),
        )
        if k.principal_id in s.principals:
            edge(
                f"e:p:{k.principal_id}-HOLDS_KEY-k:{a}",
                f"p:{k.principal_id}",
                f"k:{a}",
                "HOLDS_KEY",
                "onchain",
            )
    for r in s.recipients:
        node(f"r:{r.address}", "Recipient", r.label, allowListed=r.allowed)
    for pr in s.protocols:
        node(
            f"proto:{pr.address}",
            "Protocol",
            pr.label,
            allowListed=pr.allowed,
            selector=pr.selector,
        )
    for t in s.tokens:
        node(f"t:{t.address}", "Token", t.symbol, allowListed=t.allowed, decimals=t.decimals)

    for a, k in s.keys.items():
        if not (k.active and k.allow_listed):
            continue
        for r in s.recipients:
            if r.allowed:
                edge(
                    f"e:k:{a}-MAY_PAY-r:{r.address}",
                    f"k:{a}",
                    f"r:{r.address}",
                    "MAY_PAY",
                    "onchain",
                )
        for pr in s.protocols:
            if pr.allowed:
                edge(
                    f"e:k:{a}-MAY_CALL-proto:{pr.address}",
                    f"k:{a}",
                    f"proto:{pr.address}",
                    "MAY_CALL",
                    "onchain",
                )

    for e in s.declared_edges:
        to = f"p:{e.to}" if e.to in s.principals else f"k:{e.to}"
        edge(e.id, f"p:{e.from_principal}", to, e.relation.upper(), e.source)

    districts = [
        {
            "principalId": pid,
            "dailyCap": str(p.daily_cap) if p.daily_cap > 0 else None,
            "spentToday": str(p.spent_today),
            "locked": p.locked,
            "keys": list(p.keys),
        }
        for pid, p in s.principals.items()
    ]
    return {
        "version": GRAPH_VERSION,
        "policyVersion": s.policy_version,
        "policyLabel": s.policy_label,
        "block": s.block,
        "nodes": nodes,
        "edges": edges,
        "districts": districts,
    }
