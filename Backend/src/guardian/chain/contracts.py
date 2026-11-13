"""Contract handles built from the committed ABIs (`chain/abis/`) and a `Deployments` record."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from web3 import Web3
from web3.contract import Contract

ABI_DIR = Path(__file__).resolve().parent / "abis"

ERC20_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": name,
        "stateMutability": "view",
        "inputs": inputs,
        "outputs": [{"name": "", "type": out}],
    }
    for name, inputs, out in (
        ("symbol", [], "string"),
        ("decimals", [], "uint8"),
        ("balanceOf", [{"name": "account", "type": "address"}], "uint256"),
    )
]


def load_abi(name: str) -> list[dict[str, Any]]:
    """`name` is an interface name, e.g. `IPolicyVault`."""
    return json.loads((ABI_DIR / f"{name}.json").read_text(encoding="utf-8"))


@dataclass
class Contracts:
    registry: Contract
    vault: Contract
    council: Contract | None


def bind(w3: Web3, registry: str, vault: str, council: str | None) -> Contracts:
    return Contracts(
        registry=w3.eth.contract(address=registry, abi=load_abi("IPrincipalRegistry")),
        vault=w3.eth.contract(address=vault, abi=load_abi("IPolicyVault")),
        council=(
            w3.eth.contract(address=council, abi=load_abi("IGuardianCouncil")) if council else None
        ),
    )


def erc20(w3: Web3, address: str) -> Contract:
    return w3.eth.contract(address=address, abi=ERC20_ABI)
