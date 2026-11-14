"""Payroll reason codes (PAYROLL.md section 5, decision 8): custom error -> code -> VI/EN text.

Separate enum from `ReasonCode` on purpose (the CONTRACTS.md set and `test_contract_abi.py` stay frozen).
Mirror of Frontend src/shared/payrollReasons.ts.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Final, NamedTuple


class PayrollReason(StrEnum):
    VENUE_NOT_ALLOWED = "VENUE_NOT_ALLOWED"
    VENUE_IMPAIRED = "VENUE_IMPAIRED"
    VENUE_CAP_EXCEEDED = "VENUE_CAP_EXCEEDED"
    BUFFER_BREACHED = "BUFFER_BREACHED"
    LADDER_CEILING_EXCEEDED = "LADDER_CEILING_EXCEEDED"
    DEADLINE_PASSED = "DEADLINE_PASSED"
    KILL_SWITCH_ACTIVE = "KILL_SWITCH_ACTIVE"
    COVERAGE_INSUFFICIENT = "COVERAGE_INSUFFICIENT"
    AGENT_NOT_AUTHORIZED = "AGENT_NOT_AUTHORIZED"
    PAYEE_NOT_IN_ROSTER = "PAYEE_NOT_IN_ROSTER"
    PAYROLL_UNDERFUNDED = "PAYROLL_UNDERFUNDED"
    PAYDAY_NOT_REACHED = "PAYDAY_NOT_REACHED"
    PAYROLL_ALREADY_PAID = "PAYROLL_ALREADY_PAID"
    BLOCKED_AT_PROTOCOL = "BLOCKED_AT_PROTOCOL"  # agent key removed from the Tx AllowList


class PayrollReasonInfo(NamedTuple):
    error: str | None  # Solidity custom error name (primary); None for the RPC rejection
    vi: str
    en: str


PAYROLL_REASON_TABLE: Final[dict[PayrollReason, PayrollReasonInfo]] = {
    PayrollReason.VENUE_NOT_ALLOWED: PayrollReasonInfo(
        "VenueNotAllowed", "Nơi gửi chưa được duyệt", "Venue not approved"
    ),
    PayrollReason.VENUE_IMPAIRED: PayrollReasonInfo(
        "VenueImpairedError", "Nơi gửi đang gặp sự cố", "Venue impaired"
    ),
    PayrollReason.VENUE_CAP_EXCEEDED: PayrollReasonInfo(
        "VenueCapExceeded", "Đã chạm 40% cho một nơi", "Venue cap reached"
    ),
    PayrollReason.BUFFER_BREACHED: PayrollReasonInfo(
        "BufferBreached", "Phải giữ 5% tiền mặt trong kho", "Liquidity buffer required"
    ),
    PayrollReason.LADDER_CEILING_EXCEEDED: PayrollReasonInfo(
        "LadderCeilingExceeded",
        "Vượt mức cho phép của bậc thang hôm nay",
        "Ladder ceiling exceeded",
    ),
    PayrollReason.DEADLINE_PASSED: PayrollReasonInfo(
        "DeadlinePassed", "Đã qua hạn rút về (T-1)", "Past unwind deadline"
    ),
    PayrollReason.KILL_SWITCH_ACTIVE: PayrollReasonInfo(
        "KillSwitchActive", "Công tắc khẩn cấp đang bật", "Kill switch active"
    ),
    PayrollReason.COVERAGE_INSUFFICIENT: PayrollReasonInfo(
        "CoverageInsufficient",
        "Chưa đủ dự phòng nếu một nơi gửi bị kẹt",
        "Not enough cover if a venue freezes",
    ),
    PayrollReason.AGENT_NOT_AUTHORIZED: PayrollReasonInfo(
        "NotAgent", "Khoá này không phải agent quỹ lương", "Not a payroll agent"
    ),
    PayrollReason.PAYEE_NOT_IN_ROSTER: PayrollReasonInfo(
        "NotPayee", "Người nhận không nằm trong bảng lương", "Payee not in roster"
    ),
    PayrollReason.PAYROLL_UNDERFUNDED: PayrollReasonInfo(
        "InsufficientFunds", "Quỹ chưa đủ tiền lương", "Payroll underfunded"
    ),
    PayrollReason.PAYDAY_NOT_REACHED: PayrollReasonInfo(
        "PaydayNotReached", "Chưa tới ngày lương", "Payday not reached"
    ),
    PayrollReason.PAYROLL_ALREADY_PAID: PayrollReasonInfo(
        "AlreadyExecuted", "Kỳ lương này đã chi", "Cycle already paid"
    ),
    PayrollReason.BLOCKED_AT_PROTOCOL: PayrollReasonInfo(
        None,
        "Thẻ đã bị gạch khỏi chain, không gửi được giao dịch",
        "Card removed from chain allow list",
    ),
}

# Every custom error that maps to a code (AlreadyPaid shares PAYROLL_ALREADY_PAID with AlreadyExecuted).
PAYROLL_ERROR_TO_REASON: Final[dict[str, PayrollReason]] = {
    **{i.error: r for r, i in PAYROLL_REASON_TABLE.items() if i.error},
    "AlreadyPaid": PayrollReason.PAYROLL_ALREADY_PAID,
}

# Reverts with no reason code: only the name is kept in `error_raw` (PAYROLL.md section 5).
PAYROLL_OTHER_ERRORS: Final[frozenset[str]] = frozenset(
    {
        "NotGovernor", "NotScheduler", "NotExecutor", "NotAuthorized", "RosterTooLarge",
        "RosterInvalid", "RosterLocked", "CycleNotSettled", "InsufficientIdle", "ZeroAmount",
        "NothingDue", "LadderInvalid", "ExceedsDeployed", "TooManyVenues", "BpsOutOfRange",
        "EmptyRoster", "DeadlineNotReached", "ZeroAddress",
        "NotCouncilMember", "NotTightening", "NeedsThreshold", "AlreadyApproved", "ProposalNotOpen",
        "NotProposer", "TargetNotAllowed", "UnknownCall", "BadCallArgs", "UnknownProposal",
        "ConflictOfInterest",
        "NotAdmin", "Frozen", "InsufficientAssets",
    }
)  # fmt: skip


def payroll_reason_text(code: PayrollReason | str, lang: str = "vi") -> str:
    info = PAYROLL_REASON_TABLE[PayrollReason(code)]
    return info.vi if lang == "vi" else info.en
