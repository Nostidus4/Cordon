"""Symbolic Council calls (`{"target": "vault", "fn": "setKeyDailyCap", "args": {...}}`) -> ABI calldata.

Same vocabulary as the sim (`chain/sim/council.py`); the result is the `Call[]` the real
`GuardianCouncil.propose` takes. Errors raise `ChainRevert` with the contract's own names
(`TargetNotAllowed`, `UnknownCall`, `BadCallArgs`) so sim and L1 fail alike before any tx is sent.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from eth_utils import to_checksum_address
from web3.contract import Contract

from guardian.chain.errors import ChainRevert
from guardian.chain.precompiles import TX_ALLOWLIST

KEY_KINDS = {"HUMAN": 0, "AGENT": 1, "SERVICE": 2}
ZERO_SELECTOR = "0x00000000"
# Executed proposals end with `bumpPolicyVersion` inside the Council, so a symbolic call to it is
# implicit on chain (the Council would reject it as `UnknownCall`): it is dropped here.
IMPLICIT_FNS = frozenset({"bumpPolicyVersion"})


def id_to_bytes32(text: str) -> bytes:
    """Principal id "minh" -> ASCII left-aligned bytes32; a 0x + 64 hex string passes through."""
    if text.startswith("0x") and len(text) == 66:
        return bytes.fromhex(text[2:])
    raw = text.encode()
    if not raw or len(raw) > 32:
        raise ChainRevert("BadCallArgs")
    return raw.ljust(32, b"\x00")


def address_to_bytes32(address: str) -> bytes:
    return bytes(12) + bytes.fromhex(to_checksum_address(address)[2:])


def hash_to_bytes32(value: str | None) -> bytes:
    """`0x...` hash (the sim also accepts short ones like "0x01") -> bytes32, right-aligned."""
    text = (value or "").removeprefix("0x")
    if len(text) % 2:
        text = "0" + text
    raw = bytes.fromhex(text) if text else b""
    if len(raw) > 32:
        raise ChainRevert("BadCallArgs")
    return raw.rjust(32, b"\x00")


def _first(args: dict[str, Any], *names: str) -> Any:
    for n in names:
        if args.get(n) not in (None, ""):
            return args[n]
    raise ChainRevert("BadCallArgs")


class CallEncoder:
    """Encodes symbolic calls against the deployed registry/vault; `resolve` maps seed ids to addresses."""

    def __init__(
        self,
        registry: Contract,
        vault: Contract,
        tx_allowlist: Contract,
        resolve: Callable[[str], str],
        default_selector: Callable[[str], str | None],
    ):
        self._registry = registry
        self._vault = vault
        self._txallow = tx_allowlist
        self._resolve = resolve
        self._default_selector = default_selector

    def encode(self, calls: list[dict[str, Any]]) -> list[tuple[str, bytes]]:
        out: list[tuple[str, bytes]] = []
        for call in calls:
            if call.get("fn") in IMPLICIT_FNS and call.get("target") == "vault":
                continue
            out.append(self._encode_one(call))
        return out

    def _addr(self, value: Any) -> str:
        try:
            return self._resolve(str(value))
        except KeyError as exc:
            raise ChainRevert("BadCallArgs") from exc

    def _encode_one(self, call: dict[str, Any]) -> tuple[str, bytes]:
        target, fn, a = call.get("target"), call.get("fn"), call.get("args") or {}
        if target == "registry":
            contract, address = self._registry, self._registry.address
        elif target == "vault":
            contract, address = self._vault, self._vault.address
        elif target == "tx_allowlist":
            contract, address = self._txallow, TX_ALLOWLIST
        else:
            raise ChainRevert("TargetNotAllowed")
        args = self._args(target, str(fn), a)
        try:
            data = contract.encode_abi(str(fn), args=args)
        except (ValueError, TypeError) as exc:  # unknown function name or wrong argument shape
            raise ChainRevert(
                "UnknownCall" if _unknown_fn(contract, str(fn)) else "BadCallArgs"
            ) from exc
        return to_checksum_address(address), bytes.fromhex(data.removeprefix("0x"))

    def _args(self, target: str, fn: str, a: dict[str, Any]) -> list[Any]:
        def pid() -> bytes:
            return id_to_bytes32(str(_first(a, "principal_id", "principalId", "id")))

        def key() -> str:
            return self._addr(_first(a, "key"))

        try:
            if target == "registry":
                if fn == "createPrincipal":
                    return [
                        id_to_bytes32(str(_first(a, "id", "principal_id"))),
                        str(a.get("label", a.get("id", ""))),
                    ]
                if fn == "addKey":
                    kind = KEY_KINDS.get(str(_first(a, "kind")).upper())
                    if kind is None:
                        raise ChainRevert("BadCallArgs")
                    return [
                        id_to_bytes32(str(_first(a, "id", "principal_id"))),
                        key(),
                        kind,
                        str(a.get("label", "")),
                    ]
                if fn == "moveKey":
                    return [key(), id_to_bytes32(str(_first(a, "to", "toId")))]
                if fn == "deactivateKey":
                    return [key()]
            elif target == "vault":
                if fn in ("lockPrincipal", "unlockPrincipal"):
                    return [pid()]
                if fn in ("pauseAll", "unpauseAll"):
                    return []
                if fn == "setKeyDailyCap":
                    return [key(), int(_first(a, "cap"))]
                if fn == "setPrincipalDailyCap":
                    return [pid(), int(_first(a, "cap"))]
                if fn == "setTokenAllowed":
                    return [self._addr(_first(a, "token", "subject")), bool(a["allowed"])]
                if fn == "setRecipientAllowed":
                    return [self._addr(_first(a, "recipient", "subject")), bool(a["allowed"])]
                if fn == "setProtocolAllowed":
                    addr = self._addr(_first(a, "target", "subject"))
                    sel = a.get("selector") or self._default_selector(addr) or ZERO_SELECTOR
                    return [addr, bytes.fromhex(str(sel).removeprefix("0x")), bool(a["allowed"])]
            elif fn in ("setEnabled", "setNone"):
                return [self._addr(_first(a, "address", "key"))]
        except (KeyError, ValueError, TypeError) as exc:
            raise ChainRevert("BadCallArgs") from exc
        raise ChainRevert("UnknownCall")


def _unknown_fn(contract: Contract, fn: str) -> bool:
    return not any(i.get("type") == "function" and i.get("name") == fn for i in contract.abi)
