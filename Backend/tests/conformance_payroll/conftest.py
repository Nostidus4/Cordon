"""Anvil fixture of the payroll conformance suite. The l1 comparison skips (with the reason) when Foundry is not
installed; the sim half (`test_sim_matches_expectations`) always runs."""

from __future__ import annotations

import subprocess
from collections.abc import Iterator

import pytest

from tests.chain_l1.anvil_env import OUT, REPO, Anvil, find_binary
from tests.chain_l1.conftest import SKIP_MSG
from tests.conformance_payroll.payroll_harness import PNet, make_l1_net


@pytest.fixture(scope="session")
def payroll_artifacts() -> None:
    forge = find_binary("forge")
    if find_binary("anvil") is None or forge is None:
        pytest.skip(SKIP_MSG)
    if not (OUT / "PayrollVault.sol" / "PayrollVault.json").exists():
        subprocess.run([forge, "build"], cwd=REPO / "contracts", check=True, capture_output=True)


@pytest.fixture
def l1_net(payroll_artifacts: None) -> Iterator[PNet]:
    anvil = Anvil(find_binary("anvil") or "anvil")
    try:
        yield make_l1_net(anvil)
    finally:
        anvil.stop()
