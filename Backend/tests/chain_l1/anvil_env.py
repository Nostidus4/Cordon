"""Deploy the Foundry artifacts to a local anvil and seed May Labs policy v1 (test helper).

Everything here is test-only: anvil's public dev accounts, the real `GuardianCouncil` and `MockAllowList`
etched at the Tx AllowList address. The seed state is written by impersonating the Council contract
(the only writer of registry and vault), so no proposal round trip is needed to set up policy v1.

`AllowListEnforcingProvider` emulates the node-level Tx AllowList check that anvil lacks: a send from
a role-0 address is answered with the JSON-RPC error recorded from Subnet-EVM v0.8.0.
"""

from __future__ import annotations

import copy
import json
import shutil
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import rlp
from eth_account import Account
from eth_utils import keccak, to_checksum_address
from web3 import HTTPProvider, Web3

from guardian.chain.l1.deployments import Deployments
from guardian.chain.precompiles import TX_ALLOWLIST
from guardian.chain.sim.engine import load_seed

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "contracts" / "out"
KIND = {"HUMAN": 0, "AGENT": 1, "SERVICE": 2}


def find_binary(name: str) -> str | None:
    return shutil.which(name) or (
        str(p) if (p := Path.home() / ".foundry" / "bin" / name).exists() else None
    )


def pid32(text: str) -> bytes:
    return text.encode().ljust(32, b"\x00")


def artifact(source: str, name: str, folder: str | None = None) -> dict[str, Any]:
    path = OUT / f"{folder or source}.sol" / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class Anvil:
    def __init__(self, binary: str):
        self.port = free_port()
        self.proc = subprocess.Popen(
            [binary, "--port", str(self.port), "--silent"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.url = f"http://127.0.0.1:{self.port}"
        self.w3 = Web3(Web3.HTTPProvider(self.url))
        for _ in range(100):
            if self.w3.is_connected():  # False (not an exception) while the node starts
                return
            time.sleep(0.1)
        self.stop()
        raise RuntimeError("anvil did not start")

    def stop(self) -> None:
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


class AllowListEnforcingProvider(HTTPProvider):
    """HTTP provider that refuses sends from addresses with Tx AllowList role 0 (as the node does).

    The reply is the JSON-RPC error recorded from Subnet-EVM v0.8.0 (`contracts/genesis/README.md`).
    Test-only: anvil does not know the precompile, so the mock at 0x02..02 is read through a second,
    plain provider (no recursion).
    """

    def __init__(self, url: str, allowlist_address: str = TX_ALLOWLIST):
        super().__init__(url)
        inner = Web3(HTTPProvider(url))
        self._read_role = inner.eth.contract(
            address=to_checksum_address(allowlist_address),
            abi=[
                {
                    "type": "function",
                    "name": "readAllowList",
                    "stateMutability": "view",
                    "inputs": [{"name": "addr", "type": "address"}],
                    "outputs": [{"name": "role", "type": "uint256"}],
                }
            ],
        ).functions.readAllowList

    @staticmethod
    def _sender(method: str, params: Any) -> str | None:
        if method == "eth_sendTransaction":
            return str(params[0]["from"])
        if method == "eth_sendRawTransaction":
            return str(Account.recover_transaction(params[0]))
        return None

    def make_request(self, method: Any, params: Any) -> Any:
        sender = self._sender(str(method), params)
        if sender is not None and self._read_role(to_checksum_address(sender)).call() == 0:
            return {
                "jsonrpc": "2.0",
                "id": 1,
                "error": {
                    "code": -32000,
                    "message": "cannot issue transaction from non-allow listed address: "
                    + to_checksum_address(sender),
                },
            }
        return super().make_request(method, params)


@dataclass
class Env:
    anvil: Anvil
    w3: Web3
    dep: Deployments
    seed: dict[str, Any]  # seed with token/dex addresses replaced by the deployed ones
    admin: str  # anvil account 0: deployer, and admin of the mock Tx AllowList
    council: Any  # the real GuardianCouncil
    vault: Any
    registry: Any
    tokens: dict[str, Any]
    dex: Any
    evil_dex: Any
    allowlist: Any
    head_before_activity: int

    def send(self, fn: Any, sender: str) -> Any:
        h = fn.transact({"from": sender, "gas": 3_000_000})
        rc = self.w3.eth.wait_for_transaction_receipt(h)
        assert rc["status"] == 1, "tx reverted"
        return rc

    def council_call(self, contract: Any, fn: str, *args: Any) -> None:
        """Call `contract.fn(*args)` as the Council contract itself (anvil impersonation)."""
        data = contract.encode_abi(fn, args=list(args))
        h = self.w3.eth.send_transaction(
            {"from": self.council.address, "to": contract.address, "data": data, "gas": 3_000_000}
        )
        assert self.w3.eth.wait_for_transaction_receipt(h)["status"] == 1, f"{fn} reverted"

    def as_key(self, key: str) -> str:
        """Impersonate a seed key (anvil dev feature) and fund it for gas."""
        self.w3.provider.make_request("anvil_impersonateAccount", [key])
        self.w3.provider.make_request("anvil_setBalance", [key, hex(10**18)])
        return key

    def fund_and_impersonate_all(self) -> None:
        """Every seed key and Council member can send (impersonated, funded for gas)."""
        for entry in (*self.seed["keys"], *self.seed["council"]):
            self.as_key(entry["address"])


def _deploy(w3: Web3, art: dict[str, Any], sender: str, *args: Any) -> Any:
    c = w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"]["object"])
    rc = w3.eth.wait_for_transaction_receipt(c.constructor(*args).transact({"from": sender}))
    return w3.eth.contract(address=rc["contractAddress"], abi=art["abi"])


def deploy_may_labs(anvil: Anvil) -> Env:
    """Deploy registry, vault, Council, tokens, DEXes; etch the AllowList; seed policy v1."""
    w3 = anvil.w3
    seed = copy.deepcopy(load_seed())
    admin = to_checksum_address(w3.eth.accounts[0])

    # Tx AllowList mock at the precompile address; admin may set roles (RoleSet is emitted).
    al_art = artifact("MockAllowList", "MockAllowList", "MockAllowList")
    code = al_art["deployedBytecode"]["object"]
    w3.provider.make_request("anvil_setCode", [TX_ALLOWLIST, code])
    allowlist = w3.eth.contract(address=TX_ALLOWLIST, abi=al_art["abi"])
    allowlist.functions.__seedRole(admin, 2).transact({"from": admin})
    for k in seed["keys"]:
        if k["allow_listed"]:
            allowlist.functions.__seedRole(k["address"], 1).transact({"from": admin})

    members = [to_checksum_address(m["address"]) for m in seed["council"]]
    principals = [
        pid32(m["principal_id"]) if m["principal_id"] else b"\x00" * 32 for m in seed["council"]
    ]
    for m in members:
        allowlist.functions.__seedRole(m, 1).transact({"from": admin})

    # Registry and vault take the Council address and the Council takes theirs: predict it from the
    # deployer nonce (registry, 3 tokens, 2 DEXes, vault, then the Council = 7 deployments later).
    council_addr = to_checksum_address(
        keccak(rlp.encode([bytes.fromhex(admin[2:]), w3.eth.get_transaction_count(admin) + 7]))[12:]
    )
    registry = _deploy(w3, artifact("PrincipalRegistry", "PrincipalRegistry"), admin, council_addr)
    tokens = {
        sym: _deploy(w3, artifact(f, f), admin)
        for sym, f in (("tUSDC", "TestUSDC"), ("tTKB", "TestTokenB"), ("tSCAM", "TestScam"))
    }
    approved = [tokens["tUSDC"].address, tokens["tTKB"].address]
    dex = _deploy(w3, artifact("MockDEX", "MockDEX"), admin, council_addr, approved)
    evil = _deploy(w3, artifact("EvilDEX", "EvilDEX"), admin, council_addr, approved)
    vault = _deploy(
        w3,
        artifact("PolicyVault", "PolicyVault"),
        admin,
        registry.address,
        council_addr,
        tokens["tUSDC"].address,
        dex.address,
        "0x" + "00" * 20,
    )
    council = _deploy(
        w3,
        artifact("GuardianCouncil", "GuardianCouncil"),
        admin,
        members,
        principals,
        registry.address,
        vault.address,
    )
    assert council.address == council_addr, "council address prediction is off"
    # The Council administers the Tx AllowList (emergencyLock -> setNone), as after the L1 hand-over.
    allowlist.functions.__seedRole(council.address, 2).transact({"from": admin})
    w3.provider.make_request("anvil_impersonateAccount", [council.address])
    w3.provider.make_request("anvil_setBalance", [council.address, hex(10**18)])

    # Seed addresses that exist only on the deployed chain.
    for t in seed["tokens"]:
        t["address"] = tokens[t["seed_id"]].address
    for p in seed["protocols"]:
        p["address"] = (dex if p["seed_id"] == "mock_dex" else evil).address

    def council_call(contract: Any, fn: str, *args: Any) -> None:
        data = contract.encode_abi(fn, args=list(args))
        h = w3.eth.send_transaction(
            {"from": council.address, "to": contract.address, "data": data, "gas": 3_000_000}
        )
        assert w3.eth.wait_for_transaction_receipt(h)["status"] == 1, f"seed call {fn} reverted"

    for p in seed["principals"]:
        council_call(registry, "createPrincipal", pid32(p["id"]), p["label"])
    for k in seed["keys"]:
        council_call(
            registry, "addKey", pid32(k["principal_id"]), k["address"], KIND[k["kind"]], k["label"]
        )
        council_call(vault, "setKeyDailyCap", k["address"], k["daily_cap"])
    for t in seed["tokens"]:
        if t["allowed"]:
            council_call(vault, "setTokenAllowed", t["address"], True)
    for r in seed["recipients"]:
        if r["allowed"]:
            council_call(vault, "setRecipientAllowed", r["address"], True)
    for p in seed["protocols"]:
        if p["allowed"]:
            council_call(vault, "setProtocolAllowed", p["address"], p["selector"], True)

    # Vault funding (tUSDC) and DEX liquidity (tTKB), minted by the deployer-minter.
    tokens["tUSDC"].functions.mint(vault.address, seed["vault_balances"]["tUSDC"]).transact(
        {"from": admin}
    )
    tokens["tTKB"].functions.mint(dex.address, 10**24).transact({"from": admin})

    dep = Deployments(
        registry=registry.address,
        vault=vault.address,
        council=council.address,
        mock_dex=dex.address,
        evil_dex=evil.address,
        tokens={s: c.address for s, c in tokens.items()},
        chain_id=w3.eth.chain_id,
    )
    return Env(
        anvil, w3, dep, seed, admin, council, vault, registry, tokens, dex, evil, allowlist,
        int(w3.eth.block_number),
    )  # fmt: skip
