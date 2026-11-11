"""Tx AllowList precompile (0x02..02): role per address; None => node rejects the tx (spec §6.1)."""

from __future__ import annotations

NONE, ENABLED, ADMIN = "None", "Enabled", "Admin"


class TxAllowList:
    def __init__(self) -> None:
        self.roles: dict[str, str] = {}

    def set_enabled(self, addr: str) -> None:
        self.roles[addr] = ENABLED

    def set_none(self, addr: str) -> None:
        self.roles[addr] = NONE

    def role(self, addr: str) -> str:
        return self.roles.get(addr, NONE)

    def is_allowed(self, addr: str) -> bool:
        return self.role(addr) != NONE
