"""OPS-002 end to end on two anvils: `make deploy-cchain` then `make topup AMOUNT=200000`.

anvil 1 stands in for the C-Chain, anvil 2 for the Guardian L1 (real PolicyVault + TestUSDC, deployer = minter and
topUpOperator, as before the handover). Skipped when Foundry is missing. Test keys only (anvil's public dev keys).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from web3 import Web3

from tests.chain_l1.anvil_env import REPO, Anvil, artifact, find_binary

DEPLOYER_KEY = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"  # gitleaks:allow
)
DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ZERO = "0x" + "00" * 20
OUT_NAME = (
    "pytest-c.json"  # forge may only write below Backend/deployments (foundry.toml fs_permissions)
)
BACKEND = REPO / "Backend"


@pytest.fixture(scope="module")
def two_chains() -> Iterator[tuple[Anvil, Anvil]]:
    binary = find_binary("anvil")
    forge = find_binary("forge")
    if binary is None or forge is None:
        pytest.skip("Foundry (anvil, forge) is not installed; the C-Chain top-up test is skipped")
    subprocess.run([forge, "build"], cwd=REPO / "contracts", check=True, capture_output=True)
    c_chain, l1 = Anvil(binary), Anvil(binary)
    try:
        yield c_chain, l1
    finally:
        c_chain.stop()
        l1.stop()
        (BACKEND / "deployments" / OUT_NAME).unlink(missing_ok=True)


def _deploy_l1(l1: Anvil) -> tuple[Any, Any]:
    """Real TestUSDC and PolicyVault; registry/council are placeholders (the top-up does not touch them)."""
    w3 = l1.w3
    tok_art = artifact("TestUSDC", "TestUSDC", "TestUSDC")
    token = w3.eth.contract(abi=tok_art["abi"], bytecode=tok_art["bytecode"]["object"])
    rc = w3.eth.wait_for_transaction_receipt(token.constructor().transact({"from": DEPLOYER}))
    token = w3.eth.contract(address=rc["contractAddress"], abi=tok_art["abi"])
    v_art = artifact("PolicyVault", "PolicyVault")
    vault = w3.eth.contract(abi=v_art["abi"], bytecode=v_art["bytecode"]["object"])
    placeholder = "0x000000000000000000000000000000000000dEaD"
    rc = w3.eth.wait_for_transaction_receipt(
        vault.constructor(placeholder, placeholder, token.address, ZERO, DEPLOYER).transact(
            {"from": DEPLOYER}
        )
    )
    return token, w3.eth.contract(address=rc["contractAddress"], abi=v_art["abi"])


def _cchain_env(c_chain: Anvil) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("CCHAIN_", "L1_"))}
    env.update(
        NETWORK="local",
        CCHAIN_RPC_URL=c_chain.url,
        CCHAIN_DEPLOYMENTS_OUT=f"../Backend/deployments/{OUT_NAME}",
        CCHAIN_DEPLOYMENTS=str(BACKEND / "deployments" / OUT_NAME),
    )
    return env


def _bash(step: str, env: dict[str, str], **extra: str) -> subprocess.CompletedProcess[str]:
    path = (
        f"{Path(sys.executable).parent}{os.pathsep}{Path.home() / '.foundry' / 'bin'}{os.pathsep}"
    )
    return subprocess.run(
        ["bash", str(REPO / "infra" / "cchain" / "cchain.sh"), step],
        env={**env, **extra, "PATH": path + os.environ["PATH"]},
        capture_output=True,
        text=True,
        check=False,
    )


def test_deploy_then_topup_end_to_end(two_chains: tuple[Anvil, Anvil]) -> None:
    c_chain, l1 = two_chains
    env = _cchain_env(c_chain)

    # --- make deploy-cchain (local)
    done = _bash("deploy", env)
    assert done.returncode == 0, done.stdout + done.stderr
    dep = json.loads((BACKEND / "deployments" / OUT_NAME).read_text())
    assert set(dep) == {
        "network", "chainId", "rpcUrl", "wsUrl", "token", "treasury",
        "escrow", "owners", "threshold", "deployBlock",
    }  # fmt: skip
    assert dep["network"] == "local" and dep["threshold"] == 3 and len(dep["owners"]) == 5
    assert dep["chainId"] == c_chain.w3.eth.chain_id and dep["wsUrl"] is None
    assert dep["rpcUrl"] == c_chain.url
    assert not any(k.lower().endswith("key") for k in dep)  # addresses only
    erc20 = c_chain.w3.eth.contract(
        address=dep["token"],
        abi=artifact("CChainUSDC", "CChainUSDC", "CChainUSDC")["abi"],
    )
    assert erc20.functions.balanceOf(dep["treasury"]).call() == 2_000_000 * 10**6
    assert erc20.functions.decimals().call() == 6

    # --- make topup AMOUNT=200000 (local)
    l1_token, vault = _deploy_l1(l1)
    l1_file = BACKEND / "deployments" / "pytest-l1.json"
    l1_file.write_text(
        json.dumps({"contracts": {"vault": vault.address, "tUSDC": l1_token.address}})
    )
    try:
        top = _bash(
            "topup",
            env,
            AMOUNT="200000",
            L1_DEPLOYMENTS=str(l1_file),
            L1_RPC_URL=l1.url,
            L1_TOPUP_KEY=DEPLOYER_KEY,
        )
    finally:
        l1_file.unlink(missing_ok=True)
    assert top.returncode == 0, top.stdout + top.stderr
    summary = json.loads(top.stdout.strip().splitlines()[-1])
    assert summary["simulated"] is True

    amount = 200_000 * 10**6
    assert l1_token.functions.balanceOf(vault.address).call() == amount
    assert erc20.functions.balanceOf(dep["treasury"]).call() == 1_800_000 * 10**6
    assert erc20.functions.balanceOf(dep["escrow"]).call() == amount
    events = vault.events.TopUpRecorded().get_logs(from_block=0)
    assert len(events) == 1
    c_hash = events[0]["args"]["cChainTxHash"]
    assert events[0]["args"]["amount"] == amount
    assert "0x" + c_hash.hex() == summary["cChainTxHash"]
    # the recorded hash is the C-Chain multisig execute transaction
    receipt = c_chain.w3.eth.get_transaction_receipt(c_hash)
    assert receipt["status"] == 1 and receipt["to"] == Web3.to_checksum_address(dep["treasury"])


def test_topup_stops_before_moving_anything_when_l1_minter_was_handed_over(
    two_chains: tuple[Anvil, Anvil],
) -> None:
    """After the handover the minter is the Council: the script must fail before touching the C-Chain."""
    c_chain, l1 = two_chains
    env = _cchain_env(c_chain)
    if not (BACKEND / "deployments" / OUT_NAME).exists():
        assert _bash("deploy", env).returncode == 0
    dep = json.loads((BACKEND / "deployments" / OUT_NAME).read_text())
    erc20 = c_chain.w3.eth.contract(
        address=dep["token"], abi=artifact("CChainUSDC", "CChainUSDC", "CChainUSDC")["abi"]
    )
    before = erc20.functions.balanceOf(dep["treasury"]).call()
    l1_token, vault = _deploy_l1(l1)
    l1_token.functions.setMinter("0x000000000000000000000000000000000000dEaD").transact(
        {"from": DEPLOYER}
    )
    l1_file = BACKEND / "deployments" / "pytest-l1.json"
    l1_file.write_text(
        json.dumps({"contracts": {"vault": vault.address, "tUSDC": l1_token.address}})
    )
    try:
        top = _bash(
            "topup", env, AMOUNT="1", L1_DEPLOYMENTS=str(l1_file), L1_RPC_URL=l1.url,
            L1_TOPUP_KEY=DEPLOYER_KEY,
        )  # fmt: skip
    finally:
        l1_file.unlink(missing_ok=True)
    assert top.returncode == 1 and "not the L1 tUSDC minter" in top.stderr
    assert erc20.functions.balanceOf(dep["treasury"]).call() == before


@pytest.mark.parametrize("step", ["deploy", "topup"])
def test_fuji_is_refused_without_the_acknowledgement(step: str) -> None:
    env = {k: v for k, v in os.environ.items() if k != "I_UNDERSTAND"}
    done = subprocess.run(
        ["bash", str(REPO / "infra" / "cchain" / "cchain.sh"), step],
        env={**env, "NETWORK": "fuji", "AMOUNT": "1"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 1 and "I_UNDERSTAND=fuji" in done.stderr
