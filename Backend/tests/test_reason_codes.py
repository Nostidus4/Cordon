"""Reason code table matches spec §6.4; parity with Frontend src/shared/reasonCodes.ts."""

from guardian.chain.errors import classify_error, is_blocked_at_protocol, reason_from_error_name
from guardian.shared.reason_codes import REASON_TABLE, ReasonCode, error_name, reason_text


def test_table_complete():
    assert set(REASON_TABLE) == set(ReasonCode)
    assert len(ReasonCode) == 10
    assert "PRINCIPAL_DAILY_CAP" not in {c.value for c in ReasonCode}


def test_texts_and_errors():
    assert reason_text("DISTRICT_DAILY_CAP") == "Cả khu hôm nay đã gần hết phần chung"
    assert reason_text(ReasonCode.CARD_DAILY_CAP, "en") == "Card daily cap reached"
    assert error_name(ReasonCode.DISTRICT_LOCKED) == "PrincipalIsLocked"
    assert error_name(ReasonCode.BLOCKED_AT_PROTOCOL) is None
    assert reason_from_error_name("KeyDailyCapExceeded") == ReasonCode.CARD_DAILY_CAP


def test_rpc_not_allow_listed():
    assert is_blocked_at_protocol(
        "rejected: cannot issue transaction from non-allow listed address"
    )
    assert is_blocked_at_protocol("sender is not allow listed")
    assert not is_blocked_at_protocol("execution reverted")
    assert classify_error("tx failed: not allow listed") == ReasonCode.BLOCKED_AT_PROTOCOL
    assert classify_error("execution reverted: SlippageTooHigh()") == ReasonCode.SLIPPAGE
