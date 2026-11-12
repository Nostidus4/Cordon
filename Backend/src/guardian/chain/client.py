"""Web3 client factory for the L1 adapter (HTTP JSON-RPC; the poller replaces websockets)."""

from __future__ import annotations

import logging

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware


class ChainReadError(RuntimeError):
    """The node answered, but not with what the adapter needs (missing contract, wrong chain...)."""


class ChainWriteError(RuntimeError):
    """A transaction could not be sent or confirmed for a reason that is not a contract result
    (RPC down, nonce/funds errors, receipt timeout). The message never contains the RPC URL."""


def quiet_transport_logs() -> None:
    """Keep the RPC URL out of logs: web3 and urllib3 print it at DEBUG for every request.

    Raises those loggers to INFO unless the application already set a level above DEBUG itself.
    """
    for name in (
        "web3.providers",
        "web3.manager",
        "web3._utils.http_session_manager",
        "urllib3.connectionpool",
    ):
        lg = logging.getLogger(name)
        if lg.level < logging.INFO:  # NOTSET (0) or DEBUG
            lg.setLevel(logging.INFO)


def make_web3(rpc_url: str, timeout: float = 15.0) -> Web3:
    """HTTP client. Subnet-EVM blocks carry an 86-byte `extraData` (the dynamic-fee window), which web3's
    default validation rejects ("quite likely that you are connected to a POA chain"); anvil's 32 bytes pass
    through the same middleware untouched. Found on the first run against a real Subnet-EVM node (L1-002)."""
    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    return w3
