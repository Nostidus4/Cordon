"""RPC reject -> BLOCKED_AT_PROTOCOL; custom errors -> reason codes."""

import pytest

from guardian.chain.errors import classify_error, is_blocked_at_protocol
from guardian.shared.reason_codes import ReasonCode

# Captured from a local Subnet-EVM v0.8.0 node (Avalanche CLI 1.9.7), see contracts/genesis/README.md.
# `eth_sendRawTransaction` from a Tx AllowList role-0 key returns this JSON-RPC error and no tx hash.
RPC_REJECTED_SENDER = "cannot issue transaction from non-allow listed address: 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199"
# The same message as surfaced by `cast send` (Foundry).
CAST_REJECTED_SENDER = (
    f"Error: server returned an error response: error code -32000: {RPC_REJECTED_SENDER}"
)
# Contract Deployer AllowList rejection (gas estimation); not a sender rejection.
RPC_REJECTED_DEPLOYER = (
    "Failed to estimate gas: server returned an error response: error code -32000: "
    "tx.origin 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 is not authorized to deploy a contract"
)


@pytest.mark.parametrize("message", [RPC_REJECTED_SENDER, CAST_REJECTED_SENDER])
def test_rejected_sender_is_blocked_at_protocol(message: str) -> None:
    assert is_blocked_at_protocol(message)
    assert classify_error(message) == ReasonCode.BLOCKED_AT_PROTOCOL


def test_rejected_sender_accepts_exception_objects() -> None:
    assert classify_error(Exception(RPC_REJECTED_SENDER)) == ReasonCode.BLOCKED_AT_PROTOCOL


def test_deployer_allowlist_rejection_is_not_a_sender_block() -> None:
    assert not is_blocked_at_protocol(RPC_REJECTED_DEPLOYER)
    assert classify_error(RPC_REJECTED_DEPLOYER) is None
