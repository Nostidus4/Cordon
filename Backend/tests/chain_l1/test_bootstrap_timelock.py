"""L1 bootstrap with a Council timelock (#77): deploy, seed, handover through `infra/l1/contracts.sh` on anvil.

The Council's `timelockDelay` is immutable, so a real L1 deployed with `COUNCIL_TIMELOCK_S > 0` has to be bootstrapped
in two phases: the seed / handover scripts propose and approve (the proposals are only queued), then `contracts.sh`
waits for the chain clock to reach the eta and runs `Execute.s.sol`. Here the wait is a FAST_FORWARD (anvil
`evm_increaseTime`). VerifySeed and VerifyHandover must pass afterwards; with delay 0 nothing changes.
"""

from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from eth_account import Account
from web3 import Web3

from guardian.chain.contracts import load_abi
from tests.chain_l1.anvil_env import OUT, REPO, Anvil, artifact, find_binary

DEPLOYER_PK = "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"  # gitleaks:allow
TX_ALLOWLIST = "0x0200000000000000000000000000000000000002"
DEPLOYER_ALLOWLIST = "0x0200000000000000000000000000000000000000"
REL_DEP = "../Backend/deployments/anvil-bootstrap-l1.json"
DEP = REPO / "Backend" / "deployments" / "anvil-bootstrap-l1.json"
SEED_OUT = REPO / "infra" / "l1" / "seed.anvil-bootstrap.l1-local.json"


@pytest.fixture
def node(
    anvil_binary: str, built_contracts: None, tmp_path: Path
) -> Iterator[tuple[Anvil, dict[str, str]]]:
    n = Anvil(anvil_binary)
    w3 = n.w3
    deployer = Account.from_key(DEPLOYER_PK).address
    w3.provider.make_request("anvil_setBalance", [deployer, hex(100 * 10**18)])
    mock = artifact("MockAllowList", "MockAllowList", "MockAllowList")
    for addr in (TX_ALLOWLIST, DEPLOYER_ALLOWLIST):
        w3.provider.make_request("anvil_setCode", [addr, mock["deployedBytecode"]["object"]])
        al = w3.eth.contract(address=addr, abi=mock["abi"])
        w3.eth.wait_for_transaction_receipt(
            al.functions.__seedRole(deployer, 2).transact({"from": w3.eth.accounts[0]})
        )
    env = {
        **os.environ,
        "PATH": f"{Path(find_binary('forge') or '').parent}:{os.environ['PATH']}",
        "NETWORK": "local",
        "RPC_URL": n.url,
        "L1_LOCAL_ENV_FILE": str(tmp_path / "env.l1-local"),
        "L1_LOCAL_SEED_FILE": str(SEED_OUT),
        "DEPLOYMENTS_OUT": REL_DEP,
        "FAST_FORWARD": "1",
    }
    try:
        yield n, env
    finally:
        n.stop()
        DEP.unlink(missing_ok=True)
        SEED_OUT.unlink(missing_ok=True)


def run_step(step: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    r = subprocess.run(
        ["bash", str(REPO / "infra" / "l1" / "contracts.sh"), step],
        check=False,
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert r.returncode == 0, f"{step} failed:\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}"
    return r


@pytest.mark.parametrize("delay", [0, 30])
def test_deploy_seed_handover_verify_with_a_timelock(
    node: tuple[Anvil, dict[str, str]], delay: int
) -> None:
    n, env = node
    env = {**env, "COUNCIL_TIMELOCK_S": str(delay)}
    for step in ("deploy", "seed", "handover"):
        out = run_step(step, env)
        if delay and step in ("seed", "handover"):
            assert "queued" in out.stdout + out.stderr  # phase 1 only queued; phase 2 then executed
            assert "executed queued proposal" in out.stdout + out.stderr
    run_step("verify-seed", env)
    run_step("verify-handover", env)

    w3: Web3 = n.w3
    council = w3.eth.contract(
        address=json.loads(DEP.read_text())["contracts"]["council"],
        abi=load_abi("IGuardianCouncil"),
    )
    assert council.functions.timelockDelay().call() == delay
    count = council.functions.proposalCount().call()
    assert count == 3  # two seed proposals + the top-up operator hand-over
    for pid in range(1, count + 1):
        assert council.functions.getProposal(pid).call()[7] is True  # executed
        assert (council.functions.etaOf(pid).call() != 0) == (delay > 0)
    vault = w3.eth.contract(
        address=json.loads(DEP.read_text())["contracts"]["vault"], abi=load_abi("IPolicyVault")
    )
    assert vault.functions.policyVersion().call() == 4  # 3 proposals executed, version starts at 1
    assert OUT.exists()


def test_demo_reset_steps_with_a_timelock(node: tuple[Anvil, dict[str, str]]) -> None:
    """Reset (OPS-003) on a timelocked deployment: the old Council's queued proposals are executed between steps,
    then the new set is seeded, switched, finished and verified (the order of infra/l1/demo-reset.sh)."""
    n, env = node
    delay = 30
    env = {**env, "COUNCIL_TIMELOCK_S": str(delay), "TOP_UP_OPERATOR": Account.create().address}
    for step in ("deploy", "seed", "handover"):
        run_step(step, env)
    next_rel = "../Backend/deployments/anvil-bootstrap-l1.json.next"
    nxt = REPO / "Backend" / "deployments" / "anvil-bootstrap-l1.json.next"
    try:
        reset = {**env, "OLD_DEPLOYMENTS": REL_DEP, "DEPLOYMENTS_OUT": next_rel}
        for step in ("reset-open", "deploy", "seed", "reset-switch", "reset-finish"):
            run_step(step, reset)
        run_step("verify-seed", reset)
        run_step("verify-handover", reset)
        new = json.loads(nxt.read_text())["contracts"]["council"]
        council = n.w3.eth.contract(address=new, abi=load_abi("IGuardianCouncil"))
        assert council.functions.timelockDelay().call() == delay
        assert (
            council.functions.proposalCount().call() == 11
        )  # counter left at 11: request #12 comes next
    finally:
        nxt.unlink(missing_ok=True)
