"""Scene 4 step list: signer, action, expected outcome (spec §4.3). Mirror of Frontend src/shared/scenario4.ts.

Canonical district-cap code is DISTRICT_DAILY_CAP (spec §6.4); §4.3 'PRINCIPAL_DAILY_CAP' is a spec typo.
Step 2 swaps tUSDC -> tTKB through EvilDEX: with tSCAM as tokenOut the §6.3 check order (token before
protocol) would return TOKEN_NOT_ALLOWED, but the §4.3 table expects PROTOCOL_NOT_ALLOWED.
Expected district spent is for district `minh` on policy v2 (cap 30.000), in tUSDC base units.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from guardian.shared.money import to_base

ActionT = Literal["pay", "swap", "lock", "raw_call"]
U = to_base(1)


@dataclass(frozen=True)
class Scenario4Step:
    step: int
    display_time: str
    signer: str  # seed id: key_* or council_*
    action: ActionT
    params: dict[str, Any] = field(default_factory=dict)
    expected_outcome: Literal["ok", "reverted", "blocked_at_protocol"] = "ok"
    expected_reason: str | None = None
    expected_district_spent_after: int | None = None  # None = not applicable
    note: str = ""


SCENARIO4_DISTRICT = "minh"
SCENARIO4_DAILY_CAP = to_base(30_000)

SCENARIO4_STEPS: tuple[Scenario4Step, ...] = (
    Scenario4Step(
        0,
        "09:00",
        "key_agent_rebalance",
        "swap",
        {
            "dex": "mock_dex",
            "token_in": "tUSDC",
            "token_out": "tTKB",
            "amount_in": to_base(5_000),
            "min_out": 0,
        },
        "ok",
        None,
        to_base(5_000),
        "agent that is really running",
    ),
    Scenario4Step(
        1,
        "14:01",
        "key_agent_intl_pay",
        "pay",
        {"token": "tUSDC", "to": "stranger_wallet", "amount": to_base(20_000)},
        "reverted",
        "RECIPIENT_NOT_ALLOWED",
        to_base(5_000),
    ),
    Scenario4Step(
        2,
        "14:02",
        "key_agent_rebalance",
        "swap",
        {
            "dex": "evil_dex",
            "token_in": "tUSDC",
            "token_out": "tTKB",
            "amount_in": to_base(5_000),
            "min_out": 0,
        },
        "reverted",
        "PROTOCOL_NOT_ALLOWED",
        to_base(5_000),
    ),
    Scenario4Step(
        3,
        "14:02",
        "key_agent_data",
        "pay",
        {"token": "tUSDC", "to": "vendor_data_api", "amount": to_base(10_000)},
        "ok",
        None,
        to_base(15_000),
    ),
    Scenario4Step(
        4,
        "14:03",
        "key_minh",
        "pay",
        {"token": "tUSDC", "to": "vendor_cloud", "amount": to_base(10_000)},
        "ok",
        None,
        to_base(25_000),
    ),
    Scenario4Step(
        5,
        "14:03",
        "key_svc_payment",
        "pay",
        {"token": "tUSDC", "to": "vendor_cloud", "amount": to_base(10_000)},
        "reverted",
        "DISTRICT_DAILY_CAP",
        to_base(25_000),
    ),
    Scenario4Step(
        6,
        "14:04",
        "council_lan",
        "lock",
        {"principal_id": "minh"},
        "ok",
        None,
        None,
        "1 council member tightens; 5 keys setNone",
    ),
    Scenario4Step(
        7,
        "14:05",
        "key_minh",
        "raw_call",
        {"target": "tSCAM", "data": "0x095ea7b3"},  # approve(address,uint256) selector
        "blocked_at_protocol",
        "BLOCKED_AT_PROTOCOL",
        None,
        "no tx hash",
    ),
)
