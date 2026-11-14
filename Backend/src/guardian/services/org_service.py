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
    c_status = rt.c_indexer.status() if rt.c_indexer is not None else None
    lag = _indexer_lag(rt)
    sse = rt.sse_latency.out()
    warnings = [
        code
        for code, on in (
            ("BLOCK_STALLED", rt.block_watch.stalled),
            ("INDEXER_LAG", lag > INDEXER_LAG_WARN_BLOCKS),
            (
                "INDEXER_ERROR",
                any(st is not None and st.last_error is not None for st in (status, c_status)),
            ),
            (
                "RPC_RATE_LIMITED",
                any(st is not None and st.rate_limited for st in (status, c_status)),
            ),
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
        "cChainBlock": c_status.head_c if c_status else None,
        "lastBlockC": c_status.last_block_c if c_status else None,
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


def topups(rt: Runtime) -> list[dict[str, Any]]:
    """Simulated top-ups, the C-Chain transfer and the L1 `TopUpRecorded` joined on the C-Chain tx hash
    (IDX-002). Newest first. A top-up seen on only one side is listed with `linked: false`."""
    from guardian.chain.cchain import EVENT_NAME
    from guardian.shared.money import money

    c_side: dict[str, dict[str, Any]] = {}
    if rt.c_sink is not None:
        for ev in rt.c_sink.events_in_range(0, 2**62):
            if ev.name != EVENT_NAME:
                continue
            row = c_side.setdefault(ev.tx_hash.lower(), {"amount": 0, "block": ev.block})
            row["amount"] += int(ev.payload["amount"])  # several matching logs in one tx add up
    l1_events = (
        rt.indexer.sink.events_in_range(0, 2**62) if rt.indexer is not None else list(rt.event_log)
    )
    l1_side = {
        str(e.payload["cChainTxHash"]).lower(): e for e in l1_events if e.name == "TopUpRecorded"
    }
    out: list[dict[str, Any]] = []
    for h in c_side.keys() | l1_side.keys():
        c, l1 = c_side.get(h), l1_side.get(h)
        amount = int(c["amount"]) if c else int(l1.payload["amount"])  # type: ignore[union-attr]
        out.append(
            {
                "cChainTxHash": h,
                "amount": money(amount),
                "cChainBlock": c["block"] if c else None,
                "l1TxHash": l1.tx_hash if l1 else None,
                "l1Block": l1.block if l1 else None,
                "linked": c is not None and l1 is not None,
                "simulated": True,
            }
        )
    out.sort(key=lambda r: (r["l1Block"] or 0, r["cChainBlock"] or 0), reverse=True)
    return out
