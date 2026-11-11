"""Integer-only money helpers: base units <-> display `30.000`, Money{raw,display} (spec §4.1, §12).

No floats anywhere: tUSDC has 6 decimals, tTKB/tSCAM 18.
"""

from __future__ import annotations

USDC_DECIMALS = 6
TOKEN_18_DECIMALS = 18


def to_base(display_int: int, decimals: int = USDC_DECIMALS) -> int:
    """Whole display units -> base units: to_base(30_000) == 30_000_000_000."""
    if isinstance(display_int, bool) or not isinstance(display_int, int):
        raise TypeError("to_base expects an int (no floats)")
    return display_int * 10**decimals


def _group_thousands(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def fmt_display(base: int, decimals: int = USDC_DECIMALS) -> str:
    """Base units -> "30.000" (dot thousands); non-zero fraction -> comma decimals ("1,5")."""
    if isinstance(base, bool) or not isinstance(base, int):
        raise TypeError("fmt_display expects an int (no floats)")
    sign = "-" if base < 0 else ""
    whole, frac = divmod(abs(base), 10**decimals)
    out = _group_thousands(whole)
    if frac:
        out += "," + str(frac).rjust(decimals, "0").rstrip("0")
    return sign + out


def money(base: int, decimals: int = USDC_DECIMALS) -> dict[str, str]:
    """API shape {raw, display}; raw is a decimal string (bigint-safe for JSON)."""
    return {"raw": str(base), "display": fmt_display(base, decimals)}
