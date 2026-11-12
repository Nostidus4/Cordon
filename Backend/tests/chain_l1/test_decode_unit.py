"""Unit tests for the L1 log decoder and deployments loader: hand-encoded logs, no node needed."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from eth_abi import encode
from eth_utils import event_abi_to_log_topic, keccak, to_checksum_address
from web3 import Web3

from guardian.chain.client import ChainReadError
from guardian.chain.contracts import load_abi
from guardian.chain.l1.deployments import load_deployments, parse_deployments
from guardian.chain.l1.events import EventDecoder, bytes32_to_id
from guardian.chain.precompiles import ROLE_SET_TOPIC, TX_ALLOWLIST

W3 = Web3()  # offline: only used to build contract objects
VAULT = to_checksum_address("0x" + "11" * 20)
REGISTRY = to_checksum_address("0x" + "22" * 20)
COUNCIL = to_checksum_address("0x" + "33" * 20)
KEY = to_checksum_address("0xFBF0927D8fF0845912002Bf65B2fAC64f0Eb5eC1")
OTHER = to_checksum_address("0xd7C00ADAB1fa0Efce746A93722163514798cC928")
MINH = b"minh".ljust(32, b"\x00")
DECODER = EventDecoder.from_abis(
    W3, {"IPolicyVault": VAULT, "IPrincipalRegistry": REGISTRY, "IGuardianCouncil": COUNCIL}
)


def _abi_event(interface: str, name: str) -> dict[str, Any]:
    return next(i for i in load_abi(interface) if i["type"] == "event" and i["name"] == name)


def _topic_word(typ: str, value: Any) -> bytes:
    return encode([typ], [value])


def make_log(
    address: str, interface: str, name: str, values: dict[str, Any], log_index: int = 3
) -> dict[str, Any]:
    item = _abi_event(interface, name)
    topics = [event_abi_to_log_topic(item)]
    data_types, data_values = [], []
    for inp in item["inputs"]:
        if inp["indexed"]:
            topics.append(_topic_word(inp["type"], values[inp["name"]]))
        else:
            data_types.append(inp["type"])
            data_values.append(values[inp["name"]])
    return {
        "address": address,
        "topics": topics,
        "data": encode(data_types, data_values),
        "blockNumber": 42,
        "transactionHash": keccak(text=f"tx:{name}"),
        "logIndex": log_index,
        "transactionIndex": 0,
        "blockHash": keccak(text="block"),
    }


def addr32(a: str) -> bytes:
    return bytes(12) + bytes.fromhex(a[2:])


def test_bytes32_to_id() -> None:
    assert bytes32_to_id(MINH) == "minh"
    assert bytes32_to_id(b"agent_intl_pay".ljust(32, b"\x00")) == "agent_intl_pay"
    assert bytes32_to_id(bytes.fromhex("ff" * 32)) == "0x" + "ff" * 32  # not ASCII: kept as hex


def test_paid_payload_keys_match_the_sim() -> None:
    log = make_log(
        VAULT,
        "IPolicyVault",
        "Paid",
        {
            "key": KEY,
            "principalId": MINH,
            "token": OTHER,
            "to": OTHER,
            "amount": 5_000_000_000,
            "day": 20000,
            "keySpentAfter": 5_000_000_000,
            "principalSpentAfter": 5_000_000_000,
            "memoHash": keccak(text="memo"),
        },
    )
    ev = DECODER.decode(log, ts=1_700_000_000)
    assert ev is not None
    assert (ev.name, ev.block, ev.log_index, ev.simulated, ev.ts) == (
        "Paid",
        42,
        3,
        False,
        1_700_000_000,
    )
    assert ev.tx_hash == "0x" + keccak(text="tx:Paid").hex()
    assert set(ev.payload) == {
        "key",
        "principalId",
        "token",
        "to",
        "amount",
        "day",
        "keySpentAfter",
        "principalSpentAfter",
        "memoHash",
    }
    assert ev.payload["principalId"] == "minh"
    assert ev.payload["principalSpentAfter"] == 5_000_000_000
    assert ev.payload["memoHash"] == "0x" + keccak(text="memo").hex()
    assert isinstance(ev.payload["amount"], int)


def test_cap_changed_normalisation() -> None:
    key_ev = DECODER.decode(
        make_log(
            VAULT,
            "IPolicyVault",
            "CapChanged",
            {"kind": 0, "subject": addr32(KEY), "oldCap": 1, "newCap": 2},
        ),
        ts=0,
    )
    pri_ev = DECODER.decode(
        make_log(
            VAULT,
            "IPolicyVault",
            "CapChanged",
            {"kind": 1, "subject": MINH, "oldCap": 0, "newCap": 30_000_000_000},
        ),
        ts=0,
    )
    assert key_ev and key_ev.payload == {"kind": "key", "subject": KEY, "oldCap": 1, "newCap": 2}
    assert pri_ev and pri_ev.payload["kind"] == "principal"
    assert pri_ev.payload["subject"] == "minh"


@pytest.mark.parametrize(
    ("kind", "selector", "expected_kind", "expected_selector"),
    [
        (0, b"\x00" * 4, "token", None),
        (1, bytes.fromhex("10b84623"), "protocol", "0x10b84623"),
        (2, b"\x00" * 4, "recipient", None),
    ],
)
def test_allow_changed_normalisation(
    kind: int, selector: bytes, expected_kind: str, expected_selector: str | None
) -> None:
    ev = DECODER.decode(
        make_log(
            VAULT,
            "IPolicyVault",
            "AllowChanged",
            {"kind": kind, "subject": addr32(OTHER), "selector": selector, "allowed": True},
        ),
        ts=0,
    )
    assert ev and ev.payload == {
        "kind": expected_kind,
        "subject": OTHER,
        "selector": expected_selector,
        "allowed": True,
    }


def test_key_added_and_registry_events() -> None:
    ev = DECODER.decode(
        make_log(
            REGISTRY,
            "IPrincipalRegistry",
            "KeyAdded",
            {"id": MINH, "key": KEY, "kind": 1, "label": "Khoá"},
        ),
        ts=0,
    )
    assert ev and ev.payload == {"id": "minh", "key": KEY, "kind": "agent", "label": "Khoá"}
    moved = DECODER.decode(
        make_log(
            REGISTRY,
            "IPrincipalRegistry",
            "KeyMoved",
            {"key": KEY, "fromId": MINH, "toId": b"huy".ljust(32, b"\x00")},
        ),
        ts=0,
    )
    assert moved and moved.payload == {"key": KEY, "fromId": "minh", "toId": "huy"}


def test_council_events() -> None:
    proposed = DECODER.decode(
        make_log(
            COUNCIL,
            "IGuardianCouncil",
            "Proposed",
            {
                "id": 7,
                "proposer": KEY,
                "subjectPrincipal": MINH,
                "title": "t",
                "riskReportHash": keccak(text="r"),
            },
        ),
        ts=0,
    )
    assert proposed and proposed.payload["id"] == 7
    assert proposed.payload["subjectPrincipal"] == "minh"
    general = DECODER.decode(
        make_log(
            COUNCIL,
            "IGuardianCouncil",
            "Proposed",
            {
                "id": 8,
                "proposer": KEY,
                "subjectPrincipal": bytes(32),
                "title": "t",
                "riskReportHash": keccak(text="r"),
            },
        ),
        ts=0,
    )
    assert general and general.payload["subjectPrincipal"] is None
    emergency = DECODER.decode(
        make_log(
            COUNCIL,
            "IGuardianCouncil",
            "EmergencyAction",
            {"member": KEY, "action": "lockPrincipal", "subject": MINH},
        ),
        ts=0,
    )
    assert emergency and emergency.payload["subject"] == "minh"
    on_key = DECODER.decode(
        make_log(
            COUNCIL,
            "IGuardianCouncil",
            "EmergencyAction",
            {"member": KEY, "action": "deactivateKey", "subject": addr32(OTHER)},
        ),
        ts=0,
    )
    assert on_key and on_key.payload["subject"] == OTHER


def role_set_log(
    role: int, account: str, sender: str, address: str = TX_ALLOWLIST
) -> dict[str, Any]:
    return {
        "address": address,
        "topics": [
            bytes.fromhex(ROLE_SET_TOPIC[2:]),
            encode(["uint256"], [role]),
            encode(["address"], [account]),
            encode(["address"], [sender]),
        ],
        "data": encode(["uint256"], [1]),
        "blockNumber": 9,
        "transactionHash": keccak(text="tx:roleset"),
        "logIndex": 0,
    }


def test_role_set_becomes_allow_list_role_set() -> None:
    ev = DECODER.decode(role_set_log(0, KEY, OTHER), ts=5)
    assert ev is not None
    assert ev.name == "AllowListRoleSet"
    assert ev.payload == {"key": KEY, "role": 0, "by": OTHER}
    assert (ev.block, ev.log_index, ev.simulated) == (9, 0, False)


def test_role_set_from_another_address_is_ignored() -> None:
    assert DECODER.decode(role_set_log(0, KEY, OTHER, address=OTHER), ts=0) is None


def test_unknown_topic_and_wrong_emitter_are_ignored() -> None:
    log = make_log(VAULT, "IPolicyVault", "Unpaused", {})
    assert DECODER.decode(log, ts=0) is not None
    assert DECODER.decode({**log, "address": OTHER}, ts=0) is None  # same topic, not our vault
    assert DECODER.decode({**log, "topics": [keccak(text="Nope()")]}, ts=0) is None
    assert DECODER.decode({**log, "topics": []}, ts=0) is None


def test_deployments_parse_and_load(tmp_path: Path) -> None:
    data = {
        "chainId": 4242,
        "contracts": {
            "registry": REGISTRY.lower(),
            "vault": VAULT,
            "council": COUNCIL,
            "tUSDC": OTHER,
        },
    }
    dep = parse_deployments(data)
    assert (dep.registry, dep.vault, dep.council) == (REGISTRY, VAULT, COUNCIL)  # checksummed
    assert dep.tokens == {"tUSDC": OTHER} and dep.value_token == OTHER
    assert dep.tx_allowlist == TX_ALLOWLIST and dep.mock_dex is None
    p = tmp_path / "d.json"
    p.write_text(json.dumps(data))
    assert load_deployments(p).chain_id == 4242


def test_empty_deployments_file_gives_a_clear_error() -> None:
    with pytest.raises(ChainReadError, match="registry, vault"):
        parse_deployments({})  # the committed placeholder `{}`
    with pytest.raises(ChainReadError, match="not found"):
        load_deployments("/nonexistent/deployments.json")
