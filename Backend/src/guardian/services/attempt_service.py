"""Record attempts (server-side attacker, agent, external CLI), list by scenario run, SSE publish."""

from __future__ import annotations

from typing import Any

from guardian.chain.base import TxResult
from guardian.core.errors import ApiError
from guardian.services import views
from guardian.services.runtime import AttemptRec, Runtime
from guardian.shared.reason_codes import REASON_TABLE, ReasonCode

SPEND_ACTIONS = ("pay", "swap", "raw_call")


def attempt_out(a: AttemptRec) -> dict[str, Any]:
    info = REASON_TABLE[ReasonCode(a.reason_code)] if a.reason_code else None
    badge = (
        "tx" if a.tx_hash else "rejected_by_chain" if a.outcome == "blocked_at_protocol" else None
    )
    return {
        "id": a.id,
        "scenarioRunId": a.scenario_run_id,
        "step": a.step,
        "displayTime": a.display_time,
        "signer": a.signer,
        "signerLabel": a.signer_label,
        "principalId": a.principal_id,
        "action": a.action,
        "outcome": a.outcome,
        "reasonCode": a.reason_code,
        "reasonTextVi": info.vi if info else None,
        "reasonTextEn": info.en if info else None,
        "txHash": a.tx_hash,
        "errorRaw": a.error_raw,
        "block": a.block,
        "ts": a.ts,
        "amount": a.amount,
        "token": a.token,
        "to": a.to,
        "toLabel": a.to_label,
        "principalSpentAfter": a.principal_spent_after,
        "keySpentAfter": a.key_spent_after,
        "simulated": a.simulated,
        "source": a.source,
        "badge": badge,
    }


def add_attempt(rt: Runtime, **fields: Any) -> AttemptRec:
    rec = AttemptRec(id=rt.stores.next_id(), ts=rt.now(), **fields)
    rt.stores.attempts.append(rec)
    rt.publish("attempt", attempt_out(rec))
    return rec


def list_attempts(rt: Runtime, run: str | None) -> list[AttemptRec]:
    items = rt.stores.attempts
    if run is not None:
        if run == "latest":
            run = next(reversed(rt.stores.runs), None) if rt.stores.runs else None
        items = [a for a in items if a.scenario_run_id == run]
    return list(items)


def spent_after(
    rt: Runtime, res: TxResult, signer_addr: str | None, pid: str | None
) -> tuple[dict[str, str] | None, dict[str, str] | None]:
    """(principal, key) spent after the attempt: event values when the tx went through, else the
    unchanged current state."""
    for e in res.events:
        if "principalSpentAfter" in e.payload:
            return (
                views.mny(e.payload["principalSpentAfter"]),
                views.mny(e.payload["keySpentAfter"]),
            )
    snap = rt.snapshot()
    p = snap.principals.get(pid) if pid else None
    k = snap.keys.get(signer_addr) if signer_addr else None
    return (views.mny(p.spent_today) if p else None, views.mny(k.spent_today) if k else None)


def run_spend(
    rt: Runtime,
    signer: str,
    action: str,
    params: dict[str, Any],
    *,
    run_id: str | None = None,
    step: int | None = None,
    display_time: str | None = None,
    source: str = "server",
) -> AttemptRec:
    """simulate (for the reason) -> send tx (even when it will revert) -> record + publish."""
    chain, snap = rt.chain, rt.snapshot()
    ks = rt.key_by_seed(signer, snap)
    sim_reason: ReasonCode | None = None
    amount_m: dict[str, str] | None = None
    token: str | None = params.get("token") or params.get("token_in")
    to_seed: str | None = None
    s_addr = rt.addr(signer)
    if action == "pay":
        to_seed = params["to"]
        pay_args = (s_addr, rt.addr(params["token"]), rt.addr(to_seed), params["amount"])
        sim_reason = chain.simulate_pay(*pay_args)
        res = chain.pay(*pay_args, params.get("memo", ""))
    elif action == "swap":
        sel = next(p.selector for p in snap.protocols if p.seed_id == params["dex"])
        to_seed = params["dex"]
        args = (
            s_addr,
            rt.addr(params["dex"]),
            sel,
            rt.addr(params["token_in"]),
            rt.addr(params["token_out"]),
            params["amount_in"],
            params.get("min_out", 0),
        )
        sim_reason = chain.simulate_swap(*args)
        res = chain.swap(*args, reason=params.get("reason", ""))
    elif action == "raw_call":
        to_seed = params["target"]
        res = chain.raw_call(s_addr, rt.addr(params["target"]), params["data"])
    else:
        raise ValueError(f"unsupported spend action {action}")
    if token and action in ("pay", "swap"):
        dec = next((t.decimals for t in snap.tokens if t.symbol == token), 6)
        amount_m = views.mny(params.get("amount", params.get("amount_in", 0)), dec)
    reason = res.reason_code or (sim_reason if res.status != "ok" else None)
    p_after, k_after = spent_after(rt, res, ks.address, ks.principal_id)
    return add_attempt(
        rt,
        scenario_run_id=run_id,
        step=step,
        display_time=display_time,
        signer=signer,
        signer_label=ks.label,
        principal_id=ks.principal_id,
        action=action,
        outcome=res.status,
        reason_code=reason.value if reason else None,
        tx_hash=res.tx_hash,
        error_raw=res.error_raw,
        block=res.block,
        amount=amount_m,
        token=token,
        to=to_seed,
        to_label=rt.label_of(to_seed) if to_seed else None,
        principal_spent_after=p_after,
        key_spent_after=k_after,
        simulated=res.simulated,
        source=source,
    )


def record_external(rt: Runtime, body: dict[str, Any]) -> AttemptRec:
    """POST /api/attempts from an external attacker CLI (it already sent the tx)."""
    if body["outcome"] not in ("ok", "reverted", "blocked_at_protocol", "blocked"):
        raise ApiError(422, "VALIDATION_ERROR", "outcome: unknown value")
    if body.get("reasonCode") and body["reasonCode"] not in ReasonCode._value2member_map_:
        raise ApiError(422, "VALIDATION_ERROR", "reasonCode: unknown reason code")
    signer = body["signer"]
    try:
        ks = rt.key_by_seed(signer)
        label, pid = ks.label, ks.principal_id
    except KeyError:
        label, pid = rt.label_of(signer), None
    amt = body.get("amount")
    rec = add_attempt(
        rt,
        scenario_run_id=body.get("scenarioRunId"),
        step=body.get("step"),
        display_time=body.get("displayTime"),
        signer=signer,
        signer_label=label,
        principal_id=pid,
        action=body["action"],
        outcome=body["outcome"],
        reason_code=body.get("reasonCode"),
        tx_hash=body.get("txHash"),
        error_raw=body.get("errorRaw"),
        block=body.get("block"),
        amount=views.mny(amt) if amt is not None else None,
        token=body.get("token"),
        to=body.get("to"),
        to_label=rt.label_of(body["to"]) if body.get("to") else None,
        simulated=body.get("simulated", False),
        source="external",
    )
    rt.notify_state_changed(graph=False)
    return rec
