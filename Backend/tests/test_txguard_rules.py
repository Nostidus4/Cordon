"""CITY-003: the five Tx Guardian rules, each with a transaction that triggers it and one that does not."""

from __future__ import annotations

from typing import Any

from guardian.shared.money import to_base
from guardian.txguard import rules as rl

VENDOR = "0x9b94b642795fbcc6fbf423a04b0daede432d259d"
KNOWN = frozenset({VENDOR, "0x60c9cf084ab6a1b648bdc60e5f1472e61b44a669"})
STRANGER = "0xd7c00adab1fa0efce746a93722163514798cc928"
LOOKALIKE = "0x9b94" + "0" * 32 + "259d"  # same first 4 / last 4 hex as VENDOR, different address


def pay(**kw: Any) -> rl.RuleInput:
    base: dict[str, Any] = {
        "kind": "pay",
        "known": KNOWN,
        "targets": (VENDOR,),
        "amount": to_base(1_000),
        "balance": to_base(100_000),
    }
    return rl.RuleInput(**{**base, **kw})


def test_rule_ids_are_the_five_stable_ids() -> None:
    assert rl.RULE_IDS == (
        "unlimited_approval",
        "unknown_contract",
        "address_poisoning",
        "drain",
        "abnormal_slippage",
    )


def test_a_plain_whitelisted_payment_raises_nothing() -> None:
    assert rl.evaluate(pay()) == []
    assert rl.overall_level([], chain_rejects=False) == "safe"


# --- unlimited_approval
def test_unlimited_approval_triggers_at_2_pow_255_and_max_uint() -> None:
    for amt in (rl.UNLIMITED_FROM, rl.MAX_UINT256):
        f = rl.unlimited_approval(rl.RuleInput("approve", KNOWN, (VENDOR,), approve_amounts=(amt,)))
        assert f is not None and f.rule_id == "unlimited_approval" and f.level == "danger"


def test_unlimited_approval_ignores_a_bounded_approval() -> None:
    i = rl.RuleInput("approve", KNOWN, (VENDOR,), approve_amounts=(rl.UNLIMITED_FROM - 1,))
    assert rl.unlimited_approval(i) is None
    assert rl.unlimited_approval(pay()) is None


# --- unknown_contract
def test_unknown_contract_triggers_for_an_address_outside_the_known_set() -> None:
    f = rl.unknown_contract(pay(targets=(STRANGER,)))
    assert f is not None and f.rule_id == "unknown_contract" and f.level == "caution"
    swap_f = rl.unknown_contract(rl.RuleInput("swap", KNOWN, (STRANGER,)))
    assert swap_f is not None and swap_f.level == "danger"


def test_unknown_contract_ignores_a_known_address_in_any_case() -> None:
    assert rl.unknown_contract(pay(targets=("0x" + VENDOR[2:].upper(),))) is None


# --- address_poisoning
def test_address_poisoning_triggers_for_a_lookalike_of_a_known_address() -> None:
    f = rl.address_poisoning(pay(targets=(LOOKALIKE,)))
    assert f is not None and f.rule_id == "address_poisoning" and f.level == "danger"


def test_address_poisoning_ignores_the_real_address_and_an_unrelated_stranger() -> None:
    assert rl.address_poisoning(pay(targets=(VENDOR,))) is None
    assert (
        rl.address_poisoning(pay(targets=(STRANGER,))) is None
    )  # unknown, but looks like nothing known


# --- drain
def test_drain_triggers_at_95_percent_of_the_balance() -> None:
    f = rl.drain(pay(amount=to_base(95_000), balance=to_base(100_000)))
    assert f is not None and f.rule_id == "drain" and f.level == "danger"
    assert rl.drain(pay(amount=to_base(100_000), balance=to_base(100_000))) is not None


def test_drain_ignores_just_under_95_percent_and_unknown_balance() -> None:
    assert rl.drain(pay(amount=to_base(94_999), balance=to_base(100_000))) is None
    assert rl.drain(pay(balance=None)) is None
    assert rl.drain(pay(balance=0)) is None


# --- abnormal_slippage
def swap(quoted: int, min_out: int) -> rl.RuleInput:
    return rl.RuleInput("swap", KNOWN, (VENDOR,), amount=quoted, quoted_out=quoted, min_out=min_out)


def test_abnormal_slippage_triggers_for_min_out_zero_and_for_over_3_percent() -> None:
    q = to_base(1_000)
    zero = rl.abnormal_slippage(swap(q, 0))
    assert zero is not None and zero.rule_id == "abnormal_slippage" and zero.level == "danger"
    caution = rl.abnormal_slippage(swap(q, q * 95 // 100))  # 5% below the quote
    assert caution is not None and caution.level == "caution"
    danger = rl.abnormal_slippage(swap(q, q * 80 // 100))  # 20% below the quote
    assert danger is not None and danger.level == "danger"


def test_abnormal_slippage_ignores_up_to_3_percent_and_non_swaps() -> None:
    q = to_base(1_000)
    assert rl.abnormal_slippage(swap(q, q * 97 // 100)) is None  # exactly 3% is allowed
    assert rl.abnormal_slippage(swap(q, q)) is None
    assert rl.abnormal_slippage(pay()) is None


def test_overall_level_chain_rejection_is_always_danger() -> None:
    caution = [rl.Finding("unknown_contract", "caution", "t", "d")]
    assert rl.overall_level(caution, chain_rejects=False) == "caution"
    assert rl.overall_level(caution, chain_rejects=True) == "danger"
