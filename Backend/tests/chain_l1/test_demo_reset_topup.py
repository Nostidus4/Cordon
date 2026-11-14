"""`infra/l1/demo-reset.sh` step 3b (DEMO_RESET_TOPUP=1): the SIMULATED top-up on the freshly deployed set.

Two anvils: the L1 stand-in (allow-list mocks, timelocked Council, FAST_FORWARD) and the C-Chain stand-in (real
3-of-5 multisig + tUSDC from `infra/cchain/cchain.sh deploy`). The first set is deployed, seeded and handed over; then
`demo-reset.sh` replaces it. Anvil keys and the public test keys only, nothing leaves the machine. Skipped without
Foundry.

  * flag unset: behaviour unchanged (no 3b, new vault has only the seed funding);
  * flag set but no C-Chain deployment file: step skipped with a log line;
  * flag set: the new vault holds seed + top-up, exactly one TopUpRecorded whose hash is the multisig execute tx;
  * a failure in step 4 (switch) after the top-up, then a re-run: resumes at 4b, never tops up twice.
"""

from __future__ import annotations

import json
import os
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from eth_account import Account
from web3 import Web3

from guardian.chain.contracts import load_abi
from tests.chain_l1.anvil_env import REPO, Anvil, artifact, find_binary

DEPLOYER_PK = "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027"  # gitleaks:allow
TX_ALLOWLIST = "0x0200000000000000000000000000000000000002"
DEPLOYER_ALLOWLIST = "0x0200000000000000000000000000000000000000"
DEP_NAME = "demo-reset-bootstrap-l1.json"
DEP = REPO / "Backend" / "deployments" / DEP_NAME
NEXT = REPO / "Backend" / "deployments" / f"{DEP_NAME}.next"
C_NAME = "pytest-demo-reset-c.json"
C_FILE = REPO / "Backend" / "deployments" / C_NAME
SEED_OUT = REPO / "infra" / "l1" / "seed.demo-reset-bootstrap.l1-local.json"
CONTRACTS = REPO / "infra" / "l1" / "contracts.sh"
RESET = REPO / "infra" / "l1" / "demo-reset.sh"
CCHAIN = REPO / "infra" / "cchain" / "cchain.sh"
SEED_FUNDING = 200_000 * 10**6


@pytest.fixture
def world(
    anvil_binary: str, built_contracts: None, tmp_path: Path
) -> Iterator[tuple[Anvil, Anvil, dict[str, str]]]:
    """L1 deployed + seeded + handed over; returns (l1, cchain, env for demo-reset)."""
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
    forge_dir = Path(find_binary("forge") or "").parent
    env = {
        **os.environ,
        "PATH": f"{venv_bin}:{forge_dir}:{os.environ['PATH']}",
        "NETWORK": "local",
        "RPC_URL": l1.url,
        "CCHAIN_RPC_URL": cchain.url,
        "L1_LOCAL_ENV_FILE": str(tmp_path / "env.l1-local"),
        "L1_LOCAL_SEED_FILE": str(SEED_OUT),
        "DEMO_RESET_DEP_NAME": DEP_NAME,
        "CCHAIN_DEPLOYMENTS": str(C_FILE),
        "FAST_FORWARD": "1",
        "COUNCIL_TIMELOCK_S": "30",
        "API_URL": "http://127.0.0.1:1",  # no API: the script resets the chain anyway
    }
    env.pop("I_UNDERSTAND", None)
    env.pop("DEMO_RESET_TOPUP", None)
    try:
        setup = {**env, "DEPLOYMENTS_OUT": f"../Backend/deployments/{DEP_NAME}"}
        for step in ("deploy", "seed", "handover"):
            r = subprocess.run(
                ["bash", str(CONTRACTS), step],
                cwd=REPO,
                env=setup,
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
            assert r.returncode == 0, f"{step}:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}"
        yield l1, cchain, env
    finally:
        l1.stop()
        cchain.stop()
        for f in (DEP, NEXT, C_FILE, SEED_OUT):
            f.unlink(missing_ok=True)


def deploy_cchain(env: dict[str, str]) -> None:
    r = subprocess.run(
        ["bash", str(CCHAIN), "deploy"],
        cwd=REPO,
        env={**env, "CCHAIN_DEPLOYMENTS_OUT": f"../Backend/deployments/{C_NAME}"},
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    assert r.returncode == 0 and C_FILE.exists(), r.stdout[-2000:] + r.stderr[-2000:]


def reset(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(RESET)],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=1200,
        check=False,
    )


def vault_of(path: Path, w3: Web3) -> tuple[Any, dict[str, str]]:
    c = json.loads(path.read_text())["contracts"]
    return w3.eth.contract(address=c["vault"], abi=load_abi("IPolicyVault")), c


def balance(w3: Web3, token: str, who: str) -> int:
    abi = artifact("CChainUSDC", "CChainUSDC", "CChainUSDC")["abi"]
    return int(w3.eth.contract(address=token, abi=abi).functions.balanceOf(who).call())


def test_flag_off_is_unchanged_and_flag_without_cchain_file_skips(
    world: tuple[Anvil, Anvil, dict[str, str]],
) -> None:
    l1, _cchain, env = world

    r1 = reset(env)  # no DEMO_RESET_TOPUP
    assert r1.returncode == 0, r1.stdout[-3000:] + r1.stderr[-3000:]
    assert "3b" not in r1.stdout and "RESET COMPLETE" in r1.stdout
    vault, c = vault_of(DEP, l1.w3)
    assert vault.events.TopUpRecorded().get_logs(from_block=0) == []
    assert balance(l1.w3, c["tUSDC"], c["vault"]) == SEED_FUNDING

    # flag on, but no C-Chain deployment (never created in this test): skipped, the reset still completes
    r2 = reset({**env, "DEMO_RESET_TOPUP": "1"})
    assert r2.returncode == 0, r2.stdout[-3000:] + r2.stderr[-3000:]
    assert "3b topup skipped: no C-Chain treasury" in r2.stdout and "RESET COMPLETE" in r2.stdout
    vault, c = vault_of(DEP, l1.w3)
    assert vault.events.TopUpRecorded().get_logs(from_block=0) == []
    assert balance(l1.w3, c["tUSDC"], c["vault"]) == SEED_FUNDING


def test_flag_on_tops_up_the_new_vault_and_resume_does_not_repeat_it(
    world: tuple[Anvil, Anvil, dict[str, str]], tmp_path: Path
) -> None:
    l1, cchain, env = world
    deploy_cchain(env)
    cdep = json.loads(C_FILE.read_text())
    old_vault, _ = vault_of(DEP, l1.w3)
    assert old_vault.events.TopUpRecorded().get_logs(from_block=0) == []
    assert balance(cchain.w3, cdep["token"], cdep["escrow"]) == 0

    # contracts.sh wrapper: the first reset-switch really runs, then "dies" (a failure inside step 4)
    wrapper = tmp_path / "contracts-fail-once.sh"
    flag = tmp_path / "failed-once"
    wrapper.write_text(
        f'#!/usr/bin/env bash\nif [[ "$1" == reset-switch && ! -e "{flag}" ]]; then\n'
        f'  touch "{flag}"; bash "{CONTRACTS}" reset-switch; echo "injected failure" >&2; exit 1\nfi\n'
        f'exec bash "{CONTRACTS}" "$@"\n'
    )
    run_env = {
        **env,
        "DEMO_RESET_TOPUP": "1",
        "DEMO_RESET_TOPUP_AMOUNT": "150000",
        "DEMO_RESET_CONTRACTS_SH": str(wrapper),
    }
    r1 = reset(run_env)
    assert r1.returncode != 0 and "4 switch failed" in r1.stderr
    assert "3b topup done" in r1.stdout and NEXT.exists()
    new_vault, _ = vault_of(NEXT, l1.w3)
    assert len(new_vault.events.TopUpRecorded().get_logs(from_block=0)) == 1  # before the failure

    r2 = reset(run_env)  # re-run: resumes at 4b, must not top up again
    assert r2.returncode == 0, r2.stdout[-3000:] + r2.stderr[-3000:]
    assert "resuming" in r2.stdout and "3b" not in r2.stdout and "RESET COMPLETE" in r2.stdout
    assert not NEXT.exists() and DEP.exists()

    amount = 150_000 * 10**6
    vault, c = vault_of(DEP, l1.w3)
    assert c["vault"] == new_vault.address
    events = vault.events.TopUpRecorded().get_logs(from_block=0)
    assert len(events) == 1 and events[0]["args"]["amount"] == amount
    c_tx = "0x" + events[0]["args"]["cChainTxHash"].hex()
    assert f"3b C-Chain multisig execute tx: {c_tx}" in r1.stdout
    receipt = cchain.w3.eth.get_transaction_receipt(c_tx)
    assert receipt["status"] == 1 and receipt["to"].lower() == cdep["treasury"].lower()
    # funds: seed + exactly one top-up in the vault, exactly one transfer into the escrow
    assert balance(l1.w3, c["tUSDC"], c["vault"]) == SEED_FUNDING + amount
    assert balance(cchain.w3, cdep["token"], cdep["escrow"]) == amount
    tusdc_abi = artifact("TestUSDC", "TestUSDC", "TestUSDC")["abi"]
    tusdc = l1.w3.eth.contract(address=c["tUSDC"], abi=tusdc_abi)
    assert tusdc.functions.minter().call() == c["council"]  # handed over after the top-up
    assert vault.functions.topUpOperator().call() != Account.from_key(DEPLOYER_PK).address
