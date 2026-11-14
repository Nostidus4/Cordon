"""CChainSource: eth_getLogs chunking and auto-shrink on "block range too large" (no network)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from guardian.chain.cchain import CChainDeployment, CChainSource
from guardian.core.config import Settings

DEP = CChainDeployment(
    network="fuji",
    chain_id=43113,
    rpc_url=None,
    ws_url=None,
    token="0x" + "11" * 20,
    treasury="0x" + "22" * 20,
    escrow="0x" + "33" * 20,
)
ERR = {
    "code": -32602,
    "message": "block range too large: total block range in this request exceeds the maximum of 100 blocks",
}


class FakeW3:
    """eth_getLogs fails above `limit` blocks (like the public Fuji RPC); one log at block 250."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.calls: list[tuple[int, int]] = []
        self.eth = SimpleNamespace(
            get_logs=self.get_logs, get_block=lambda n: {"timestamp": 1000 + n}
        )

    def get_logs(self, flt: dict[str, Any]) -> list[dict[str, Any]]:
        lo, hi = flt["fromBlock"], flt["toBlock"]
        self.calls.append((lo, hi))
        if hi - lo + 1 > self.limit:
            raise ValueError(ERR)
        if lo <= 250 <= hi:
            return [
                {
                    "blockNumber": 250,
                    "transactionHash": bytes.fromhex("ab" * 32),
                    "logIndex": 0,
                    "data": (5000).to_bytes(32, "big"),
                }
            ]
        return []


def test_settings_default_is_100() -> None:
    assert Settings().cchain_log_chunk == 100


def test_chunks_never_exceed_configured_size() -> None:
    w3 = FakeW3(limit=100)
    events = CChainSource(w3, DEP, log_chunk=100).events_between(1, 450)  # type: ignore[arg-type]
    assert max(hi - lo + 1 for lo, hi in w3.calls) <= 100
    assert w3.calls[0] == (1, 100) and w3.calls[-1][1] == 450
    assert len(events) == 1 and events[0].block == 250 and events[0].payload["amount"] == 5000


def test_halves_on_range_error_and_covers_every_block() -> None:
    w3 = FakeW3(limit=30)
    src = CChainSource(w3, DEP, log_chunk=2000)  # type: ignore[arg-type]
    events = src.events_between(1, 400)
    ok = sorted(c for c in w3.calls if c[1] - c[0] + 1 <= 30)
    covered = [b for lo, hi in ok for b in range(lo, hi + 1)]
    assert covered == list(range(1, 401))  # no gap, no overlap
    assert len(events) == 1
    assert src._chunk <= 30  # the smaller size is kept for the next cycle


def test_shrinks_down_to_one_block() -> None:
    w3 = FakeW3(limit=1)
    events = CChainSource(w3, DEP, log_chunk=8).events_between(248, 252)  # type: ignore[arg-type]
    assert len(events) == 1


def test_other_errors_are_not_swallowed() -> None:
    w3 = FakeW3(limit=100)

    def boom(_: dict[str, Any]) -> list[Any]:
        raise ValueError("connection reset")

    w3.eth.get_logs = boom
    with pytest.raises(ValueError, match="connection reset"):
        CChainSource(w3, DEP).events_between(1, 10)  # type: ignore[arg-type]
