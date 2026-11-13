"""Tx Guardian rule engine: five pure rules with stable ids (docs/spec/CITY_OPS.md §7).

No I/O, no chain access: the service gathers the facts into a `RuleInput`, the rules only read it.
A rule never loosens anything: it can only add a warning (`caution` / `danger`).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Final, Literal

MAX_UINT256: Final = 2**256 - 1
UNLIMITED_FROM: Final = 2**255
DRAIN_PERCENT: Final = 95
SLIPPAGE_CAUTION_PERCENT: Final = 3
SLIPPAGE_DANGER_PERCENT: Final = 10

Level = Literal["caution", "danger"]


@dataclass(frozen=True)
class RuleInput:
    """Facts about one prepared transaction. Addresses are lowercase hex."""

    kind: Literal["pay", "swap", "approve", "raw"]
    known: frozenset[
        str
    ]  # addresses the organisation already trusts (whitelist, keys, council, vault)
    targets: tuple[str, ...] = ()  # every address the tx sends to / calls / approves
    amount: int | None = None  # the spent amount (pay/swap input)
    balance: int | None = None  # vault balance of the spent token
    quoted_out: int | None = None  # swap: what the DEX quotes
    min_out: int | None = None  # swap: the floor the signer accepts
    approve_amounts: tuple[int, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Finding:
    rule_id: str
    level: Level
    title_vi: str
    detail_vi: str


def _short(addr: str) -> tuple[str, str]:
    h = addr.lower().removeprefix("0x")
    return h[:4], h[-4:]


def looks_like(a: str, b: str) -> bool:
    """Same first 4 and last 4 hex characters, but not the same address."""
    return a.lower() != b.lower() and _short(a) == _short(b)


def unlimited_approval(i: RuleInput) -> Finding | None:
    if any(a >= UNLIMITED_FROM for a in i.approve_amounts):
        return Finding(
            "unlimited_approval",
            "danger",
            "Cấp quyền không giới hạn",
            "Giao dịch cho phép bên kia tiêu số tiền không có giới hạn từ kho. Chỉ cấp đúng số cần dùng.",
        )
    return None


def unknown_contract(i: RuleInput) -> Finding | None:
    if any(t.lower() not in i.known for t in i.targets):
        level: Level = "caution" if i.kind == "pay" else "danger"
        return Finding(
            "unknown_contract",
            level,
            "Địa chỉ chưa được duyệt",
            "Nơi nhận hoặc hợp đồng được gọi chưa nằm trong danh sách đã duyệt của tổ chức.",
        )
    return None


def address_poisoning(i: RuleInput) -> Finding | None:
    for t in i.targets:
        if t.lower() not in i.known and any(looks_like(t, k) for k in i.known):
            return Finding(
                "address_poisoning",
                "danger",
                "Địa chỉ giống địa chỉ quen",
                "Địa chỉ này có đầu và đuôi giống một địa chỉ đã duyệt nhưng không phải nó. "
                "Kẻ gian hay dùng cách này để đánh lừa.",
            )
    return None


def drain(i: RuleInput) -> Finding | None:
    if i.kind not in ("pay", "swap") or not i.amount or not i.balance:
        return None
    if i.amount * 100 >= i.balance * DRAIN_PERCENT:
        return Finding(
            "drain",
            "danger",
            "Rút gần hết số dư",
            "Số tiền gần bằng toàn bộ số dư của kho với loại tiền này.",
        )
    return None


def abnormal_slippage(i: RuleInput) -> Finding | None:
    if i.kind != "swap" or i.quoted_out is None or i.quoted_out <= 0:
        return None
    floor = i.min_out or 0
    if floor == 0:
        return Finding(
            "abnormal_slippage",
            "danger",
            "Không đặt mức giá tối thiểu",
            "Lệnh đổi chấp nhận nhận về bao nhiêu cũng được, nên dễ bị ép giá.",
        )
    loss_pct_x = (
        i.quoted_out - floor
    ) * 100  # compare in integers: loss% > N  <=>  loss*100 > N*quoted
    if loss_pct_x > SLIPPAGE_DANGER_PERCENT * i.quoted_out:
        level: Level = "danger"
    elif loss_pct_x > SLIPPAGE_CAUTION_PERCENT * i.quoted_out:
        level = "caution"
    else:
        return None
    return Finding(
        "abnormal_slippage",
        level,
        "Mức trượt giá bất thường",
        "Giá tối thiểu thấp hơn giá báo nhiều hơn mức bình thường.",
    )


RULES: Final[tuple[tuple[str, Callable[[RuleInput], Finding | None]], ...]] = (
    ("unlimited_approval", unlimited_approval),
    ("unknown_contract", unknown_contract),
    ("address_poisoning", address_poisoning),
    ("drain", drain),
    ("abnormal_slippage", abnormal_slippage),
)
RULE_IDS: Final = tuple(rid for rid, _ in RULES)


def evaluate(i: RuleInput) -> list[Finding]:
    return [f for _, rule in RULES if (f := rule(i)) is not None]


def overall_level(
    findings: list[Finding], chain_rejects: bool
) -> Literal["safe", "caution", "danger"]:
    if chain_rejects or any(f.level == "danger" for f in findings):
        return "danger"
    return "caution" if findings else "safe"
