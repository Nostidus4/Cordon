"""DB-003: a SimChain rebuilt from its events alone reproduces the original state."""

import dataclasses
import json

from guardian.chain.base import ChainEvent
from guardian.chain.sim import SimChain
from guardian.chain.sim.replay import replay
from guardian.shared.money import to_base as u

T0 = 1_800_000_000 - 1_800_000_000 % 86400 + 3600


def _history() -> SimChain:
    a = SimChain(clock=lambda: T0)
    a.reset()
    k = a._addr
    sel = a._meta[k("mock_dex")]["selector"]
    assert a.pay(k("key_minh"), k("tUSDC"), k("vendor_cloud"), u(1_000)).status == "ok"
    assert a.pay(k("key_minh"), k("tUSDC"), k("vendor_cloud"), u(900_000)).status == "reverted"
    r = a.swap(k("key_minh"), k("mock_dex"), sel, k("tUSDC"), k("tTKB"), u(5_000), 0)
    assert r.status == "ok"
    assert a.topup(u(10_000)).status == "ok"
    a.apply_policy_v2()
    assert a.emergency_lock(a._member("lan"), "huy").status == "ok"
    assert a.lower_key_cap(a._member("lan"), k("key_minh"), u(5_000)).status == "ok"
    assert a.emergency_pause(a._member("trang")).status == "ok"
    unpause = {"target": "vault", "fn": "unpauseAll", "args": {}}
    pid = a.propose(a._member("trang"), "Mo lai", None, [unpause], "0x" + "11" * 32).proposal_id
    assert a.approve(a._member("lan"), pid).status == "ok"
    assert a.approve(a._member("huy"), pid).status == "ok"  # executed -> unpaused
    drop = {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": k("key_huy_1"), "cap": u(1)}}
    cancelled = a.propose(a._member("trang"), "Huy", "huy", [drop], "0x" + "22" * 32).proposal_id
    assert a.cancel(a._member("trang"), cancelled).status == "ok"
    open_ = a.propose(a._member("trang"), "Mo", "huy", [drop], "0x" + "33" * 32).proposal_id
    assert a.approve(a._member("lan"), open_).status == "ok"  # lan not affected; 1 of 2
    return a


def _rebuild(a: SimChain, events: list[ChainEvent]) -> SimChain:
    b = SimChain(clock=lambda: T0)
    b.reset()
    replay(b, events, calls={i: p.calls for i, p in a.council.proposals.items()})
    return b


def _props(c: SimChain):
    return {
        i: (p.proposer, p.subject_principal, p.title, p.approvals, p.approved_by, p.executed)
        + (p.cancelled, p.affected, p.calls, p.created_at)
        for i, p in c.council.proposals.items()
    }


def _same(a: SimChain, b: SimChain) -> None:
    sa, sb = a.snapshot(), b.snapshot()
    assert dataclasses.asdict(sa) == dataclasses.asdict(sb)
    assert {k: x.spent_today for k, x in sa.keys.items()} == {
        k: x.spent_today for k, x in sb.keys.items()
    }
    assert {k: x.locked for k, x in sa.principals.items()} == {
        k: x.locked for k, x in sb.principals.items()
    }
    assert _props(a) == _props(b)
    assert a.council.next_id == b.council.next_id
    assert a.ledger.balances == b.ledger.balances and a.main_treasury == b.main_treasury
    assert a.block == b.block and a.events == b.events


def test_replay_reproduces_state_and_continues():
    a = _history()
    b = _rebuild(a, a.events)
    _same(a, b)
    assert any(x.locked for x in a.snapshot().principals.values()) and a.vault.paused is False
    open_ = max(a.council.proposals)
    old = {e.tx_hash for e in a.events}
    assert a.approve(a._member("trang"), open_).status == "ok"  # 2nd approval executes it
    assert b.approve(b._member("trang"), open_).status == "ok"
    assert a.council.proposals[open_].executed and b.council.proposals[open_].executed
    assert dataclasses.asdict(a.snapshot()) == dataclasses.asdict(b.snapshot())
    r = b.pay(b._addr("key_agent_data"), b._addr("tUSDC"), b._addr("vendor_cloud"), 1)
    assert r.status == "ok" and r.tx_hash not in old


def test_replay_json_roundtrip():
    a = _history()
    evs = [
        ChainEvent(e.name, e.block, e.tx_hash, e.log_index, json.loads(json.dumps(e.payload)), e.ts)
        for e in a.events
    ]
    _same(a, _rebuild(a, evs))
