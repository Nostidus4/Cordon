"""Decode custom-error revert -> reason code; RPC 'not allow listed' -> BLOCKED_AT_PROTOCOL (spec §6.1, §6.4).

Usable by the sim chain and by a future web3 implementation.
"""

from __future__ import annotations

import re

from eth_utils import keccak

from guardian.shared.reason_codes import REASON_TABLE, ReasonCode

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

_SELECTOR_TO_ERROR: dict[str, str] = {
    "0x" + keccak(text=f"{name}()")[:4].hex(): name for name in ERROR_TO_REASON
}

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
