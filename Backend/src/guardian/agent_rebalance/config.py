"""Target weights (80/20), drift threshold (5%), max 5.000, interval."""

from __future__ import annotations

from dataclasses import dataclass

from guardian.shared.money import to_base


@dataclass(frozen=True)
class RebalanceConfig:
    target_ttkb_bps: int = 2000  # 20% tTKB (80/20)
    drift_bps: int = 500  # act when tTKB weight < target - 5%
    max_amount_in: int = to_base(5_000)  # tUSDC base units
    interval_minutes: int = 5


DEFAULT_CONFIG = RebalanceConfig()
