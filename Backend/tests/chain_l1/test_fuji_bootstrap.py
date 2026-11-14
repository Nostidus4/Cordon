"""`infra/l1/fuji-bootstrap.sh` end to end on two anvils (L1 stand-in with allow-list mocks + C-Chain stand-in).

NETWORK=local is the script's test mode: same orchestration as Fuji (deploy, seed with a timelock, C-Chain treasury,
SIMULATED top-up, handover, verify), anvil keys, FAST_FORWARD instead of waiting. Covers the dry run, a failure in the
middle (C-Chain unreachable) followed by a resume, and a second run that skips every step. Skipped without Foundry.
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
from tests.chain_l1.anvil_env import REPO, Anvil, artifact, find_binary

DEPLOYER_PK = "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"  # gitleaks:allow
TX_ALLOWLIST = "0x0200000000000000000000000000000000000002"
DEPLOYER_ALLOWLIST = "0x0200000000000000000000000000000000000000"
DEP = REPO / "Backend" / "deployments" / "fuji-bootstrap-l1.json"
DEP_REL = "../Backend/deployments/fuji-bootstrap-l1.json"
C_FILE = REPO / "Backend" / "deployments" / "pytest-c.json"
SEED_OUT = REPO / "infra" / "l1" / "seed.fuji-bootstrap.l1-local.json"
BOOT = REPO / "infra" / "l1" / "fuji-bootstrap.sh"


@pytest.fixture
def chains(
    anvil_binary: str, built_contracts: None, tmp_path: Path
) -> Iterator[tuple[Anvil, Anvil, dict[str, str]]]:
    l1, cchain = Anvil(anvil_binary), Anvil(anvil_binary)
    w3 = l1.w3
    deployer = Account.from_key(DEPLOYER_PK).address
    w3.provider.make_request("anvil_setBalance", [deployer, hex(100 * 10**18)])
    mock = artifact("MockAllowList", "MockAllowList", "MockAllowList")
    for addr in (TX_ALLOWLIST, DEPLOYER_ALLOWLIST):
        w3.provider.make_request("anvil_setCode", [addr, mock["deployedBytecode"]["object"]])
        al = w3.eth.contract(address=addr, abi=mock["abi"])
        w3.eth.wait_for_transaction_receipt(
            al.functions.__seedRole(deployer, 2).transact({"from": w3.eth.accounts[0]})
        )
    venv_bin = REPO / "Backend" / ".venv" / "bin"
    env = {
        **os.environ,
        "PATH": f"{venv_bin}:{Path(find_binary('forge') or '').parent}:{os.environ['PATH']}",
        "NETWORK": "local",
        "RPC_URL": l1.url,
        "CCHAIN_RPC_URL": cchain.url,
        "L1_LOCAL_ENV_FILE": str(tmp_path / "env.l1-local"),
        "L1_LOCAL_SEED_FILE": str(SEED_OUT),
        "DEPLOYMENTS_OUT": DEP_REL,
        "CCHAIN_DEPLOYMENTS": str(C_FILE),
        "FAST_FORWARD": "1",
        "COUNCIL_TIMELOCK_S": "30",
    }
    env.pop("I_UNDERSTAND", None)
    try:
        yield l1, cchain, env
    finally:
        l1.stop()
        cchain.stop()
        for f in (DEP, C_FILE, SEED_OUT):
            f.unlink(missing_ok=True)


def boot(env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(BOOT), *args],
        check=False,
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=900,
    )


def test_bootstrap_dry_run_failure_resume_and_rerun(
    chains: tuple[Anvil, Anvil, dict[str, str]],
) -> None:
    l1, cchain, env = chains

    dry = boot(env, "--dry-run")
    assert dry.returncode == 0, dry.stdout + dry.stderr
    assert "nothing was sent" in dry.stdout and "L1 contracts: not deployed" in dry.stdout
    assert not DEP.exists() and not C_FILE.exists()

    # run 1: the C-Chain is unreachable -> stops at step 4, after the L1 was deployed and seeded
    bad = boot({**env, "CCHAIN_RPC_URL": "http://127.0.0.1:1"})
    assert bad.returncode != 0
    assert "[2/9]" in bad.stdout and "[4/9]" in bad.stdout and "[5/9]" not in bad.stdout
    assert DEP.exists() and not C_FILE.exists()

    # run 2: resumes. L1 deploy and seed are skipped, the rest runs
    ok = boot(env)
    assert ok.returncode == 0, ok.stdout[-3000:] + ok.stderr[-3000:]
    assert "skip: already deployed" in ok.stdout and "skip: seed verified" in ok.stdout
    assert "DONE" in ok.stdout

    dep = json.loads(C_FILE.read_text())
    assert dep["threshold"] == 3 and len(dep["owners"]) == 5
    erc20 = cchain.w3.eth.contract(
        address=dep["token"], abi=artifact("CChainUSDC", "CChainUSDC", "CChainUSDC")["abi"]
    )
    assert erc20.functions.balanceOf(dep["treasury"]).call() == 1_800_000 * 10**6
    assert erc20.functions.balanceOf(dep["escrow"]).call() == 200_000 * 10**6

    c = json.loads(DEP.read_text())["contracts"]
    w3: Web3 = l1.w3
    vault = w3.eth.contract(address=c["vault"], abi=load_abi("IPolicyVault"))
    events = vault.events.TopUpRecorded().get_logs(from_block=0)
    assert len(events) == 1 and events[0]["args"]["amount"] == 200_000 * 10**6
    c_tx = "0x" + events[0]["args"]["cChainTxHash"].hex()
    assert cchain.w3.eth.get_transaction_receipt(c_tx)["status"] == 1
    tusdc = w3.eth.contract(address=c["tUSDC"], abi=erc20.abi)
    assert tusdc.functions.balanceOf(c["vault"]).call() >= 200_000 * 10**6
    council = w3.eth.contract(address=c["council"], abi=load_abi("IGuardianCouncil"))
    assert tusdc.functions.minter().call() == council.address  # handed over after the top-up
    assert vault.functions.topUpOperator().call() != Account.from_key(DEPLOYER_PK).address

    # run 3: everything is done, every step skips, no second top-up
    again = boot(env)
    assert again.returncode == 0, again.stdout[-2000:] + again.stderr[-2000:]
    assert again.stdout.count("skip:") >= 4 and "top-up recorded" not in again.stdout
    assert len(vault.events.TopUpRecorded().get_logs(from_block=0)) == 1


def test_bootstrap_refuses_fuji_without_acknowledgement() -> None:
    env = {k: v for k, v in os.environ.items() if k != "I_UNDERSTAND"}
    done = subprocess.run(
        ["bash", str(BOOT)],
        env={**env, "NETWORK": "fuji", "RPC_URL": "http://127.0.0.1:1"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 1 and "I_UNDERSTAND=fuji" in done.stderr
