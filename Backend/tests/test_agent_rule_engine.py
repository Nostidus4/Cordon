"""Swap 5.000 on first run; CARD_DAILY_CAP when exhausted."""

from guardian.agent_rebalance.reason_writer import reason_hash, write_reason
from guardian.agent_rebalance.rule_engine import decide
from guardian.shared.money import to_base


def test_first_run_on_seed_is_5000():
    d = decide(to_base(200_000), 0, to_base(20_000), None)
    assert d is not None and d.amount_in == to_base(5_000)
    assert d.gap == to_base(40_000)


def test_limits_apply():
    assert decide(to_base(200_000), 0, to_base(3_000), None).amount_in == to_base(3_000)
    assert decide(to_base(200_000), 0, to_base(20_000), to_base(1_000)).amount_in == to_base(1_000)


def test_nothing_when_balanced_or_exhausted():
    assert decide(to_base(160_000), to_base(40_000), to_base(20_000), None) is None
    assert decide(to_base(162_000), to_base(38_000), to_base(20_000), None) is None  # drift 1%
    assert decide(to_base(200_000), 0, 0, None) is None
    assert decide(to_base(200_000), 0, to_base(20_000), 0) is None


def test_reason_writer():
    d = decide(to_base(200_000), 0, to_base(20_000), None)
    text, source = write_reason(d)
    assert source == "template" and "5.000" in text and "20%" in text
    assert reason_hash(text).startswith("0x") and len(reason_hash(text)) == 66
