"""One agent-float round: read -> decide -> simulate -> send -> explain (CITY_OPS section 2, PAYROLL.md section 7).

Works against any `PayrollPort`. The agent only ever calls `allocate` / `unwind` with a venue taken from the
snapshot; `untrusted_input` is recorded and shown but neither `decide` nor the sends read it, so
`injection_ignored` is true by construction. A `Kill` decision is handed to `on_kill` (a Council/automation
hook supplied by the caller); the agent key itself has no kill path.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from guardian.agent_float.config import DEFAULT_PARAMS, FloatParams
from guardian.agent_float.report import build_facts, write_report
from guardian.agent_float.rule_engine import Action, Allocate, Kill, Noop, Unwind, decide
from guardian.chain.payroll_base import PayrollPort, PayrollTxResult
from guardian.domain.payroll_snapshot import PayrollSnapshot


@dataclass
class PayrollAgentRun:
    ts: int
    outcome: str  # no_action | acted | blocked | kill_requested
    actions: list[dict[str, Any]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)
    reason_text: str = ""
    reason_source: str = "template"
    reason_hash: str = ""
    untrusted_input: str | None = None
    injection_ignored: bool | None = None
    facts: dict[str, Any] = field(default_factory=dict)


def _step(key: str, label: str, status: str, **detail: Any) -> dict[str, Any]:
    return {"key": key, "labelVi": label, "status": status, "detail": detail}


def _describe(a: Action) -> dict[str, Any]:
    if isinstance(a, Allocate):
        return {"type": "allocate", "venue": a.venue, "amount": a.amount}
    if isinstance(a, Unwind):
        return {"type": "unwind", "venue": a.venue, "amount": a.amount, "why": a.why}
    if isinstance(a, Kill):
        return {"type": "kill", "reason": a.reason}
    return {"type": "noop", "why": a.reason}


def _sent(r: PayrollTxResult) -> dict[str, Any]:
    return {
        "status": r.status,
        "reasonCode": r.reason_code.value if r.reason_code else None,
        "errorRaw": r.error_raw,
        "txHash": r.tx_hash,
    }


def run_once(
    port: PayrollPort,
    signer: str,
    *,
    params: FloatParams = DEFAULT_PARAMS,
    untrusted_input: str | None = None,
    rt: Any = None,
    on_kill: Callable[[int], PayrollTxResult] | None = None,
    snapshot: PayrollSnapshot | None = None,
) -> PayrollAgentRun:
    """`rt` (optional) is the Runtime used only to phrase the CFO report via the LLM; None -> template."""
    snap = snapshot or port.snapshot()
    steps = [
        _step(
            "read",
            "Đọc số dư và bậc thang",
            "ok",
            phase=snap.phase,
            idle=snap.idle,
            deployedTotal=snap.deployed_total,
            coverage=snap.coverage,
        )
    ]
    actions = decide(snap, params)
    described = [_describe(a) for a in actions]
    steps.append(_step("decide", "Quyết định theo luật", "ok", actions=described))
    run = PayrollAgentRun(
        ts=snap.now,
        outcome="no_action",
        actions=described,
        untrusted_input=untrusted_input,
        injection_ignored=True if untrusted_input else None,
    )
    doing = [a for a in actions if not isinstance(a, Noop)]
    sims: list[dict[str, Any]] = []
    sends: list[dict[str, Any]] = []
    blocked = False
    for a in doing:
        if isinstance(a, Allocate):
            reason = port.simulate_allocate(signer, a.venue, a.amount)
            sims.append({"venue": a.venue, "reasonCode": reason.value if reason else None})
            if reason is not None:
                blocked = True
                sends.append({"venue": a.venue, "status": "skipped", "reasonCode": reason.value})
                continue
            sends.append({"venue": a.venue, **_sent(port.allocate(signer, a.venue, a.amount))})
        elif isinstance(a, Unwind):
            sends.append({"venue": a.venue, **_sent(port.unwind(signer, a.venue, a.amount))})
        elif isinstance(a, Kill):
            if on_kill is None:
                sends.append({"kill": a.reason, "status": "requested"})
                run.outcome = "kill_requested"
            else:
                sends.append({"kill": a.reason, **_sent(on_kill(a.reason))})
    if doing:
        steps.append(
            _step("simulate", "Giả lập trước khi gửi", "blocked" if blocked else "ok", checks=sims)
        )
        steps.append(_step("send", "Gửi giao dịch", "ok", sends=sends))
        if run.outcome != "kill_requested":
            run.outcome = (
                "blocked"
                if blocked and not any(s.get("status") == "ok" for s in sends)
                else "acted"
            )
    else:
        steps += [
            _step("simulate", "Giả lập trước khi gửi", "skipped"),
            _step("send", "Gửi giao dịch", "skipped"),
        ]
    # explain: the CFO report on the state AFTER the round; the LLM only phrases computed numbers
    facts = build_facts(port.snapshot() if doing else snap)
    text, source, rh = write_report(facts, rt, untrusted_input)
    steps.append(
        _step("explain", "Giải thích", "ok", reasonText=text, reasonSource=source, reasonHash=rh)
    )
    run.steps, run.facts = steps, facts
    run.reason_text, run.reason_source, run.reason_hash = text, source, rh
    return run
