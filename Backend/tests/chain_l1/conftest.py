"""Anvil fixtures. The anvil tests skip with a clear message when Foundry is not installed."""

from __future__ import annotations

import subprocess
from collections.abc import Iterator

import pytest

from tests.chain_l1.anvil_env import OUT, REPO, Anvil, Env, deploy_may_labs, find_binary

SKIP_MSG = (
    "Foundry is not installed (needs `anvil` and `forge`, see https://getfoundry.sh); "
    "the anvil integration tests are skipped."
)


@pytest.fixture(scope="session")
def anvil_binary() -> str:
    binary = find_binary("anvil")
    if binary is None or find_binary("forge") is None:
        pytest.skip(SKIP_MSG)
    return binary


@pytest.fixture(scope="session")
def built_contracts(anvil_binary: str) -> None:
    forge = find_binary("forge")
    assert forge
    if not (OUT / "PolicyVault.sol" / "PolicyVault.json").exists():
        subprocess.run([forge, "build"], cwd=REPO / "contracts", check=True, capture_output=True)


@pytest.fixture
def env(anvil_binary: str, built_contracts: None) -> Iterator[Env]:
    """A fresh anvil with May Labs policy v1 seeded (the state of `Backend/seed/may_labs.json`)."""
    node = Anvil(anvil_binary)
    try:
        yield deploy_may_labs(node)
    finally:
        node.stop()
