"""Pure rule engine: decide swap amountIn = min(gap, key left, district left, 5.000) (spec §7.1)."""

from __future__ import annotations

from dataclasses import dataclass

from guardian.agent_rebalance.config import DEFAULT_CONFIG, RebalanceConfig


@dataclass(frozen=True)
class Decision:
    token_in: str
    token_out: str
    amount_in: int  # tUSDC base units
    gap: int  # value missing in tTKB to reach target
    ttkb_weight_bps: int
    target_bps: int
    total_value: int


def decide(
    vault_tusdc: int,
    vault_ttkb: int,
    key_remaining: int,
    district_remaining: int | None,
    cfg: RebalanceConfig = DEFAULT_CONFIG,
) -> Decision | None:
    """All amounts in tUSDC base units (caller converts tTKB value at the MockDEX rate).

    `district_remaining=None` means no shared district cap. Returns None when no action is needed.
    """
    total = vault_tusdc + vault_ttkb
    if total <= 0:
        return None
    weight_bps = vault_ttkb * 10_000 // total
    if vault_ttkb * 10_000 >= total * (cfg.target_ttkb_bps - cfg.drift_bps):
        return None
    gap = total * cfg.target_ttkb_bps // 10_000 - vault_ttkb
    limits = [gap, key_remaining, vault_tusdc, cfg.max_amount_in]
    if district_remaining is not None:
        limits.append(district_remaining)
    amount = min(limits)
    if amount <= 0:
        return None
    return Decision("tUSDC", "tTKB", amount, gap, weight_bps, cfg.target_ttkb_bps, total)
