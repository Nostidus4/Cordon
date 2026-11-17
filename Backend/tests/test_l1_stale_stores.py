"""#111: stored attempts of another deployment (or of the sim) are not shown as the current L1 run's."""

from __future__ import annotations

from types import SimpleNamespace

from guardian.services.runtime import AttemptRec, Runtime, Stores


def _attempt(i: int, simulated: bool) -> AttemptRec:
    return AttemptRec(
        id=i, scenario_run_id=None, step=None, display_time=None, signer="key_x", signer_label="x",
        principal_id="minh", action="pay", outcome="ok", reason_code=None, tx_hash=None, error_raw=None,
        block=1, ts=1, simulated=simulated,
    )  # fmt: skip


def _rt(vault: str, stores: Stores) -> Runtime:
    rt = Runtime.__new__(Runtime)
    rt.stores = stores
    rt.chain = SimpleNamespace(
        w3=SimpleNamespace(eth=SimpleNamespace(chain_id=845357)), vault_addr=vault
    )
    return rt


def test_sim_attempts_are_dropped_at_l1_start() -> None:
    st = Stores()
    st.attempts.add(_attempt(1, simulated=True))
    _rt("0xA", st)._forget_other_deployment()
    assert st.attempts.all() == []
    assert st.meta.get("l1_deployment") == "845357:0xA"


def test_same_deployment_keeps_attempts_and_a_new_one_clears_them() -> None:
    st = Stores()
    _rt("0xA", st)._forget_other_deployment()
    st.attempts.add(_attempt(1, simulated=False))
    _rt("0xA", st)._forget_other_deployment()  # restart on the same deployment
    assert len(st.attempts.all()) == 1
    _rt(
        "0xB", st
    )._forget_other_deployment()  # demo-reset deployed a new set, API reload was skipped
    assert st.attempts.all() == []
    assert st.meta.get("l1_deployment") == "845357:0xB"


def test_first_l1_start_keeps_real_attempts_of_an_older_build() -> None:
    st = Stores()
    st.attempts.add(_attempt(1, simulated=False))
    _rt("0xA", st)._forget_other_deployment()
    assert len(st.attempts.all()) == 1
