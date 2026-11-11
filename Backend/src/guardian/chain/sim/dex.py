"""MockDEX: fixed rate, 1 tTKB = 1 tUSDC in value (spec §6.6). EvilDEX is the same, never whitelisted."""

from __future__ import annotations


class MockDEX:
    def __init__(self, decimals: dict[str, int]) -> None:
        self.decimals = decimals  # shared reference to Ledger.decimals

    def quote(self, token_in: str, token_out: str, amount_in: int) -> int:
        """Equal value across decimals: amount_in * 10^dec_out // 10^dec_in (int only)."""
        return amount_in * 10 ** self.decimals[token_out] // 10 ** self.decimals[token_in]
