"""Parametrised chain fixture: every test in this folder runs on SimChain and on L1Chain (anvil).

The `l1` variant skips (with the reason) when Foundry is not installed; the sim variant always runs.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from web3 import Web3

from guardian.chain.l1 import L1Chain
from guardian.chain.l1.signers import NodeSigner, SignerRegistry
from guardian.chain.sim import SimChain
from guardian.chain.sim.engine import load_seed
from tests.chain_l1.anvil_env import AllowListEnforcingProvider, Anvil, Env, deploy_may_labs
from tests.chain_l1.conftest import anvil_binary, built_contracts, env, l1  # noqa: F401
from tests.conformance.harness import Net

T0 = 1_800_000_000 - 1_800_000_000 % 86400 + 3600  # 01:00 UTC, fixed day for the sim


@pytest.fixture(params=["sim", "l1"])
def net(request: pytest.FixtureRequest) -> Iterator[Net]:
    """A fresh chain per test, same seed (May Labs policy v1)."""
    if request.param == "sim":
        seed = load_seed()
        yield Net("sim", SimChain(seed, clock=lambda: T0), seed)
        return
    e = request.getfixturevalue("env")
    chain = request.getfixturevalue("l1")
    yield Net("l1", chain, e.seed, e)


TIMELOCK_S = 60


@pytest.fixture(params=["sim", "l1"])
def tl_net(request: pytest.FixtureRequest) -> Iterator[Net]:
    """Like `net` but the Council has a 60 s timelock (#77); `Net.advance_seconds` moves time."""
    if request.param == "sim":
        seed = load_seed()
        cell = [T0]
        yield Net(
            "sim", SimChain(seed, clock=lambda: cell[0], timelock_s=TIMELOCK_S), seed, clock=cell
        )
        return
    binary = request.getfixturevalue("anvil_binary")
    request.getfixturevalue("built_contracts")
    node = Anvil(binary)
    try:
        e: Env = deploy_may_labs(node, timelock_s=TIMELOCK_S)
        e.fund_and_impersonate_all()
        w3 = Web3(AllowListEnforcingProvider(e.anvil.url))
        signers = SignerRegistry(
            [NodeSigner(x["address"]) for x in (*e.seed["keys"], *e.seed["council"])]
        )
        chain = L1Chain(w3, e.dep, e.seed, signers=signers)
        try:
            yield Net("l1", chain, e.seed, e)
        finally:
            chain.close()
    finally:
        node.stop()
