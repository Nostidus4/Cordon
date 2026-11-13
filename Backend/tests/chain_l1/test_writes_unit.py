"""CHN-002 without a node: recorded RPC strings, revert decoding, call encoding, signers."""

from __future__ import annotations

from typing import Any

import pytest
from eth_account import Account
from eth_utils import keccak, to_checksum_address
from web3 import Web3
from web3.providers.base import JSONBaseProvider

from guardian.chain.client import ChainWriteError
from guardian.chain.errors import (
    CONTRACT_ONLY_ERRORS,
    ERROR_TO_REASON,
    OTHER_ERRORS,
    ChainRevert,
    decode_revert,
    rpc_error_tag,
)
from guardian.chain.l1 import Deployments, L1Chain
from guardian.chain.l1.calls import hash_to_bytes32, id_to_bytes32
from guardian.chain.l1.signers import LocalSigner, SignerError, SignerRegistry
from guardian.chain.sim.engine import load_seed
from guardian.shared.reason_codes import ReasonCode as R

# Recorded from Subnet-EVM v0.8.0 (contracts/genesis/README.md, "Exact rejection strings").
SENDER = "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199"
REJECTED_SENDER = f"cannot issue transaction from non-allow listed address: {SENDER}"
REJECTED_SENDER_CAST = (
    f"Error: server returned an error response: error code -32000: {REJECTED_SENDER}"
)
REJECTED_DEPLOY = (
    "tx.origin 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 is not authorized to deploy a contract"
)
REJECTED_MODIFY = (
    "cannot modify allow list: modify address: 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955, "
    "from role: NoRole, to role: EnabledRole"
)


# ------------------------------------------------------- error mapping
@pytest.mark.parametrize(
    ("message", "tag"),
    [
        (REJECTED_SENDER, "AllowListSenderRejected"),
        (REJECTED_SENDER_CAST, "AllowListSenderRejected"),
        (REJECTED_DEPLOY, "DeployerNotAuthorized"),
        (REJECTED_MODIFY, "AllowListModifyDenied"),
        ("nonce too low", None),
    ],
)
def test_rpc_error_tags(message: str, tag: str | None) -> None:
    assert rpc_error_tag(message) == tag


@pytest.mark.parametrize("name", sorted({*ERROR_TO_REASON, *OTHER_ERRORS, *CONTRACT_ONLY_ERRORS}))
def test_every_known_custom_error_decodes_by_selector(name: str) -> None:
    info = decode_revert("0x" + keccak(text=f"{name}()")[:4].hex())
    assert info.name == name and info.raw == name and info.reason == ERROR_TO_REASON.get(name)


def test_revert_data_variants() -> None:
    assert decode_revert("0x" + keccak(text="RecipientNotAllowed()")[:4].hex()).reason == (
        R.RECIPIENT_NOT_ALLOWED
    )
    assert decode_revert(keccak(text="VaultPaused()")[:4]).reason == R.VAULT_PAUSED  # bytes
    err_string = "0x08c379a0" + (
        "0000000000000000000000000000000000000000000000000000000000000020"
        "0000000000000000000000000000000000000000000000000000000000000003"
        "6e6f700000000000000000000000000000000000000000000000000000000000"
    )
    assert decode_revert(err_string).name == "Error" and decode_revert(err_string).raw == "nop"
    assert decode_revert("0x4e487b71" + "11".rjust(64, "0")).raw == "Panic(0x11)"
    assert (
        decode_revert("0xdeadbeef").name is None and decode_revert("0xdeadbeef").raw == "0xdeadbeef"
    )
    for empty in (None, "", "0x"):
        info = decode_revert(empty)
        assert info.name is None and info.reason is None and info.raw == "execution reverted"


# ------------------------------------------------------ fake node (no anvil)
class FakeNode(JSONBaseProvider):
    """Canned JSON-RPC: `reject_in` makes that method answer with the recorded node error."""

    def __init__(self, reject_in: str | None = None, message: str = REJECTED_SENDER):
        super().__init__()
        self.reject_in, self.message = reject_in, message
        self.sent: list[str] = []

    def make_request(self, method: Any, params: Any) -> Any:
        self.sent.append(str(method))
        if method == self.reject_in:
            return {"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": self.message}}
        results = {
            "eth_call": "0x",
            "eth_estimateGas": "0x5208",
            "eth_gasPrice": "0x3b9aca00",
            "eth_getTransactionCount": "0x7",
            "eth_chainId": "0x679a2",
        }
        if method in results:
            return {"jsonrpc": "2.0", "id": 1, "result": results[method]}
        raise AssertionError(f"unexpected RPC {method}")


def _chain(node: FakeNode, signers: SignerRegistry | None = None) -> L1Chain:
    seed = load_seed()
    dep = Deployments(
        registry=to_checksum_address("0x" + "11" * 20),
        vault=to_checksum_address("0x" + "22" * 20),
        council=to_checksum_address("0x" + "33" * 20),
        mock_dex=to_checksum_address("0x" + "44" * 20),
        evil_dex=to_checksum_address("0x" + "55" * 20),
        tokens={"tUSDC": to_checksum_address("0x" + "66" * 20)},
    )
    return L1Chain(Web3(node), dep, seed, signers=signers)


def test_recorded_sender_rejection_on_send_is_blocked_at_protocol() -> None:
    acct = Account.create()
    node = FakeNode(reject_in="eth_sendRawTransaction")
    chain = _chain(node, SignerRegistry([LocalSigner(acct.key.hex())]))
    r = chain.pay(
        acct.address, chain._addr("tUSDC"), chain._addr("vendor_cloud"), 1
    )  # dry run passes, node rejects the send
    assert r.status == "blocked_at_protocol" and r.reason_code == R.BLOCKED_AT_PROTOCOL
    assert r.tx_hash is None and r.block is None and r.events == []
    assert r.error_raw == REJECTED_SENDER and r.simulated is False
    assert node.sent.count("eth_sendRawTransaction") == 1


def test_recorded_sender_rejection_in_eth_call_skips_the_send() -> None:
    acct = Account.create()
    node = FakeNode(reject_in="eth_call", message=REJECTED_SENDER_CAST)
    chain = _chain(node, SignerRegistry([LocalSigner(acct.key.hex())]))
    r = chain.raw_call(acct.address, chain._addr("tUSDC"), "0x095ea7b3")
    assert r.status == "blocked_at_protocol" and r.tx_hash is None
    assert "non-allow listed address" in (r.error_raw or "")
    assert "eth_sendRawTransaction" not in node.sent
    assert (
        chain.simulate_pay(acct.address, chain._addr("tUSDC"), chain._addr("vendor_cloud"), 1)
        == R.BLOCKED_AT_PROTOCOL
    )


def test_other_send_errors_are_write_errors_not_results() -> None:
    acct = Account.create()
    node = FakeNode(
        reject_in="eth_sendRawTransaction", message="nonce too low: next nonce 8, tx nonce 7"
    )
    chain = _chain(node, SignerRegistry([LocalSigner(acct.key.hex())]))
    with pytest.raises(ChainWriteError, match="nonce too low"):
        chain.pay(acct.address, chain._addr("tUSDC"), chain._addr("vendor_cloud"), 1)


def test_allow_list_precompile_message_is_kept_as_error_raw_in_dry_run() -> None:
    acct = Account.create()
    node = FakeNode(reject_in="eth_call", message=REJECTED_MODIFY)
    chain = _chain(node, SignerRegistry([LocalSigner(acct.key.hex())]))
    assert (
        chain.simulate_pay(acct.address, chain._addr("tUSDC"), chain._addr("vendor_cloud"), 1)
        is None
    )  # no reason code
    d = chain._dry_run({"from": acct.address, "to": chain.dep.vault, "data": "0x"})
    assert d.info and d.info.name == "AllowListModifyDenied" and d.info.raw == REJECTED_MODIFY


# ------------------------------------------------------- call encoding
def test_symbolic_calls_encode_like_the_contract_abi() -> None:
    chain = _chain(FakeNode())
    calls = [
        {"target": "registry", "fn": "moveKey", "args": {"key": "key_agent_data", "to": "minh"}},
        {"target": "registry", "fn": "moveKey", "args": {"key": "key_agent_data", "toId": "minh"}},
        {
            "target": "vault",
            "fn": "setPrincipalDailyCap",
            "args": {"principal_id": "minh", "cap": "30000"},
        },
        {
            "target": "vault",
            "fn": "setPrincipalDailyCap",
            "args": {"principalId": "minh", "cap": 5},
        },
        {
            "target": "vault",
            "fn": "setRecipientAllowed",
            "args": {"recipient": "vendor_cloud", "allowed": False},
        },
        {
            "target": "vault",
            "fn": "setProtocolAllowed",
            "args": {"subject": "mock_dex", "allowed": True},
        },
        {"target": "tx_allowlist", "fn": "setNone", "args": {"address": "key_minh"}},
        {"target": "vault", "fn": "bumpPolicyVersion", "args": {}},  # implicit on chain: dropped
    ]
    out = chain._encoder.encode(calls)
    assert len(out) == 7
    targets = [t for t, _ in out]
    assert targets == [chain.dep.registry] * 2 + [chain.dep.vault] * 4 + [
        "0x0200000000000000000000000000000000000002"
    ]
    key = chain._addr("key_agent_data")
    assert "0x" + out[0][1].hex() == chain.registry.encode_abi(
        "moveKey", args=[key, id_to_bytes32("minh")]
    )
    assert out[0][1] == out[1][1]
    assert "0x" + out[2][1].hex() == chain.vault.encode_abi(
        "setPrincipalDailyCap", args=[id_to_bytes32("minh"), 30000]
    )
    # the protocol selector falls back to the seed's for that DEX
    assert "0x" + out[5][1].hex() == chain.vault.encode_abi(
        "setProtocolAllowed", args=[chain._addr("mock_dex"), bytes.fromhex("10b84623"), True]
    )


@pytest.mark.parametrize(
    ("call", "name"),
    [
        ({"target": "token", "fn": "mint", "args": {}}, "TargetNotAllowed"),
        ({"target": "vault", "fn": "selfdestruct", "args": {}}, "UnknownCall"),
        ({"target": "registry", "fn": "moveKey", "args": {"key": "key_minh"}}, "BadCallArgs"),
        (
            {"target": "registry", "fn": "moveKey", "args": {"key": "nobody", "to": "minh"}},
            "BadCallArgs",
        ),
        (
            {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": "key_minh", "cap": "x"}},
            "BadCallArgs",
        ),
        (
            {
                "target": "registry",
                "fn": "addKey",
                "args": {"id": "minh", "key": "key_minh", "kind": "ROBOT"},
            },
            "BadCallArgs",
        ),
    ],
)
def test_bad_symbolic_calls_raise_like_the_sim(call: dict[str, Any], name: str) -> None:
    with pytest.raises(ChainRevert) as e:
        _chain(FakeNode())._encoder.encode([call])
    assert e.value.name == name


def test_id_and_hash_encoding() -> None:
    assert id_to_bytes32("minh") == b"minh" + bytes(28)
    assert id_to_bytes32("0x" + "ab" * 32) == bytes.fromhex("ab" * 32)
    with pytest.raises(ChainRevert):
        id_to_bytes32("x" * 33)
    assert hash_to_bytes32("0x01") == bytes(31) + b"\x01"
    assert hash_to_bytes32(None) == bytes(32) and hash_to_bytes32("0x") == bytes(32)
    assert hash_to_bytes32("0x" + "cd" * 32) == bytes.fromhex("cd" * 32)


# ---------------------------------------------------------------- signers
def test_signers_from_env_match_the_seed_and_never_echo_keys() -> None:
    seed = load_seed()
    minh = Account.create()
    seed["keys"][0]["address"] = minh.address
    reg = SignerRegistry.from_env(seed, {"L1_KEY_KEY_MINH": minh.key.hex(), "OTHER": "x"})
    assert reg.addresses() == [minh.address] and minh.address in reg
    assert reg.get(minh.address.lower()).address == minh.address
    with pytest.raises(SignerError, match="no signer configured"):
        reg.get(seed["keys"][1]["address"])

    other = Account.create()
    with pytest.raises(SignerError) as e:
        SignerRegistry.from_env(seed, {"L1_KEY_KEY_MINH": other.key.hex()})
    assert other.key.hex().removeprefix("0x") not in str(e.value)
    assert minh.address in str(e.value) and other.address in str(e.value)
    with pytest.raises(SignerError) as e2:
        LocalSigner("not-a-key-1234")
    assert "1234" not in str(e2.value) and "not-a-key" not in str(e2.value)
    assert other.key.hex().removeprefix("0x") not in repr(LocalSigner(other.key.hex()))
    assert SignerRegistry.from_env(seed, {}).addresses() == []


def test_council_members_are_read_from_env_by_seed_id() -> None:
    seed = load_seed()
    lan = Account.create()
    member = next(m for m in seed["council"] if m["id"] == "lan")
    member["address"] = lan.address
    reg = SignerRegistry.from_env(seed, {f"L1_KEY_{member['seed_id'].upper()}": lan.key.hex()})
    assert reg.addresses() == [lan.address]
