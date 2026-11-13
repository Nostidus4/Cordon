"""Test helper (CHN-004): a ChainPort wrapper that takes seed ids (`key_minh`, `lan`, `tUSDC`...) and
converts them to hex through the address book before calling the real chain, which accepts hex only."""

from __future__ import annotations

import inspect
from typing import Any

from guardian.domain.address_book import ADDR_ARGS, build_address_book

_PARAMS = {"signer", "member", "key", "to", "token", "dex", "token_in", "token_out", "target"}
_PARAMS |= {"holder", "subject"}
_METHODS = [
    "pay",
    "swap",
    "simulate_pay",
    "simulate_swap",
    "raw_call",
    "emergency_lock",
    "emergency_pause",
    "lower_key_cap",
    "lower_district_cap",
    "revoke_allow",
    "deactivate_key",
    "propose",
    "approve",
    "cancel",
    "balance",
]


class IdPort:
    def __init__(self, chain: Any) -> None:
        self._chain = chain
        self._book: dict[str, str] | None = None

    def addr(self, ref: str) -> str:
        if ref.startswith("0x"):
            return ref
        if self._book is None or ref not in self._book:  # rebuilt on a miss: keys can be added
            self._book = build_address_book(self._chain.snapshot(), self._chain.vault_addr)
        return self._book.get(ref, ref)  # unknown: left as is, the chain rejects it

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._chain, name)
        if name not in _METHODS:
            return attr
        sig = inspect.signature(attr)

        def call(*args: Any, **kwargs: Any) -> Any:
            b = sig.bind(*args, **kwargs)
            for k, v in b.arguments.items():
                if k in _PARAMS and isinstance(v, str):
                    b.arguments[k] = self.addr(v)
            if "calls" in b.arguments:
                b.arguments["calls"] = [
                    {
                        **c,
                        "args": {
                            k: self.addr(v) if k in ADDR_ARGS else v for k, v in c["args"].items()
                        },
                    }
                    for c in b.arguments["calls"]
                ]
            return attr(*b.args, **b.kwargs)

        return call
