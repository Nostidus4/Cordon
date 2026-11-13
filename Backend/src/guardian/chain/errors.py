"""Decode custom-error revert -> reason code; RPC 'not allow listed' -> BLOCKED_AT_PROTOCOL (spec §6.1, §6.4).

Usable by the sim chain and by a future web3 implementation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from eth_abi import decode
from eth_abi.exceptions import DecodingError
from eth_utils import keccak, to_checksum_address

from guardian.shared.reason_codes import REASON_TABLE, ReasonCode

_HEX_ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")


def require_hex(ref: str) -> str:
    """ChainPort boundary: only hex addresses cross it (ids are resolved by the app, CHN-004)."""
    if not isinstance(ref, str) or not _HEX_ADDR.match(ref):
        raise ValueError(f"expected hex address, got {ref!r}")
    return to_checksum_address(ref)


ERROR_TO_REASON: dict[str, ReasonCode] = {
    info.error: code for code, info in REASON_TABLE.items() if info.error is not None
}
REASON_TO_ERROR: dict[ReasonCode, str | None] = {c: i.error for c, i in REASON_TABLE.items()}

# Council / registry reverts that have no reason code (error name only, kept in error_raw).
OTHER_ERRORS: frozenset[str] = frozenset(
    {
        "NotCouncilMember",
        "NotTightening",
        "NeedsThreshold",
        "ConflictOfInterest",
        "AlreadyApproved",
        "ProposalNotOpen",
        "NotProposer",
        "TargetNotAllowed",
        "UnknownCall",
        "BadCallArgs",
        "UnknownProposal",
        "KeyAlreadyRegistered",
        "PrincipalNotFound",
        "PrincipalExists",
        "NotCouncil",
        "NotTopUpOperator",
        "UnknownPair",
        "InsufficientBalance",
        "InsufficientTreasury",
    }
)

# Contract-level errors that are not in the frozen interfaces (so not in the committed ABIs): the
# Council's SubjectMismatch/InvalidSetup, the vault's ZeroAddress, the registry's ZeroCouncil.
CONTRACT_ONLY_ERRORS: frozenset[str] = frozenset(
    {"SubjectMismatch", "InvalidSetup", "ZeroAddress", "ZeroCouncil"}
)

_SELECTOR_TO_ERROR: dict[str, str] = {
    "0x" + keccak(text=f"{name}()")[:4].hex(): name for name in ERROR_TO_REASON
}

# Every custom error the adapter can meet, all argument-less: selector -> name.
_ALL_SELECTORS: dict[str, str] = {
    "0x" + keccak(text=f"{name}()")[:4].hex(): name
    for name in (*ERROR_TO_REASON, *OTHER_ERRORS, *CONTRACT_ONLY_ERRORS)
}
ERROR_STRING_SELECTOR = "0x08c379a0"  # Error(string)
PANIC_SELECTOR = "0x4e487b71"  # Panic(uint256)

_NOT_ALLOW_LISTED = re.compile(
    r"(not\s+allow[\s_-]?listed|non[\s-]?allow[\s_-]?listed|not\s+in\s+(the\s+)?allow\s*list"
    r"|cannot\s+issue\s+transaction\s+from\s+non-allow)",
    re.IGNORECASE,
)


class ChainRevert(Exception):
    """A contract revert: `name` is the custom error name, `reason` its ReasonCode if any."""

    def __init__(self, name: str, reason: ReasonCode | None = None) -> None:
        super().__init__(name)
        self.name = name
        self.reason = reason if reason is not None else ERROR_TO_REASON.get(name)


def revert_for_reason(code: ReasonCode) -> ChainRevert:
    name = REASON_TO_ERROR[code]
    return ChainRevert(name or code.value, code)


def is_blocked_at_protocol(message: object) -> bool:
    """True when an RPC error string says the sender is not in the Tx AllowList."""
    return bool(_NOT_ALLOW_LISTED.search(str(message)))


def reason_from_error_name(name: str) -> ReasonCode | None:
    return ERROR_TO_REASON.get(name)


def reason_from_revert_data(data: str) -> ReasonCode | None:
    """Map 4-byte custom-error selector (hex revert data) to a ReasonCode."""
    if not data or len(data) < 10:
        return None
    name = _SELECTOR_TO_ERROR.get(data[:10].lower())
    return ERROR_TO_REASON.get(name) if name else None


def classify_error(message: object) -> ReasonCode | None:
    """Best-effort: RPC rejection, custom error name or revert data inside an error string."""
    text = str(message)
    if is_blocked_at_protocol(text):
        return ReasonCode.BLOCKED_AT_PROTOCOL
    for name, code in ERROR_TO_REASON.items():
        if name in text:
            return code
    for m in re.finditer(r"0x[0-9a-fA-F]{8,}", text):
        code = reason_from_revert_data(m.group(0))
        if code:
            return code
    return None


# --------------------------------------------------------- write-side decoding (CHN-002)
# RPC strings recorded from Subnet-EVM v0.8.0 (contracts/genesis/README.md), by tag.
_RPC_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("AllowListSenderRejected", _NOT_ALLOW_LISTED),
    ("DeployerNotAuthorized", re.compile(r"is not authorized to deploy a contract", re.IGNORECASE)),
    ("AllowListModifyDenied", re.compile(r"cannot modify allow list", re.IGNORECASE)),
)


def rpc_error_tag(message: object) -> str | None:
    """Name of a known node-level rejection (not a contract revert), else None.

    `AllowListSenderRejected` is the only one that means "blocked at protocol"; the other two come
    from the AllowList precompiles (deploy by a non-deployer, role change by a non-admin).
    """
    text = str(message)
    for tag, pattern in _RPC_PATTERNS:
        if pattern.search(text):
            return tag
    return None


@dataclass(frozen=True)
class RevertInfo:
    """A decoded revert: `name` is the custom error / `Error` / `Panic`, `raw` is what to show."""

    name: str | None
    reason: ReasonCode | None
    raw: str


def decode_revert(data: str | bytes | None) -> RevertInfo:
    """Decode revert data (hex or bytes): custom error, `Error(string)`, `Panic(uint256)`.

    Unknown selectors keep the hex in `raw` (and `name` None); empty data is a bare revert.
    """
    if isinstance(data, bytes | bytearray):
        data = "0x" + bytes(data).hex()
    text = (data or "").lower()
    if len(text) < 10:
        return RevertInfo(None, None, "execution reverted")
    selector = text[:10]
    if selector == ERROR_STRING_SELECTOR:
        try:
            (msg,) = decode(["string"], bytes.fromhex(text[10:]))
            return RevertInfo("Error", None, str(msg))
        except (DecodingError, ValueError, UnicodeDecodeError):  # malformed payload: keep the hex
            return RevertInfo("Error", None, text)
    if selector == PANIC_SELECTOR:
        code = int(text[10:74] or "0", 16)
        return RevertInfo("Panic", None, f"Panic(0x{code:02x})")
    name = _ALL_SELECTORS.get(selector)
    if name is None:
        return RevertInfo(None, None, text)
    return RevertInfo(name, ERROR_TO_REASON.get(name), name)
