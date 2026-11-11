"""Reason codes: custom error -> code -> VI/EN text (spec §6.4).

Canonical district-cap code is DISTRICT_DAILY_CAP (spec §6.4); §4.3 'PRINCIPAL_DAILY_CAP'
is a spec typo. Mirror of Frontend src/shared/reasonCodes.ts.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Final, NamedTuple


class ReasonCode(StrEnum):
    VAULT_PAUSED = "VAULT_PAUSED"
    KEY_NOT_REGISTERED = "KEY_NOT_REGISTERED"
    DISTRICT_LOCKED = "DISTRICT_LOCKED"
    TOKEN_NOT_ALLOWED = "TOKEN_NOT_ALLOWED"
    PROTOCOL_NOT_ALLOWED = "PROTOCOL_NOT_ALLOWED"
    RECIPIENT_NOT_ALLOWED = "RECIPIENT_NOT_ALLOWED"
    CARD_DAILY_CAP = "CARD_DAILY_CAP"
    DISTRICT_DAILY_CAP = "DISTRICT_DAILY_CAP"
    SLIPPAGE = "SLIPPAGE"
    BLOCKED_AT_PROTOCOL = "BLOCKED_AT_PROTOCOL"


class ReasonInfo(NamedTuple):
    error: str | None  # Solidity custom error name; None for the RPC rejection
    vi: str
    en: str


REASON_TABLE: Final[dict[ReasonCode, ReasonInfo]] = {
    ReasonCode.VAULT_PAUSED: ReasonInfo("VaultPaused", "Cả kho đang dừng", "Vault paused"),
    ReasonCode.KEY_NOT_REGISTERED: ReasonInfo(
        "KeyNotRegistered", "Thẻ chưa đăng ký", "Card not registered"
    ),
    ReasonCode.DISTRICT_LOCKED: ReasonInfo(
        "PrincipalIsLocked", "Khu đã bị khoá", "District cordoned off"
    ),
    ReasonCode.TOKEN_NOT_ALLOWED: ReasonInfo(
        "TokenNotAllowed", "Loại tiền chưa duyệt", "Token not approved"
    ),
    ReasonCode.PROTOCOL_NOT_ALLOWED: ReasonInfo(
        "ProtocolNotAllowed", "Chợ đổi tiền chưa duyệt", "Protocol not approved"
    ),
    ReasonCode.RECIPIENT_NOT_ALLOWED: ReasonInfo(
        "RecipientNotAllowed", "Người nhận chưa duyệt", "Recipient not approved"
    ),
    ReasonCode.CARD_DAILY_CAP: ReasonInfo(
        "KeyDailyCapExceeded", "Thẻ này đã hết hạn mức hôm nay", "Card daily cap reached"
    ),
    ReasonCode.DISTRICT_DAILY_CAP: ReasonInfo(
        "PrincipalDailyCapExceeded",
        "Cả khu hôm nay đã gần hết phần chung",
        "District daily cap reached",
    ),
    ReasonCode.SLIPPAGE: ReasonInfo("SlippageTooHigh", "Trượt giá quá mức", "Slippage too high"),
    ReasonCode.BLOCKED_AT_PROTOCOL: ReasonInfo(
        None,
        "Thẻ đã bị gạch khỏi chain, không gửi được giao dịch",
        "Card removed from chain allow list",
    ),
}


def reason_text(code: ReasonCode | str, lang: str = "vi") -> str:
    info = REASON_TABLE[ReasonCode(code)]
    return info.vi if lang == "vi" else info.en


def error_name(code: ReasonCode | str) -> str | None:
    return REASON_TABLE[ReasonCode(code)].error
