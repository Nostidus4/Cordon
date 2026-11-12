"""Parametrised chain fixture: every test in this folder runs on SimChain and on L1Chain (anvil).

The `l1` variant skips (with the reason) when Foundry is not installed; the sim variant always runs.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from guardian.chain.sim import SimChain
from guardian.chain.sim.engine import load_seed
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
