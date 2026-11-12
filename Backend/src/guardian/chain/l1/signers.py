"""Signers for the L1 adapter (CHN-002): who can send a transaction, and how it is signed.

Private keys exist only for test/demo keys, read from the environment (`.env*`, never committed):
`L1_KEY_<SEED_ID>` (upper case), e.g. `L1_KEY_KEY_MINH`, `L1_KEY_COUNCIL_LAN`. A key is accepted only if
it derives the address the seed gives that id. Nothing here logs, prints or puts a key in an error.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any, Protocol

from eth_account import Account
from eth_utils import to_checksum_address
from web3 import Web3

ENV_PREFIX = "L1_KEY_"


def signer_env(env_file: str = ".env") -> dict[str, str]:
    """`L1_KEY_*` variables from the process environment over a local `.env` (process wins)."""
    from dotenv import dotenv_values

    merged: dict[str, str | None] = {**dotenv_values(env_file), **os.environ}
    return {k: v for k, v in merged.items() if k.startswith(ENV_PREFIX) and v}


class SignerError(RuntimeError):
    """A signer is missing or misconfigured. Never carries key material."""


class Signer(Protocol):
    address: str

    def send(self, w3: Web3, tx: dict[str, Any]) -> bytes:
        """Sign (or hand over to the node) and broadcast `tx`; returns the tx hash."""
        ...


class LocalSigner:
    """Signs locally with a private key and broadcasts `eth_sendRawTransaction`."""

    def __init__(self, private_key: str):
        try:
            self._account = Account.from_key(private_key)
        except Exception as exc:  # never echo the value
            raise SignerError("invalid private key (not shown)") from exc
        self.address = to_checksum_address(self._account.address)

    def send(self, w3: Web3, tx: dict[str, Any]) -> bytes:
        signed = self._account.sign_transaction(tx)
        return bytes(w3.eth.send_raw_transaction(signed.raw_transaction))

    def __repr__(self) -> str:
        return f"LocalSigner({self.address})"


class NodeSigner:
    """The node holds the account (anvil impersonation or an unlocked dev account): dev/test only."""

    def __init__(self, address: str):
        self.address = to_checksum_address(address)

    def send(self, w3: Web3, tx: dict[str, Any]) -> bytes:
        return bytes(w3.eth.send_transaction(tx))  # type: ignore[arg-type]

    def __repr__(self) -> str:
        return f"NodeSigner({self.address})"


class SignerRegistry:
    """Address -> signer. L1Chain resolves seed ids / member ids to addresses, then looks up here."""

    def __init__(self, signers: list[Signer] | None = None):
        self._by_address: dict[str, Signer] = {}
        for s in signers or []:
            self.add(s)

    def add(self, signer: Signer) -> None:
        self._by_address[to_checksum_address(signer.address)] = signer

    def get(self, address: str) -> Signer:
        try:
            return self._by_address[to_checksum_address(address)]
        except KeyError:
            raise SignerError(f"no signer configured for {address}") from None

    def addresses(self) -> list[str]:
        return list(self._by_address)

    def __contains__(self, address: str) -> bool:
        return to_checksum_address(address) in self._by_address

    @classmethod
    def from_env(
        cls, seed: Mapping[str, Any], environ: Mapping[str, str] | None = None
    ) -> SignerRegistry:
        """One `LocalSigner` per seed key / council member whose `L1_KEY_<SEED_ID>` is set.

        Missing variables are fine (that signer simply cannot send). A key whose address differs from
        the seed's is a configuration error and raises `SignerError` (the message holds ids and
        addresses only).
        """
        env = os.environ if environ is None else environ
        reg = cls()
        for entry in (*seed.get("keys", []), *seed.get("council", [])):
            value = env.get(ENV_PREFIX + entry["seed_id"].upper())
            if not value:
                continue
            signer = LocalSigner(value)
            if signer.address != to_checksum_address(entry["address"]):
                raise SignerError(
                    f"{ENV_PREFIX}{entry['seed_id'].upper()} derives {signer.address}, "
                    f"seed expects {to_checksum_address(entry['address'])}"
                )
            reg.add(signer)
        return reg
