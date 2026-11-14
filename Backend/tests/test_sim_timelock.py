"""SimChain Council timelock (#77): queue, execute from eta, veto, third approval, replay."""

from guardian.chain.sim import SimChain
from guardian.chain.sim.replay import replay
from guardian.shared.money import to_base
from tests.idport import IdPort

T0 = 1_800_000_000 - 1_800_000_000 % 86400 + 3600
DELAY = 45
CALLS = [
    {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": "key_minh", "cap": to_base(50_000)}}
]


def mk() -> tuple[IdPort, list[int]]:
    cell = [T0]
    return IdPort(SimChain(clock=lambda: cell[0], timelock_s=DELAY)), cell


def queued(c: IdPort) -> int:
    pid = c.propose("trang", "raise", "minh", CALLS, "0x00").proposal_id
    assert pid is not None
    assert c.approve("trang", pid).ok
    assert c.approve("lan", pid).ok
    return pid


def test_queue_sets_eta_and_defers_effects() -> None:
    c, _ = mk()
    pid = queued(c)
    st = c.proposal_state(pid)
    assert st.eta == T0 + DELAY and st.queued and st.status == "open"
    assert c.snapshot().policy_version == 1


def test_third_approval_after_queue_leaves_eta_unchanged() -> None:
    c, cell = mk()
    pid = queued(c)
    cell[0] += 10
    r = c.approve("huy", pid)
    assert r.ok and [e.name for e in r.events] == ["Approved"]
    st = c.proposal_state(pid)
    assert st.approvals == 3 and st.eta == T0 + DELAY


def test_execute_and_veto_rules() -> None:
    c, cell = mk()
    pid = queued(c)
    assert c.execute_proposal("huy", pid).error_raw == "TimelockNotReady"
    cell[0] += DELAY
    assert c.execute_proposal("huy", pid).ok
    assert c.veto("huy", pid).error_raw == "ProposalNotOpen"
    pid2 = queued(c)
    r = c.veto("huy", pid2)
    assert r.ok and [e.name for e in r.events] == ["Cancelled", "Vetoed"]
    assert c.proposal_state(pid2).vetoed_by == c.addr("council_huy")


def test_replay_restores_eta_and_veto() -> None:
    c, _ = mk()
    pid = queued(c)
    pid2 = queued(c)
    c.veto("huy", pid2)
    fresh = SimChain(clock=lambda: T0, timelock_s=DELAY)
    fresh.reset()
    replay(fresh, list(c._chain.events), {})
    assert fresh.proposal_state(pid).eta == T0 + DELAY
    st2 = fresh.proposal_state(pid2)
    assert st2.cancelled and st2.vetoed_by == c.addr("council_huy")
