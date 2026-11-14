"""Tunables of the float rule engine (PAYROLL.md section 7)."""

from __future__ import annotations

from dataclasses import dataclass

from guardian.shared.money import to_base


@dataclass(frozen=True)
class FloatParams:
    min_allocation: int = to_base(100)  # skip allocations smaller than this (tUSDC base units)
    min_hold_days: int = 2  # do not place money the next rung would pull back within this many days
    kill_reason: int = 3  # automation


DEFAULT_PARAMS = FloatParams()
