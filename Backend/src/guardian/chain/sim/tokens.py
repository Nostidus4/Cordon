"""In-memory ERC-20 ledger: balances[(holder, token)] in base units."""

from __future__ import annotations

from guardian.chain.errors import ChainRevert


class Ledger:
    def __init__(self) -> None:
        self.decimals: dict[str, int] = {}
        self.symbols: dict[str, str] = {}
        self.balances: dict[tuple[str, str], int] = {}

    def add_token(self, address: str, symbol: str, decimals: int) -> None:
        self.decimals[address] = decimals
        self.symbols[address] = symbol

    def balance(self, holder: str, token: str) -> int:
        return self.balances.get((holder, token), 0)

    def mint(self, holder: str, token: str, amount: int) -> None:
        self.balances[(holder, token)] = self.balance(holder, token) + amount

    def transfer(self, src: str, dst: str, token: str, amount: int) -> None:
        if self.balance(src, token) < amount:
            raise ChainRevert("InsufficientBalance")
        self.balances[(src, token)] -= amount
        self.mint(dst, token, amount)
