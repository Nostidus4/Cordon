"""Decode L1 logs into `ChainEvent` (names and payloads as API_CONTRACT §2, normalisation CONTRACTS §6).

Payload keys equal the ABI parameter names, so the output has exactly the shape the sim emits.
Normalisation: uint -> int; address -> checksum str; principal ids (bytes32) -> ASCII str;
other bytes32 (memo/reason/risk hashes, cChainTxHash) -> 0x hex; CapChanged/AllowChanged `kind` and
`subject` -> readable; `KeyAdded.kind` -> lowercase enum name.
"""

from __future__ import annotations

from typing import Any

from eth_utils import event_abi_to_log_topic, to_checksum_address
from hexbytes import HexBytes
from web3 import Web3
from web3.contract import Contract

from guardian.chain.base import ChainEvent
from guardian.chain.contracts import load_abi
from guardian.chain.precompiles import (
    TX_ALLOWLIST,
    decode_role_set,
    is_role_set_log,
)

CAP_KINDS = ("key", "principal")
ALLOW_KINDS = ("token", "protocol", "recipient")
KEY_KINDS = ("human", "agent", "service")
_ID_FIELDS = frozenset({"principalId", "id", "fromId", "toId"})
_ZERO4 = "0x00000000"


def bytes32_to_id(raw: bytes) -> str:
    """`0x6d696e68 00..00` -> "minh". Non-ASCII content is kept as 0x hex (never lossy)."""
    body = raw.rstrip(b"\x00")
    if body and all(0x20 <= b < 0x7F for b in body):
        return body.decode("ascii")
    return "0x" + raw.hex()


def _hex(raw: bytes) -> str:
    return "0x" + raw.hex()


def _subject(raw: bytes) -> str:
    """bytes32 subject: left-padded address (12 zero bytes) -> checksum address, else a principal id."""
    if any(raw) and not any(raw[:12]):
        return to_checksum_address(raw[12:])
    return bytes32_to_id(raw) if any(raw) else ""


def normalise(name: str, abi_inputs: list[dict[str, Any]], args: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for item in abi_inputs:
        key, typ, value = item["name"], item["type"], args[item["name"]]
        if typ == "bytes32":
            if key in _ID_FIELDS:
                out[key] = bytes32_to_id(value)
            elif key == "subjectPrincipal":
                out[key] = bytes32_to_id(value) if any(value) else None
            elif key == "subject":
                out[key] = value  # resolved below once `kind` is known
            else:
                out[key] = _hex(value)
        elif typ == "bytes4":
            out[key] = _hex(value)
        else:
            out[key] = value
    if name == "CapChanged":
        kind = CAP_KINDS[args["kind"]]
        out["kind"] = kind
        out["subject"] = bytes32_to_id(args["subject"]) if kind == "principal" else _addr32(args)
    elif name == "AllowChanged":
        kind = ALLOW_KINDS[args["kind"]]
        out["kind"] = kind
        out["subject"] = _addr32(args)
        out["selector"] = out["selector"] if kind == "protocol" else None
    elif name == "KeyAdded":
        out["kind"] = KEY_KINDS[args["kind"]]
    elif name == "EmergencyAction":
        out["subject"] = _subject(args["subject"])
    return out


def _addr32(args: dict[str, Any]) -> str:
    return to_checksum_address(args["subject"][12:])


class EventDecoder:
    """topic0 -> contract event decoder for the registry, vault and Council ABIs."""

    def __init__(self, w3: Web3, contracts: list[Contract]):
        self._by_topic: dict[bytes, tuple[Contract, str, list[dict[str, Any]]]] = {}
        for c in contracts:
            for item in c.abi:
                if item["type"] == "event":
                    topic = event_abi_to_log_topic(item)
                    self._by_topic[topic] = (c, item["name"], item["inputs"])

    @classmethod
    def from_abis(cls, w3: Web3, addresses: dict[str, str | None]) -> EventDecoder:
        """`addresses`: interface name (`IPolicyVault`...) -> deployed address (None = skip)."""
        return cls(
            w3,
            [w3.eth.contract(address=a, abi=load_abi(n)) for n, a in addresses.items() if a],
        )

    def decode(self, log: Any, ts: int, tx_allowlist: str = TX_ALLOWLIST) -> ChainEvent | None:
        """A `ChainEvent`, or None for a log that is not part of the frozen event set."""
        topics = log["topics"]
        if not topics:
            return None
        block, log_index = int(log["blockNumber"]), int(log["logIndex"])
        tx_hash = "0x" + HexBytes(log["transactionHash"]).hex().removeprefix("0x")
        if is_role_set_log(log, tx_allowlist):
            return ChainEvent(
                "AllowListRoleSet", block, tx_hash, log_index, decode_role_set(log), ts, False
            )
        entry = self._by_topic.get(bytes(HexBytes(topics[0])))
        if entry is None:
            return None
        contract, name, inputs = entry
        if to_checksum_address(log["address"]) != contract.address:
            return None
        decoded = getattr(contract.events, name)().process_log(log)
        return ChainEvent(
            name,
            block,
            tx_hash,
            log_index,
            normalise(name, inputs, dict(decoded["args"])),
            ts,
            False,
        )
