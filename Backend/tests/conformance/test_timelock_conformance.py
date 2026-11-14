"""Council timelock conformance (#77): the same scenarios on SimChain and on L1Chain (anvil), Council delay 60 s.

Delay 0 is the whole of `test_chainport_conformance.py` (the `net` fixture has no timelock).
"""

from __future__ import annotations

from typing import Any

from tests.conformance.conftest import TIMELOCK_S
from tests.conformance.harness import Net, norm, u

CALLS = [{"target": "vault", "fn": "setKeyDailyCap", "args": {"key": "key_minh", "cap": u(50_000)}}]


def _queued(net: Net) -> tuple[int, Any]:
    c = net.chain
    r = c.propose("trang", "raise", "minh", CALLS, "0x" + "01" * 32)
    assert r.ok and r.proposal_id is not None
    assert c.approve("trang", r.proposal_id).ok
    r2 = c.approve("lan", r.proposal_id)
    assert r2.ok
    return r.proposal_id, r2


def test_threshold_queues_instead_of_executing(tl_net: Net) -> None:
    net = tl_net
    c = net.chain
    pid = c.propose("trang", "raise", "minh", CALLS, "0x" + "01" * 32).proposal_id
    r1 = c.approve("trang", pid)
    assert [e.name for e in r1.events] == ["Approved"]
    assert c.proposal_state(pid).eta is None
    r2 = c.approve("lan", pid)
    assert [e.name for e in r2.events] == ["Approved", "Queued"]
    queued = next(e for e in r2.events if e.name == "Queued")
    assert set(queued.payload) == {"id", "eta"} and queued.payload["id"] == pid
    st = c.proposal_state(pid)
    assert (st.status, st.approvals, st.queued) == ("open", 2, True)
    assert st.eta == queued.payload["eta"]
    snap = net.snap()
    assert snap.policy_version == 1  # nothing executed yet
    assert snap.keys[net.addr("key_minh")].daily_cap == u(20_000)


def test_execute_before_eta_reverts_and_after_eta_runs(tl_net: Net) -> None:
    net = tl_net
    c = net.chain
    pid, _ = _queued(net)
    early = c.execute_proposal("huy", pid)
    assert early.status == "reverted" and early.error_raw == "TimelockNotReady"
    assert norm(early)["events"] == []
    assert net.snap().policy_version == 1
    net.advance_seconds(TIMELOCK_S + 1)
    ok = c.execute_proposal("huy", pid)
    assert ok.ok
    assert [e.name for e in ok.events][-3:] == ["CapChanged", "PolicyVersionBumped", "Executed"]
    assert net.snap().policy_version == 2
    assert net.snap().keys[net.addr("key_minh")].daily_cap == u(50_000)
    st = c.proposal_state(pid)
    assert (st.status, st.queued) == ("executed", False)
    again = c.execute_proposal("huy", pid)
    assert again.status == "reverted" and again.error_raw == "ProposalNotOpen"


def test_execute_needs_threshold_and_a_member(tl_net: Net) -> None:
    net = tl_net
    c = net.chain
    pid = c.propose("trang", "raise", "minh", CALLS, "0x" + "01" * 32).proposal_id
    assert c.approve("trang", pid).ok
    r = c.execute_proposal("lan", pid)
    assert r.status == "reverted" and r.error_raw == "NeedsThreshold"
    r = c.execute_proposal("key_minh", pid)
    assert r.status in ("reverted", "blocked_at_protocol")
    unknown = c.execute_proposal("lan", 999)
    assert unknown.status == "reverted" and unknown.error_raw == "UnknownProposal"


def test_one_member_veto_cancels_a_queued_proposal(tl_net: Net) -> None:
    net = tl_net
    c = net.chain
    pid, _ = _queued(net)
    r = c.veto("huy", pid)
    assert r.ok and [e.name for e in r.events] == ["Cancelled", "Vetoed"]
    vetoed = r.events[1].payload
    assert vetoed == {"id": pid, "member": net.addr("council_huy")}
    st = c.proposal_state(pid)
    assert (st.status, st.queued) == ("cancelled", False)
    assert st.vetoed_by == net.addr("council_huy")
    net.advance_seconds(TIMELOCK_S + 1)
    r = c.execute_proposal("trang", pid)
    assert r.status == "reverted" and r.error_raw == "ProposalNotOpen"
    assert net.snap().keys[net.addr("key_minh")].daily_cap == u(20_000)


def test_veto_only_while_queued(tl_net: Net) -> None:
    net = tl_net
    c = net.chain
    pid = c.propose("trang", "raise", "minh", CALLS, "0x" + "01" * 32).proposal_id
    assert c.approve("trang", pid).ok
    r = c.veto("huy", pid)  # open but not queued
    assert r.status == "reverted" and r.error_raw == "ProposalNotOpen"
    assert c.approve("lan", pid).ok
    net.advance_seconds(TIMELOCK_S + 1)
    assert c.execute_proposal("trang", pid).ok
    r = c.veto("huy", pid)  # executed
    assert r.status == "reverted" and r.error_raw == "ProposalNotOpen"
    r = c.veto("huy", 999)
    assert r.status == "reverted" and r.error_raw == "UnknownProposal"


def test_tightening_stays_immediate_while_a_proposal_is_queued(tl_net: Net) -> None:
    net = tl_net
    c = net.chain
    _queued(net)
    r = c.lower_key_cap("huy", "key_minh", u(5_000))
    assert r.ok
    assert net.snap().keys[net.addr("key_minh")].daily_cap == u(5_000)
    assert c.emergency_lock("lan", "minh").ok


def test_delay_zero_executes_inside_approve_and_execute_needs_threshold(net: Net) -> None:
    c = net.chain
    pid = c.propose("trang", "raise", "minh", CALLS, "0x" + "01" * 32).proposal_id
    assert c.approve("trang", pid).ok
    early = c.execute_proposal("lan", pid)
    assert early.status == "reverted" and early.error_raw == "NeedsThreshold"
    r = c.approve("lan", pid)
    assert [e.name for e in r.events] == [
        "Approved",
        "CapChanged",
        "PolicyVersionBumped",
        "Executed",
    ]
    st = c.proposal_state(pid)
    assert (st.status, st.eta, st.queued) == ("executed", None, False)
    veto = c.veto("huy", pid)
    assert veto.status == "reverted" and veto.error_raw == "ProposalNotOpen"
