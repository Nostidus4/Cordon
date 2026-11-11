"""Org/treasury/vault/council read model + health."""

from __future__ import annotations

from typing import Any

from guardian.chain.sim.engine import load_seed
from guardian.services import views
from guardian.services.runtime import Runtime


def org(rt: Runtime) -> dict[str, Any]:
    snap = rt.snapshot()
    seed = load_seed()
    return {
        "id": seed["org"]["id"],
        "name": seed["org"]["name"],
        "fictional": True,
        "policyVersion": snap.policy_version,
        "mainTreasury": {
            "balance": views.mny(snap.main_treasury),
            "label": "Quỹ chính (Safe, C-Chain)",
        },
        "vault": {
            "address": rt.chain.vault_addr,
            "balance": views.mny(snap.vault_balance),
            "paused": snap.paused,
            "label": "Kho chi tiêu (Guardian L1)",
        },
        "council": [
            {"id": m.id, "label": m.label, "address": m.address, "principalId": m.principal_id}
            for m in snap.council
        ],
        "threshold": 2,
    }


def health(rt: Runtime) -> dict[str, Any]:
    snap = rt.snapshot()
    runs = rt.stores.agent_runs
    return {
        "status": "ok",
        "chainMode": rt.settings.chain_mode,
        "demoMode": rt.settings.demo_enabled,
        "simulated": True,
        "l1Block": snap.block,
        "cChainBlock": None,
        "indexerLagBlocks": 0,
        "policyVersion": snap.policy_version,
        "graphVersion": rt.graph_version,
        "agent": {
            "status": "idle" if runs else "never_run",
            "lastRunAt": runs[-1].ts if runs else None,
            "lastOutcome": runs[-1].outcome if runs else None,
        },
    }
