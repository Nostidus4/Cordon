"""TxAllowList 0x02..02 / ContractDeployerAllowList 0x02..00, readAllowList (spec §6.1).

The precompile ABI is not part of the frozen contract ABIs, so the few bits the adapter uses are
declared here. Roles: 0 none, 1 enabled, 2 admin (3 manager on newer Subnet-EVM).
"""

from __future__ import annotations

from typing import Any

from eth_abi import decode
from eth_utils import event_abi_to_log_topic, to_checksum_address
from hexbytes import HexBytes
from web3 import Web3
from web3.contract import Contract

CONTRACT_DEPLOYER_ALLOWLIST = "0x0200000000000000000000000000000000000000"
TX_ALLOWLIST = "0x0200000000000000000000000000000000000002"

ROLE_NONE = 0
ROLE_ENABLED = 1
ROLE_ADMIN = 2

ROLE_SET_EVENT: dict[str, Any] = {
    "type": "event",
    "name": "RoleSet",
    "anonymous": False,
    "inputs": [
        {"name": "role", "type": "uint256", "indexed": True},
        {"name": "account", "type": "address", "indexed": True},
        {"name": "sender", "type": "address", "indexed": True},
        {"name": "oldRole", "type": "uint256", "indexed": False},
    ],
}

ALLOWLIST_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "readAllowList",
        "stateMutability": "view",
        "inputs": [{"name": "addr", "type": "address"}],
        "outputs": [{"name": "role", "type": "uint256"}],
    },
    ROLE_SET_EVENT,
]

ROLE_SET_TOPIC: str = "0x" + event_abi_to_log_topic(ROLE_SET_EVENT).hex()


def tx_allowlist(w3: Web3, address: str = TX_ALLOWLIST) -> Contract:
    return w3.eth.contract(address=to_checksum_address(address), abi=ALLOWLIST_ABI)


def read_role(contract: Contract, account: str, block: int | str = "latest") -> int:
    """`readAllowList(account)` on the Tx AllowList: 0 none, 1 enabled, 2 admin."""
    return int(
        contract.functions.readAllowList(to_checksum_address(account)).call(block_identifier=block)
    )


def is_role_set_log(log: Any, address: str = TX_ALLOWLIST) -> bool:
    """True for a `RoleSet` log emitted by the Tx AllowList (and nothing else)."""
    topics = log["topics"]
    return (
        to_checksum_address(log["address"]) == to_checksum_address(address)
        and len(topics) == 4
        and HexBytes(topics[0]) == HexBytes(ROLE_SET_TOPIC)
    )


def decode_role_set(log: Any) -> dict[str, Any]:
    """`RoleSet(role, account, sender, oldRole)` -> `AllowListRoleSet` payload `{key, role, by}`.

    `oldRole` (in the data) is dropped: the payload is exactly what API_CONTRACT §2 lists.
    """
    topics = [HexBytes(t) for t in log["topics"]]
    decode(["uint256"], bytes(HexBytes(log["data"])))  # validates the data section
    return {
        "key": to_checksum_address(topics[2][-20:]),
        "role": int.from_bytes(topics[1], "big"),
        "by": to_checksum_address(topics[3][-20:]),
    }
