"""Simulated top-up of the Guardian L1 vault from the C-Chain treasury (OPS-002, `make topup AMOUNT=200000`).

THE CROSS-CHAIN MOVE IS SIMULATED, there is no bridge. Steps:
  1. C-Chain: three owners of the 3-of-5 multisig move AMOUNT tUSDC from the treasury to the keyless escrow address
     (submit, confirm, confirm, execute). The execute transaction hash is the `cChainTxHash`.
  2. L1: the L1 tUSDC minter mints the same amount to the PolicyVault.
  3. L1: `PolicyVault.recordTopUp(cChainTxHash, amount)` emits `TopUpRecorded` (moves no funds).

L1 authority (frozen contracts): `mint` is allowed for the token minter only (the deployer until handover, then the
Council) and the Council cannot call a token (its proposal targets are limited to registry, vault and the two
precompiles), so this script works BEFORE the L1 handover only. `recordTopUp` needs the vault's `topUpOperator`
(the deployer until handover) or the Council. The script checks both and stops with a clear error otherwise.

Everything comes from the environment (no key is ever read from or written to a file in git):
  NETWORK                local (default) | fuji. fuji additionally needs I_UNDERSTAND=fuji.
  AMOUNT                 whole tUSDC (200000 = 200.000 tUSDC = 200000 * 10**6 base units)
  CCHAIN_DEPLOYMENTS     C-Chain deployment file (default Backend/deployments/<net>-c.json)
  CCHAIN_RPC_URL         overrides the rpcUrl of that file
  CCHAIN_OWNER_KEY_1..3  keys of three distinct owners of the multisig (any three of the five)
  L1_DEPLOYMENTS         L1 deployment file (default Backend/deployments/<net>-l1.json, `contracts.vault/tUSDC`)
  L1_RPC_URL             L1 RPC endpoint
  L1_TOPUP_KEY           L1 key that is the tUSDC minter and the vault top-up operator (the deployer before handover)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from eth_account import Account
from eth_utils import to_checksum_address
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

BACKEND = Path(__file__).resolve().parents[1]
DECIMALS = 6

ERC20_ABI = [
    {
        "type": "function",
        "name": "balanceOf",
        "stateMutability": "view",
        "inputs": [{"name": "a", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "decimals",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
    },
    {
        "type": "function",
        "name": "transfer",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "to", "type": "address"}, {"name": "v", "type": "uint256"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "type": "function",
        "name": "mint",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "to", "type": "address"}, {"name": "v", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "minter",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
]

MULTISIG_ABI = [
    {
        "type": "function",
        "name": "submit",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "value", "type": "uint256"},
            {"name": "data", "type": "bytes"},
        ],
        "outputs": [{"name": "id", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "confirm",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "id", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "execute",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "id", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "txCount",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "isOwner",
        "stateMutability": "view",
        "inputs": [{"name": "a", "type": "address"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
]

VAULT_ABI = [
    {
        "type": "function",
        "name": "recordTopUp",
        "stateMutability": "nonpayable",
        "inputs": [{"name": "h", "type": "bytes32"}, {"name": "amount", "type": "uint256"}],
        "outputs": [],
    },
    {
        "type": "function",
        "name": "topUpOperator",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
    {
        "type": "function",
        "name": "council",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
    {
        "type": "event",
        "name": "TopUpRecorded",
        "anonymous": False,
        "inputs": [
            {"name": "cChainTxHash", "type": "bytes32", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
]


class TopUpError(RuntimeError):
    pass


def _send(w3: Web3, key: str, fn: Any, what: str) -> Any:
    """Sign and send one contract call, wait for the receipt, fail loudly on a revert."""
    acct = Account.from_key(key)
    tx = fn.build_transaction(
        {
            "from": acct.address,
            "nonce": w3.eth.get_transaction_count(acct.address, "pending"),
            "chainId": w3.eth.chain_id,
        }
    )
    signed = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    rc = w3.eth.wait_for_transaction_receipt(h, timeout=180)
    if rc["status"] != 1:
        raise TopUpError(f"{what} reverted (tx {h.hex()})")
    print(f"  {what}: tx 0x{h.hex().removeprefix('0x')} gas {rc['gasUsed']}")
    return rc


def run_topup(
    *,
    amount_tusdc: int,
    c_deployment: dict[str, Any],
    c_rpc: str,
    owner_keys: list[str],
    l1_rpc: str,
    l1_vault: str,
    l1_token: str,
    l1_key: str,
) -> dict[str, Any]:
    """Run the simulated top-up and return a summary (also used by the pytest)."""
    if amount_tusdc <= 0:
        raise TopUpError("AMOUNT must be a positive whole number of tUSDC")
    amount = amount_tusdc * 10**DECIMALS
    if len({Account.from_key(k).address for k in owner_keys}) < int(c_deployment["threshold"]):
        raise TopUpError(f"need {c_deployment['threshold']} distinct owner keys")

    cw = Web3(Web3.HTTPProvider(c_rpc))
    lw = Web3(Web3.HTTPProvider(l1_rpc))
    # Avalanche C-Chain and Subnet-EVM headers carry more than 32 bytes of extraData; without this web3.py rejects
    # every block it reads (ExtraDataLengthError), as on the first Fuji run. Anvil does not, so tests missed it.
    for w in (cw, lw):
        w.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    if cw.eth.chain_id != c_deployment["chainId"]:
        raise TopUpError(
            f"C-Chain RPC chain id {cw.eth.chain_id} != deployment {c_deployment['chainId']}"
        )

    safe = cw.eth.contract(address=to_checksum_address(c_deployment["treasury"]), abi=MULTISIG_ABI)
    ctoken = cw.eth.contract(address=to_checksum_address(c_deployment["token"]), abi=ERC20_ABI)
    escrow = to_checksum_address(c_deployment["escrow"])
    vault = lw.eth.contract(address=to_checksum_address(l1_vault), abi=VAULT_ABI)
    ltoken = lw.eth.contract(address=to_checksum_address(l1_token), abi=ERC20_ABI)
    l1_signer = Account.from_key(l1_key).address

    # L1 pre-checks first, so nothing moves on C-Chain when the L1 side cannot finish
    if (
        ltoken.functions.decimals().call() != DECIMALS
        or ctoken.functions.decimals().call() != DECIMALS
    ):
        raise TopUpError("token decimals differ from 6")
    if ltoken.functions.minter().call() != l1_signer:
        raise TopUpError(
            f"{l1_signer} is not the L1 tUSDC minter (it is {ltoken.functions.minter().call()}). After the "
            "handover the Council holds the role and cannot call a token: run the top-up before handover."
        )
    ops = vault.functions.topUpOperator().call()
    if l1_signer not in (ops, vault.functions.council().call()):
        raise TopUpError(f"{l1_signer} may not call recordTopUp (topUpOperator is {ops})")
    treasury_before = ctoken.functions.balanceOf(safe.address).call()
    if treasury_before < amount:
        raise TopUpError(f"treasury holds {treasury_before} base units, top-up needs {amount}")
    vault_before = ltoken.functions.balanceOf(vault.address).call()
    escrow_before = ctoken.functions.balanceOf(escrow).call()

    print(
        f"SIMULATED top-up of {amount_tusdc} tUSDC (no bridge): C-Chain multisig -> escrow, then L1 mint"
    )
    for k in owner_keys:
        if not safe.functions.isOwner(Account.from_key(k).address).call():
            raise TopUpError(f"{Account.from_key(k).address} is not an owner of the multisig")
    calldata = ctoken.encode_abi("transfer", args=[escrow, amount])
    first, *rest = owner_keys[: int(c_deployment["threshold"])]
    tx_id = safe.functions.txCount().call()
    _send(
        cw, first, safe.functions.submit(ctoken.address, 0, calldata), f"multisig submit #{tx_id}"
    )
    for n, k in enumerate(rest, start=2):
        _send(cw, k, safe.functions.confirm(tx_id), f"multisig confirm {n}/{len(rest) + 1}")
    rc = _send(cw, first, safe.functions.execute(tx_id), f"multisig execute #{tx_id}")
    c_tx_hash = "0x" + rc["transactionHash"].hex().removeprefix("0x")

    treasury_after = ctoken.functions.balanceOf(safe.address).call()
    if (
        treasury_before - treasury_after != amount
        or ctoken.functions.balanceOf(escrow).call() - escrow_before != amount
    ):
        raise TopUpError("C-Chain balances did not move by the top-up amount")

    _send(lw, l1_key, ltoken.functions.mint(vault.address, amount), "L1 mint tUSDC to vault")
    rc2 = _send(
        lw,
        l1_key,
        vault.functions.recordTopUp(bytes.fromhex(c_tx_hash[2:]), amount),
        "L1 recordTopUp",
    )
    events = vault.events.TopUpRecorded().process_receipt(rc2)
    if len(events) != 1 or events[0]["args"]["amount"] != amount:
        raise TopUpError("no TopUpRecorded event with the expected amount")
    vault_after = ltoken.functions.balanceOf(vault.address).call()
    if vault_after - vault_before != amount:
        raise TopUpError("vault balance did not grow by the top-up amount")

    summary = {
        "simulated": True,
        "amount": amount,
        "cChainTxHash": c_tx_hash,
        "treasuryBalance": treasury_after,
        "vaultBalance": vault_after,
        "l1RecordTxHash": "0x" + rc2["transactionHash"].hex().removeprefix("0x"),
    }
    print(json.dumps(summary))
    return summary


def _env_keys(n: int) -> list[str]:
    keys = [os.environ.get(f"CCHAIN_OWNER_KEY_{i}", "") for i in range(1, n + 1)]
    if not all(keys):
        raise TopUpError(f"set CCHAIN_OWNER_KEY_1..{n} (three distinct multisig owners)")
    return keys


def main() -> int:
    network = os.environ.get("NETWORK", "local")
    if network not in ("local", "fuji"):
        print("NETWORK must be local or fuji", file=sys.stderr)
        return 2
    if network == "fuji" and os.environ.get("I_UNDERSTAND") != "fuji":
        print("Refusing: NETWORK=fuji needs I_UNDERSTAND=fuji", file=sys.stderr)
        return 1
    try:
        amount = int(os.environ.get("AMOUNT", ""))
    except ValueError:
        print("set AMOUNT to a whole number of tUSDC, e.g. AMOUNT=200000", file=sys.stderr)
        return 2
    try:
        c_file = Path(
            os.environ.get("CCHAIN_DEPLOYMENTS", BACKEND / "deployments" / f"{network}-c.json")
        )
        c_dep = json.loads(c_file.read_text(encoding="utf-8"))
        l1_file = Path(
            os.environ.get("L1_DEPLOYMENTS", BACKEND / "deployments" / f"{network}-l1.json")
        )
        l1_dep = json.loads(l1_file.read_text(encoding="utf-8"))["contracts"]
        l1_rpc = os.environ.get("L1_RPC_URL")
        l1_key = os.environ.get("L1_TOPUP_KEY")
        if not l1_rpc or not l1_key:
            raise TopUpError("set L1_RPC_URL and L1_TOPUP_KEY")
        run_topup(
            amount_tusdc=amount,
            c_deployment=c_dep,
            c_rpc=os.environ.get("CCHAIN_RPC_URL") or c_dep["rpcUrl"],
            owner_keys=_env_keys(int(c_dep["threshold"])),
            l1_rpc=l1_rpc,
            l1_vault=l1_dep["vault"],
            l1_token=l1_dep["tUSDC"],
            l1_key=l1_key,
        )
    except (TopUpError, OSError, KeyError) as exc:
        print(f"top-up failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
