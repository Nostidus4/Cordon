"""Org/treasury/vault/council read model + health."""

from __future__ import annotations

from typing import Any

from guardian.chain.factory import load_seed
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
        "policyLabel": snap.policy_label,
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


def _indexer_lag(rt: Runtime) -> int:
    if rt.indexer is None:
        return 0
    return rt.indexer.status().lag_blocks or 0


INDEXER_LAG_WARN_BLOCKS = 10
SSE_SLOW_MS = 3000


def health(rt: Runtime) -> dict[str, Any]:
    snap = rt.snapshot()
    status = rt.indexer.status() if rt.indexer is not None else None
    rt.block_watch.observe(status.head_l1 if status and status.head_l1 is not None else snap.block)
    lag = _indexer_lag(rt)
    sse = rt.sse_latency.out()
    warnings = [
        code
        for code, on in (
            ("BLOCK_STALLED", rt.block_watch.stalled),
            ("INDEXER_LAG", lag > INDEXER_LAG_WARN_BLOCKS),
            ("INDEXER_ERROR", status is not None and status.last_error is not None),
            ("SSE_SLOW", (sse["maxMs"] or 0) > SSE_SLOW_MS),
        )
        if on
    ]
    runs = rt.stores.agent_runs.all()
    return {
        "status": "ok",
        "chainMode": rt.settings.chain_mode,
        "demoMode": rt.settings.demo_enabled,
        "simulated": rt.settings.chain_mode == "sim",
        "l1Block": snap.block,
        "cChainBlock": None,
        "indexerLagBlocks": lag,
        "policyVersion": snap.policy_version,
        "policyLabel": snap.policy_label,
        "graphVersion": rt.graph_version,
        "agent": {
            "status": "idle" if runs else "never_run",
            "lastRunAt": runs[-1].ts if runs else None,
            "lastOutcome": runs[-1].outcome if runs else None,
        },
        "lastBlockAt": rt.block_watch.last_block_at,
        "blockStalled": rt.block_watch.stalled,
        "warnings": warnings,
        "eventToSse": sse,
    }
