"""Execute scene-4 steps: simulate for reason -> send real tx -> report attempt (spec §4.3, §7.2).

Works on any `ChainPort`. Reason precedence matches `services.attempt_service.run_spend`:
the tx result's reason wins, else the pre-flight simulation's reason when the tx did not succeed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from guardian.chain.base import ChainPort, TxResult
from guardian.shared.reason_codes import ReasonCode
from guardian.shared.scenario4 import SCENARIO4_STEPS, Scenario4Step

ATTACK_STEPS: tuple[Scenario4Step, ...] = tuple(s for s in SCENARIO4_STEPS if 1 <= s.step <= 5)
STEP7: Scenario4Step = next(s for s in SCENARIO4_STEPS if s.step == 7)
STEP_BY_NUMBER: dict[int, Scenario4Step] = {s.step: s for s in ATTACK_STEPS} | {7: STEP7}


@dataclass
class StepReport:
    step: int
    display_time: str
    signer: str
    action: str
    token: str | None
    to: str | None
    amount: int | None
    expected_outcome: str
    expected_reason: str | None
    sim_reason: str | None  # pre-flight eth_call result (None = would pass / not simulatable)
    sent: bool
    outcome: str | None = None  # ok | reverted | blocked_at_protocol (None when not sent)
    reason_code: str | None = None
    tx_hash: str | None = None
    block: int | None = None
    error_raw: str | None = None
    simulated: bool = True

    @property
    def matches_expected(self) -> bool:
        """Sent steps compare outcome + reason; dry-run steps compare the simulated reason only."""
        if self.sent:
            return (
                self.outcome == self.expected_outcome and self.reason_code == self.expected_reason
            )
        if self.step == STEP7.step:
            return True  # cannot be simulated through ChainPort: nothing to compare
        if self.step == 5 and self.sim_reason is None:
            return True  # the district cap only trips after steps 3-4 were really sent
        return self.sim_reason == self.expected_reason

    def attempt_body(self, run_id: str | None) -> dict[str, Any]:
        """Body of POST /api/attempts (AttemptIn, camelCase)."""
        return {
            "scenarioRunId": run_id,
            "step": self.step,
            "displayTime": self.display_time,
            "signer": self.signer,
            "action": self.action,
            "outcome": self.outcome,
            "reasonCode": self.reason_code,
            "txHash": self.tx_hash,
            "errorRaw": self.error_raw,
            "block": self.block,
            "amount": self.amount,
            "token": self.token,
            "to": self.to,
            "simulated": self.simulated,
        }


def _selector(chain: ChainPort, dex: str) -> str:
    return next(p.selector for p in chain.snapshot().protocols if p.seed_id == dex)


def execute_step(chain: ChainPort, s: Scenario4Step, *, dry_run: bool = False) -> StepReport:
    """Dry-run for the reason, then (unless `dry_run`) send the real tx even when it will revert."""
    p = s.params
    sim: ReasonCode | None = None
    res: TxResult | None = None
    token = p.get("token") or p.get("token_in")
    amount = p.get("amount", p.get("amount_in"))
    if s.action == "pay":
        to = p["to"]
        sim = chain.simulate_pay(s.signer, p["token"], to, p["amount"])
        if not dry_run:
            res = chain.pay(s.signer, p["token"], to, p["amount"], p.get("memo", ""))
    elif s.action == "swap":
        to = p["dex"]
        args = (
            s.signer,
            to,
            _selector(chain, to),
            p["token_in"],
            p["token_out"],
            p["amount_in"],
            p.get("min_out", 0),
        )
        sim = chain.simulate_swap(*args)
        if not dry_run:
            res = chain.swap(*args)
    elif s.action == "raw_call":
        to = p["target"]  # ChainPort cannot simulate an arbitrary call: send (or skip on dry-run)
        if not dry_run:
            res = chain.raw_call(s.signer, to, p["data"])
    else:
        raise ValueError(f"attacker cannot execute action {s.action!r}")
    rep = StepReport(
        s.step,
        s.display_time,
        s.signer,
        s.action,
        token,
        to,
        amount,
        s.expected_outcome,
        s.expected_reason,
        sim.value if sim else None,
        sent=res is not None,
    )
    if res is not None:
        reason = res.reason_code or (sim if res.status != "ok" else None)
        rep.outcome = res.status
        rep.reason_code = reason.value if reason else None
        rep.tx_hash, rep.block, rep.error_raw = res.tx_hash, res.block, res.error_raw
        rep.simulated = res.simulated
    return rep
