"""CHN-002: scene 4 on `L1Chain` (anvil + real contracts) equals `SimChain` step by step.

Flow (spec 4.3): policy v2 through a Council proposal and two approvals, the agent swap of 5.000,
attacker steps 1-5, `emergencyLock`, then step 7. Step 7 is rejected by the node before it reaches a
block; anvil has no Tx AllowList precompile, so the rejection is emulated by
`AllowListEnforcingProvider` (the mock role is read, the recorded Subnet-EVM string is returned).
The real string is unit-tested in `test_writes_unit.py`.
"""

from __future__ import annotations

import dataclasses
from typing import Any

from guardian.chain.l1 import L1Chain
from guardian.chain.sim import SimChain
from guardian.shared.scenario4 import SCENARIO4_DISTRICT, SCENARIO4_STEPS, Scenario4Step
from tests.chain_l1.anvil_env import Env
from tests.idport import IdPort


def _run_step(chain: Any, st: Scenario4Step, selector: str) -> Any:
    chain = IdPort(chain)  # scenario ids -> hex (CHN-004)
    p = st.params
    if st.action == "swap":
        return chain.swap(
            st.signer,
            p["dex"],
            selector,
            p["token_in"],
            p["token_out"],
            p["amount_in"],
            p["min_out"],
        )
    if st.action == "pay":
        return chain.pay(st.signer, p["token"], p["to"], p["amount"])
    if st.action == "lock":
        return chain.emergency_lock(st.signer.removeprefix("council_"), p["principal_id"])
    return chain.raw_call(st.signer, p["target"], p["data"])


def _comparable(chain: Any) -> dict[str, Any]:
    d = dataclasses.asdict(chain.snapshot())
    d.pop("block")  # the sim counts its own blocks
    return d


def test_scene4_step_by_step_equals_sim(env: Env, l1: L1Chain) -> None:
    ts = int(env.w3.eth.get_block("latest")["timestamp"])
    sim = SimChain(env.seed, clock=lambda: ts)
    selector = env.seed["protocols"][0]["selector"]

    sim_v2, l1_v2 = sim.apply_policy_v2(), l1.apply_policy_v2()
    assert [r.status for r in sim_v2] == [r.status for r in l1_v2] == ["ok", "ok"]
    assert l1_v2[0].events[-2:] and [e.name for e in l1_v2[1].events][-2:] == [
        "PolicyVersionBumped",
        "Executed",
    ]
    assert l1.snapshot().policy_version == sim.snapshot().policy_version == 2
    assert _comparable(l1) == _comparable(sim)

    for st in SCENARIO4_STEPS:
        want, got = _run_step(sim, st, selector), _run_step(l1, st, selector)
        label = f"step {st.step}"
        assert got.status == want.status == st.expected_outcome, label
        assert got.reason_code == want.reason_code, label
        assert (got.reason_code.value if got.reason_code else None) == st.expected_reason, label
        assert got.simulated is False and want.simulated is True
        if st.expected_outcome == "blocked_at_protocol":
            assert got.tx_hash is None and got.block is None and got.events == [], label
            assert "non-allow listed" in (got.error_raw or ""), label
        else:
            assert got.tx_hash and got.block, label  # reverted txs land on chain too
        if st.expected_outcome == "reverted":
            assert got.error_raw == want.error_raw and got.events == [], label
        if st.expected_district_spent_after is not None:
            spent = l1.snapshot().principals[SCENARIO4_DISTRICT].spent_today
            assert spent == sim.snapshot().principals[SCENARIO4_DISTRICT].spent_today, label
            assert spent == st.expected_district_spent_after, label

    snap, want = l1.snapshot(), sim.snapshot()
    assert _comparable(l1) == _comparable(sim)
    assert snap.principals["minh"].locked
    assert len(snap.principals["minh"].keys) == 5
    assert all(
        not snap.keys[k].allow_listed and snap.keys[k].active for k in snap.principals["minh"].keys
    )
    assert want.principals["minh"].locked
