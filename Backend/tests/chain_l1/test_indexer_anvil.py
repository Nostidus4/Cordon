"""IDX-001 acceptance on a local anvil: idempotency, rebuild, latency, RPC drop, scene-4 sequence."""

from __future__ import annotations

import time
from typing import Any

import pytest
from eth_utils import keccak

from guardian.chain.base import ChainEvent
from guardian.chain.l1 import L1Chain
from guardian.workers.indexer import Indexer, InMemoryEventSink, L1ChainSource
from tests.chain_l1.anvil_env import Env, pid32

SWAP_SELECTOR = bytes.fromhex("10b84623")


def _source(env: Env) -> L1ChainSource:
    return L1ChainSource(L1Chain(env.w3, env.dep, env.seed))


def _swap(env: Env, amount: int = 5_000_000_000) -> None:
    key = env.as_key(env.seed["keys"][1]["address"])  # agent_data
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


def _pay(env: Env, amount: int) -> None:
    key = env.as_key(env.seed["keys"][1]["address"])
    to = env.seed["recipients"][0]["address"]
    env.send(
        env.vault.functions.pay(env.tokens["tUSDC"].address, to, amount, keccak(text="m")), key
    )


def _lock_and_allowlist(env: Env, principal: str, keys: list[str]) -> None:
    data = env.vault.encode_abi("lockPrincipal", args=[pid32(principal)])
    env.send(env.council_stub.functions.forward(env.vault.address, data), env.admin)
    for k in keys:
        env.send(env.allowlist.functions.setNone(k), env.admin)


def _scene4(env: Env) -> None:
    _swap(env)
    _pay(env, 1_000_000)
    _pay(env, 2_000_000)
    _lock_and_allowlist(env, "agent_data", [k["address"] for k in env.seed["keys"][:5]])


def _view(events: list[ChainEvent]) -> list[tuple[Any, ...]]:
    return [(e.name, e.block, e.tx_hash, e.log_index, e.payload, e.ts, e.simulated) for e in events]


def test_scene4_sequence_in_sink_then_idempotent_and_rebuildable(env: Env) -> None:
    sink = InMemoryEventSink()
    idx = Indexer(_source(env), sink)
    idx.sync_once()  # backfills the seed (setup events) from the deployment block
    seeded = len(sink)
    assert seeded > 0

    _scene4(env)
    idx.sync_once()
    tail = sink.all()[seeded:]
    assert [e.name for e in tail] == [
        "Swapped",
        "Paid",
        "Paid",
        "PrincipalLocked",
        *["AllowListRoleSet"] * 5,
    ]
    assert all(e.simulated is False for e in tail)
    assert tail[0].payload["principalSpentAfter"] == 5_000_000_000

    # running again, and from a second indexer on the same sink, adds nothing
    original = _view(sink.all())
    idx.sync_once()
    Indexer(_source(env), sink).sync_once()
    assert _view(sink.all()) == original
    assert sink.last_block() == env.w3.eth.block_number

    # wiped sink: replay from the deployment block gives the identical list
    rebuilt = InMemoryEventSink()
    Indexer(_source(env), rebuilt).sync_once()
    assert _view(rebuilt.all()) == original


def test_swapped_reaches_sink_within_three_seconds(env: Env) -> None:
    sink = InMemoryEventSink()
    idx = Indexer(_source(env), sink, poll_interval=0.25)
    idx.sync_once()
    idx.start()
    try:
        before = len(sink)
        sent = time.monotonic()
        _swap(env)
        while not any(e.name == "Swapped" for e in sink.all()) and time.monotonic() - sent < 10:
            time.sleep(0.02)
        elapsed = time.monotonic() - sent
    finally:
        idx.stop()
    assert any(e.name == "Swapped" for e in sink.all()), "Swapped never arrived"
    assert elapsed <= 3.0, elapsed
    assert len(sink) == before + 1


def test_rpc_drop_mid_run_loses_and_duplicates_nothing(env: Env) -> None:
    source = _source(env)
    real_head = source.head
    down = {"on": False}

    def flaky_head() -> int:
        if down["on"]:
            raise ConnectionError("connection dropped")
        return real_head()

    source.head = flaky_head  # type: ignore[method-assign]
    sink = InMemoryEventSink()
    idx = Indexer(source, sink, poll_interval=0.05, max_backoff=0.2)
    idx.sync_once()
    idx.start()
    try:
        _swap(env, 1_000_000)
        down["on"] = True  # "ws drop": polls fail while more events are produced
        _pay(env, 1_000_000)
        _pay(env, 2_000_000)
        time.sleep(0.5)
        assert idx.status().last_error
        down["on"] = False
        deadline = time.time() + 10
        want = len(Indexer(_source(env), InMemoryEventSink()).sync_once())
        while len(sink) < want and time.time() < deadline:
            time.sleep(0.05)
    finally:
        idx.stop()
    reference = InMemoryEventSink()
    Indexer(_source(env), reference).sync_once()
    assert _view(sink.all()) == _view(reference.all())
    assert [e.name for e in sink.all()[-3:]] == ["Swapped", "Paid", "Paid"]


def test_status_lag_is_zero_when_caught_up(env: Env) -> None:
    idx = Indexer(_source(env), InMemoryEventSink())
    idx.sync_once()
    st = idx.status()
    assert st.head_l1 == env.w3.eth.block_number and st.lag_blocks == 0


@pytest.mark.parametrize("window", [1, 5])
def test_window_rereads_do_not_duplicate_on_real_chain(env: Env, window: int) -> None:
    sink = InMemoryEventSink()
    idx = Indexer(_source(env), sink, reorg_window=window)
    idx.sync_once()
    n = len(sink)
    for _ in range(3):
        assert idx.sync_once() == []
    assert len(sink) == n
