"""agent-rebalance, one round (spec §7.1): balances -> rule engine -> simulate -> swap or BLOCKED.

The LLM never touches amount/token/DEX: `write_reason` only phrases the sentence (template now).
"""

from __future__ import annotations

from typing import Any

from guardian.agent_rebalance.config import DEFAULT_CONFIG
from guardian.agent_rebalance.reason_writer import reason_hash, write_reason
from guardian.agent_rebalance.rule_engine import Decision, decide
from guardian.graph.simulate import key_remaining
from guardian.services import attempt_service as att
from guardian.services import views
from guardian.services.runtime import AgentRunRec, Runtime

AGENT_SEED = "key_agent_rebalance"


def decision_out(d: Decision | None) -> dict[str, Any] | None:
    if d is None:
        return None
    return {
        "tokenIn": d.token_in,
        "tokenOut": d.token_out,
        "amountIn": views.mny(d.amount_in),
        "gap": views.mny(d.gap),
        "ttkbWeightBps": d.ttkb_weight_bps,
        "targetBps": d.target_bps,
        "totalValue": views.mny(d.total_value),
    }


def agent_run_out(r: AgentRunRec) -> dict[str, Any]:
    return {
        "id": r.id,
        "ts": r.ts,
        "outcome": r.outcome,
        "decision": r.decision,
        "reasonText": r.reason_text,
        "reasonSource": r.reason_source,
        "reasonHash": r.reason_hash,
        "txHash": r.tx_hash,
        "reasonCode": r.reason_code,
        "attemptId": r.attempt_id,
        "balances": r.balances,
    }


def run_once(rt: Runtime) -> dict[str, Any]:
    snap = rt.snapshot()
    ks = rt.key_by_seed(AGENT_SEED, snap)
    district = snap.principals.get(ks.principal_id)
    usdc = rt.chain.balance("vault", "tUSDC")
    ttkb = rt.chain.balance("vault", "tTKB")
    ttkb_dec = next(t.decimals for t in snap.tokens if t.symbol == "tTKB")
    ttkb_value = ttkb * 10**6 // 10**ttkb_dec  # MockDEX: 1 tTKB = 1 tUSDC in value
    k_left = key_remaining(snap, ks.address)
    d_left = (
        max(0, district.daily_cap - district.spent_today)
        if district and district.daily_cap > 0
        else None
    )
    balances = {
        "vaultTusdc": views.mny(usdc),
        "vaultTtkb": views.mny(ttkb, ttkb_dec),
        "ttkbValueInTusdc": views.mny(ttkb_value),
        "keyRemaining": views.mny(k_left),
        "districtRemaining": views.mny_or_none(d_left),
    }
    decision = decide(usdc, ttkb_value, k_left, d_left)
    if decision is None:
        # Drift exists but today's limits are used up: still ask the chain (simulate) so the
        # refusal is recorded with the real reason code (spec Epic D1).
        decision = decide(usdc, ttkb_value, DEFAULT_CONFIG.max_amount_in, None)
    run_id = rt.stores.next_id()
    if decision is None:
        rec = AgentRunRec(
            run_id, rt.now(), "no_action", None, None, None, None, None, None, None, balances
        )
        return _finish(rt, rec)
    text, source = write_reason(decision)
    rh = reason_hash(text)
    params = {
        "dex": "mock_dex",
        "token_in": decision.token_in,
        "token_out": decision.token_out,
        "amount_in": decision.amount_in,
        "min_out": 0,
        "reason": text,
    }
    sel = next(p.selector for p in snap.protocols if p.seed_id == "mock_dex")
    sim_reason = rt.chain.simulate_swap(
        AGENT_SEED, "mock_dex", sel, decision.token_in, decision.token_out, decision.amount_in, 0
    )
    if sim_reason is not None:
        a = att.add_attempt(
            rt,
            scenario_run_id=None,
            step=None,
            display_time=None,
            signer=AGENT_SEED,
            signer_label=ks.label,
            principal_id=ks.principal_id,
            action="swap",
            outcome="blocked",
            reason_code=sim_reason.value,
            tx_hash=None,
            error_raw=None,
            block=None,
            amount=views.mny(decision.amount_in),
            token=decision.token_in,
            to="mock_dex",
            to_label=rt.label_of("mock_dex"),
            principal_spent_after=views.mny(district.spent_today) if district else None,
            key_spent_after=views.mny(ks.spent_today),
            source="agent",
        )
        rec = AgentRunRec(
            run_id,
            rt.now(),
            "blocked",
            decision_out(decision),
            text,
            source,
            rh,
            None,
            sim_reason.value,
            a.id,
            balances,
        )
        return _finish(rt, rec)
    a = att.run_spend(rt, AGENT_SEED, "swap", params, source="agent")
    outcome = "swapped" if a.outcome == "ok" else "reverted"
    rec = AgentRunRec(
        run_id,
        rt.now(),
        outcome,
        decision_out(decision),
        text,
        source,
        rh,
        a.tx_hash,
        a.reason_code,
        a.id,
        balances,
    )
    return _finish(rt, rec)


def _finish(rt: Runtime, rec: AgentRunRec) -> dict[str, Any]:
    rt.stores.agent_runs.append(rec)
    out = agent_run_out(rec)
    rt.publish("agent_run", out)
    rt.notify_state_changed()
    return out
