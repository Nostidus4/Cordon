"""Format 30.000, bigint only."""

import pytest

from guardian.shared.money import fmt_display, money, to_base


def test_to_base_and_display():
    assert to_base(30_000) == 30_000_000_000
    assert fmt_display(30_000_000_000) == "30.000"
    assert fmt_display(2_000_000 * 10**6) == "2.000.000"
    assert fmt_display(0) == "0"
    assert fmt_display(1_500_000) == "1,5"
    assert fmt_display(1) == "0,000001"
    assert fmt_display(5 * 10**18, 18) == "5"
    assert to_base(5, 18) == 5 * 10**18


def test_money_shape():
    assert money(30_000_000_000) == {"raw": "30000000000", "display": "30.000"}


def test_no_floats():
    with pytest.raises(TypeError):
        to_base(1.5)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        fmt_display(1.5)  # type: ignore[arg-type]
