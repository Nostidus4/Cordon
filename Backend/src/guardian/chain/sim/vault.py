"""PolicyVault state + check order of spec §6.3 (pure checks; the engine mutates)."""

from __future__ import annotations

from collections.abc import Callable

from guardian.chain.sim.registry import Registry
from guardian.shared.reason_codes import ReasonCode


class PolicyVault:
    def __init__(self) -> None:
        self.policy_version = 1
        self.paused = False
        self.key_cap: dict[str, int] = {}
        self.principal_cap: dict[str, int] = {}
        self.key_spent: dict[tuple[str, int], int] = {}
        self.principal_spent: dict[tuple[str, int], int] = {}
        self.token_allowed: dict[str, bool] = {}
        self.protocol_allowed: set[tuple[str, str]] = set()  # (target, selector lowercase)
        self.recipient_allowed: set[str] = set()
        self.locked: set[str] = set()

    def spent_key(self, key: str, day: int) -> int:
        return self.key_spent.get((key, day), 0)

    def spent_principal(self, pid: str, day: int) -> int:
        return self.principal_spent.get((pid, day), 0)

    def check(
        self,
        registry: Registry,
        sender: str,
        tokens: list[str],
        target_check: Callable[[], ReasonCode | None],
        value: int,
        day: int,
    ) -> ReasonCode | None:
        """Order: paused, key registered+active, district locked, token(s), protocol/recipient,
        card cap, district cap."""
        if self.paused:
            return ReasonCode.VAULT_PAUSED
        info = registry.key_info.get(sender)
        if info is None or not info.active:
            return ReasonCode.KEY_NOT_REGISTERED
        pid = info.principal_id
        if pid in self.locked:
            return ReasonCode.DISTRICT_LOCKED
        if any(not self.token_allowed.get(t, False) for t in tokens):
            return ReasonCode.TOKEN_NOT_ALLOWED
        reason = target_check()
        if reason:
            return reason
        if self.spent_key(sender, day) + value > self.key_cap.get(sender, 0):
            return ReasonCode.CARD_DAILY_CAP
        cap = self.principal_cap.get(pid, 0)
        if cap > 0 and self.spent_principal(pid, day) + value > cap:
            return ReasonCode.DISTRICT_DAILY_CAP
        return None
