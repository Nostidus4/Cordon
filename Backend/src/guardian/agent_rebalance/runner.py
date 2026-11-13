"""agent-rebalance, one round (spec §7.1; shared by `POST /api/agent/run-once` and `guardian-agent`): balances -> rule engine -> simulate -> swap or BLOCKED.

The LLM never touches amount/token/DEX: `write_reason` only phrases the sentence (LLM, else template); `decision` is final before it runs.
"""

from __future__ import annotations

from typing import Any

from guardian.agent_rebalance.config import DEFAULT_CONFIG
from guardian.agent_rebalance.reason_writer import reason_hash, write_reason_detail
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


def chain_reason_hashes(rt: Runtime) -> dict[str, str]:
    """tx hash -> `reasonHash` of the `Swapped` event the chain emitted (what the vault recorded)."""
    return {
        e.tx_hash: e.payload["reasonHash"]
        for e in rt.chain.events_since(0)
        if e.name == "Swapped" and e.payload.get("reasonHash")
    }


def verify_reason_hash(r: AgentRunRec, on_chain: dict[str, str]) -> tuple[str | None, bool | None]:
    """(hash on chain, keccak(stored reasonText) == hash on chain). (None, None) when there is no event to compare."""
    h = on_chain.get(r.tx_hash) if r.tx_hash else None
    if h is None or r.reason_text is None:
        return None, None
    return h, reason_hash(r.reason_text).lower() == h.lower()


def agent_run_out(r: AgentRunRec, on_chain: dict[str, str] | None = None) -> dict[str, Any]:
    chain_hash, verified = verify_reason_hash(r, on_chain or {})
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
        "steps": r.steps or None,
        "untrustedInput": r.untrusted_input,
        "injectionIgnored": r.injection_ignored,
        "reasonHashOnChain": chain_hash,
        "reasonHashVerified": verified,
        "rejectedReasonText": r.rejected_reason_text,
    }


def _step(key: str, label: str, status: str, **detail: Any) -> dict[str, Any]:
    return {"key": key, "labelVi": label, "status": status, "detail": detail}


def run_once(
    rt: Runtime, untrusted_input: str | None = None, llm_reason: bool = True
) -> dict[str, Any]:
    """One round. `untrusted_input` (CITY_OPS F06) is foreign text handed to the agent: it is recorded and shown,
    but neither `decide` nor the amount/token/DEX ever read it, so `injection_ignored` is true by construction."""
    snap = rt.snapshot()
    ks = rt.key_by_seed(AGENT_SEED, snap)
    district = snap.principals.get(ks.principal_id)
    usdc = rt.chain.balance(rt.addr("vault"), rt.addr("tUSDC"))
    ttkb = rt.chain.balance(rt.addr("vault"), rt.addr("tTKB"))
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
    steps = [_step("read", "Đọc số dư và hạn mức", "ok", **balances)]
    fallback = False
    if decision is None:
        fallback = True
        # Drift exists but today's limits are used up: still ask the chain (simulate) so the
        # refusal is recorded with the real reason code (spec Epic D1).
        decision = decide(usdc, ttkb_value, DEFAULT_CONFIG.max_amount_in, None)
    run_id = rt.stores.next_id()
    extra: dict[str, Any] = {
        "untrusted_input": untrusted_input,
        "injection_ignored": True if untrusted_input else None,
    }
    if decision is None:
        steps += [
            _step("decide", "Quyết định theo luật", "skipped", action="none"),
            _step("simulate", "Giả lập trước khi gửi", "skipped"),
            _step("send", "Gửi giao dịch", "skipped"),
            _step("explain", "Giải thích", "skipped"),
        ]
        rec = AgentRunRec(
            run_id,
            rt.now(),
            "no_action",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            balances,
            steps,
            **extra,
        )
        return _finish(rt, rec)
    steps.append(
        _step(
            "decide",
            "Quyết định theo luật",
            "ok",
            action="swap",
            fallbackToMaxAmount=fallback,
            **decision_out(decision),  # type: ignore[arg-type]
        )
    )
    # llm_reason=False (bulk runs such as F07) keeps the template so a loop never holds the event loop per round
    reason = write_reason_detail(decision, rt if llm_reason else None, untrusted_input)
    text, source = reason.text, reason.source
    extra["rejected_reason_text"] = reason.rejected_text
    rh = reason_hash(text)
    explain = _step(
        "explain", "Giải thích", "ok", reasonText=text, reasonSource=source, reasonHash=rh
    )
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
        rt.addr(AGENT_SEED),
        rt.addr("mock_dex"),
        sel,
        rt.addr(decision.token_in),
        rt.addr(decision.token_out),
        decision.amount_in,
        0,
    )
    steps.append(
        _step(
            "simulate",
            "Giả lập trước khi gửi",
            "blocked" if sim_reason is not None else "ok",
            reasonCode=sim_reason.value if sim_reason else None,
        )
    )
    if sim_reason is not None:
        steps += [
            _step("send", "Gửi giao dịch", "skipped", reasonCode=sim_reason.value),
            explain,
        ]
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
            steps,
            **extra,
        )
        return _finish(rt, rec)
    a = att.run_spend(rt, AGENT_SEED, "swap", params, source="agent")
    outcome = "swapped" if a.outcome == "ok" else "reverted"
    steps += [
        _step(
            "send",
            "Gửi giao dịch",
            "ok" if a.outcome == "ok" else "blocked",
            txHash=a.tx_hash,
            reasonCode=a.reason_code,
            simulated=a.simulated,
        ),
        explain,
    ]
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
        steps,
        **extra,
    )
    return _finish(rt, rec)


def _finish(rt: Runtime, rec: AgentRunRec) -> dict[str, Any]:
    rt.stores.agent_runs.append(rec)
    out = agent_run_out(rec, chain_reason_hashes(rt))
    rt.publish("agent_run", out)
    rt.notify_state_changed()
    return out
