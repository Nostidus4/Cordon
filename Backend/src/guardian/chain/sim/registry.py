"""PrincipalRegistry in memory (spec §6.2)."""

from __future__ import annotations

from dataclasses import dataclass

from guardian.chain.errors import ChainRevert


@dataclass
class KeyInfo:
    principal_id: str
    kind: str
    active: bool
    label: str
    seed_id: str = ""


@dataclass
class PrincipalInfo:
    label: str
    kind: str = "HUMAN"


class Registry:
    def __init__(self) -> None:
        self.key_info: dict[str, KeyInfo] = {}
        self.principals: dict[str, PrincipalInfo] = {}
        self.principal_keys: dict[str, list[str]] = {}

    def create_principal(self, pid: str, label: str, kind: str = "HUMAN") -> None:
        if pid in self.principals:
            raise ChainRevert("PrincipalExists")
        self.principals[pid] = PrincipalInfo(label, kind)
        self.principal_keys[pid] = []

    def add_key(self, pid: str, key: str, kind: str, label: str, seed_id: str = "") -> None:
        if pid not in self.principals:
            raise ChainRevert("PrincipalNotFound")
        if key in self.key_info:
            raise ChainRevert("KeyAlreadyRegistered")
        self.key_info[key] = KeyInfo(pid, kind, True, label, seed_id)
        self.principal_keys[pid].append(key)

    def move_key(self, key: str, to: str) -> str:
        """Returns the previous principal id."""
        if key not in self.key_info:
            raise ChainRevert("KeyNotRegistered")
        if to not in self.principals:
            raise ChainRevert("PrincipalNotFound")
        old = self.key_info[key].principal_id
        self.principal_keys[old].remove(key)
        self.principal_keys[to].append(key)
        self.key_info[key].principal_id = to
        return old

    def deactivate_key(self, key: str) -> None:
        if key not in self.key_info:
            raise ChainRevert("KeyNotRegistered")
        self.key_info[key].active = False

    def principal_of(self, key: str) -> str | None:
        info = self.key_info.get(key)
        return info.principal_id if info else None

    def keys_of(self, pid: str) -> list[str]:
        return list(self.principal_keys.get(pid, []))
