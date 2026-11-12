"""Web3 client factory for the L1 adapter (HTTP JSON-RPC; the poller replaces websockets)."""

from __future__ import annotations

from web3 import Web3


class ChainReadError(RuntimeError):
    """The node answered, but not with what the adapter needs (missing contract, wrong chain...)."""


def make_web3(rpc_url: str, timeout: float = 15.0) -> Web3:
    """Plain HTTP client. No middleware: Guardian L1 (Subnet-EVM) and anvil need none for reads."""
    return Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
