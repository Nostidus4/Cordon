"""CHN-001 acceptance on a local anvil: snapshot parity with the sim, Swapped event, AllowList."""

from __future__ import annotations

import dataclasses
from typing import Any

from eth_utils import keccak

from guardian.chain.l1 import L1Chain
from guardian.chain.sim import SimChain
from guardian.domain.snapshot import PolicySnapshot
from tests.chain_l1.anvil_env import Env, pid32

SWAP_SELECTOR = bytes.fromhex("10b84623")
FIVE_K = 5_000_000_000  # 5.000 tUSDC


def _l1(env: Env, **kw: Any) -> L1Chain:
    return L1Chain(env.w3, env.dep, env.seed, **kw)


def _sim(env: Env) -> SimChain:
    """Sim with the same seed, clock pinned to the chain's latest block time."""
    ts = int(env.w3.eth.get_block("latest")["timestamp"])
    return SimChain(env.seed, clock=lambda: ts)


def _as_dict(snap: PolicySnapshot) -> dict[str, Any]:
    d = dataclasses.asdict(snap)
    d.pop("block")  # the sim counts its own blocks
    return d


def test_seeded_snapshot_equals_sim_field_by_field(env: Env) -> None:
    got, want = _as_dict(_l1(env).snapshot()), _as_dict(_sim(env).snapshot())
    assert got.keys() == want.keys()
    for field in want:
        assert got[field] == want[field], field


def test_seeded_snapshot_headline_numbers(env: Env) -> None:
    snap = _l1(env).snapshot()
    assert len(snap.principals) == 7
    assert len(snap.keys) == 8
    assert (
        sorted(k.daily_cap for k in snap.keys.values()) == [10_000_000_000] + [20_000_000_000] * 7
    )  # the lone 10.000 is key_lan
    assert snap.vault_balance == 200_000_000_000
    assert snap.policy_version == 1
    assert snap.paused is False
    assert all(isinstance(k.spent_today, int) for k in snap.keys.values())
    assert [t.symbol for t in snap.tokens] == ["tUSDC", "tTKB", "tSCAM"]
    assert [t.allowed for t in snap.tokens] == [True, True, False]
    assert [r.allowed for r in snap.recipients] == [True, True, True, False]
    assert [p.allowed for p in snap.protocols] == [True, False]
    assert {m.id for m in snap.council} == {"trang", "lan", "huy"}


def _swap(env: Env, amount: int) -> str:
    key = env.as_key(env.seed["keys"][1]["address"])  # key_agent_data
    env.send(
        env.vault.functions.swap(
            env.dex.address,
            SWAP_SELECTOR,
            env.tokens["tUSDC"].address,
            env.tokens["tTKB"].address,
            amount,
            0,
            keccak(text="rebalance"),
        ),
        key,
    )
    return key


def test_one_swap_gives_one_event_and_updates_snapshot(env: Env) -> None:
    chain = _l1(env)
    before = int(env.w3.eth.block_number)
    key = _swap(env, FIVE_K)

    events = chain.events_since(before)
    assert [e.name for e in events] == ["Swapped"]
    ev = events[0]
    assert ev.payload["principalSpentAfter"] == FIVE_K
    assert ev.payload["keySpentAfter"] == FIVE_K
    assert ev.payload["principalId"] == "agent_data"
    assert ev.payload["key"] == key
    assert ev.payload["dex"] == env.dex.address
    assert ev.payload["amountIn"] == FIVE_K
    assert ev.payload["reasonHash"] == "0x" + keccak(text="rebalance").hex()
    assert not ev.simulated and ev.tx_hash.startswith("0x") and ev.block > before
    assert chain.events_since(ev.block) == []

    snap = chain.snapshot()
    assert snap.keys[key].spent_today == FIVE_K
    assert snap.principals["agent_data"].spent_today == FIVE_K
    assert snap.vault_balance == 200_000_000_000 - FIVE_K


def test_allow_listed_false_when_role_set_to_none(env: Env) -> None:
    chain = _l1(env)
    key = env.seed["keys"][0]["address"]
    assert chain.snapshot().keys[key].allow_listed is True
    before = int(env.w3.eth.block_number)
    env.send(env.allowlist.functions.setNone(key), env.admin)

    snap = chain.snapshot()
    assert snap.keys[key].allow_listed is False
    assert snap.keys[env.seed["keys"][1]["address"]].allow_listed is True

    (ev,) = chain.events_since(before)
    assert ev.name == "AllowListRoleSet"
    assert ev.payload == {"key": key, "role": 0, "by": env.admin}


def test_admin_events_are_normalised(env: Env) -> None:
    chain = _l1(env)
    before = int(env.w3.eth.block_number)
    vault = env.vault
    key_minh = env.seed["keys"][0]["address"]
    calls = [
        ("setKeyDailyCap", [key_minh, 10_000_000_000]),
        ("setPrincipalDailyCap", [pid32("minh"), 30_000_000_000]),
        ("setProtocolAllowed", [env.evil_dex.address, SWAP_SELECTOR, True]),
        ("setRecipientAllowed", [env.seed["recipients"][3]["address"], True]),
        ("lockPrincipal", [pid32("minh")]),
        ("pauseAll", []),
        ("bumpPolicyVersion", []),
    ]
    for fn, args in calls:
        env.council_call(vault, fn, *args)

    evs = chain.events_since(before)
    assert [e.name for e in evs] == [
        "CapChanged",
        "CapChanged",
        "AllowChanged",
        "AllowChanged",
        "PrincipalLocked",
        "Paused",
        "PolicyVersionBumped",
    ]
    key_cap, p_cap, proto, recip, locked, paused, ver = (e.payload for e in evs)
    assert key_cap == {
        "kind": "key",
        "subject": key_minh,
        "oldCap": 20_000_000_000,
        "newCap": 10_000_000_000,
    }
    assert p_cap == {"kind": "principal", "subject": "minh", "oldCap": 0, "newCap": 30_000_000_000}
    assert proto == {
        "kind": "protocol",
        "subject": env.evil_dex.address,
        "selector": "0x10b84623",
        "allowed": True,
    }
    assert recip["kind"] == "recipient" and recip["selector"] is None and recip["allowed"] is True
    assert locked["principalId"] == "minh"
    assert set(paused) == {"by"} and ver == {"version": 2}

    snap = chain.snapshot()
    assert snap.policy_version == 2 and snap.paused is True
    assert snap.principals["minh"].locked is True
    assert snap.principals["minh"].daily_cap == 30_000_000_000
    assert snap.keys[key_minh].daily_cap == 10_000_000_000
    assert [p.allowed for p in snap.protocols] == [True, True]


def test_events_since_zero_replays_seed_history(env: Env) -> None:
    names = [e.name for e in _l1(env).events_since(0)]
    assert names.count("PrincipalCreated") == 7
    assert names.count("KeyAdded") == 8
    assert names.count("CapChanged") == 8
    assert names.count("AllowListRoleSet") == 0  # __seedRole does not emit, as on a genesis alloc


def test_poll_once_returns_only_new_blocks(env: Env) -> None:
    chain = _l1(env)
    last = int(env.w3.eth.block_number)
    assert chain.poll_once(last) == (last, [])
    _swap(env, 1_000_000)
    new_last, evs = chain.poll_once(last)
    assert new_last > last and [e.name for e in evs] == ["Swapped"]
