"""C-Chain reader for the simulated top-up (IDX-002, spec §6.8).

The treasury (a multisig on the C-Chain) sends the test token to an escrow address. The only thing the
backend reads there is the ERC-20 `Transfer(from == treasury, to == escrow)` on the deployed token, stored
as a `CChainTransfer` event (same `(tx_hash, log_index)` idempotency as the L1 events). The L1 vault's
`TopUpRecorded(cChainTxHash, amount)` carries the same tx hash, which is how the two sides are linked.
Deployment file: `Backend/deployments/{fuji,local}-c.json` (written by the OPS-002 scripts).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from eth_utils import keccak, to_checksum_address
from hexbytes import HexBytes
from web3 import Web3

from guardian.chain.base import ChainEvent
from guardian.chain.client import ChainReadError, make_web3

TRANSFER_TOPIC = "0x" + keccak(text="Transfer(address,address,uint256)").hex()
EVENT_NAME = "CChainTransfer"


@dataclass(frozen=True)
class CChainDeployment:
    network: str
    chain_id: int | None
    rpc_url: str | None
    ws_url: str | None
    token: str
    treasury: str
    escrow: str
    deploy_block: int = 0


def parse_cchain_deployment(data: dict[str, Any]) -> CChainDeployment:
    missing = [k for k in ("token", "treasury", "escrow") if not data.get(k)]
    if missing:
        raise ChainReadError(
            f"C-Chain deployments file has no {', '.join(missing)} "
            "(expected {token, treasury, escrow, deployBlock, rpcUrl, wsUrl?}; written by the top-up deploy)"
        )
    return CChainDeployment(
        network=str(data.get("network") or ""),
        chain_id=int(data["chainId"]) if data.get("chainId") is not None else None,
        rpc_url=data.get("rpcUrl") or None,
        ws_url=data.get("wsUrl") or None,
        token=to_checksum_address(data["token"]),
        treasury=to_checksum_address(data["treasury"]),
        escrow=to_checksum_address(data["escrow"]),
        deploy_block=int(data.get("deployBlock") or 0),
    )


def load_cchain_deployment(path: str | Path) -> CChainDeployment:
    p = Path(path)
    if not p.is_absolute():
        p = Path(__file__).resolve().parents[3] / p  # relative paths resolve against Backend/
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ChainReadError(f"cannot read C-Chain deployments file {p}: {exc}") from exc
    return parse_cchain_deployment(data)


def _topic_addr(address: str) -> str:
    return "0x" + "00" * 12 + address[2:].lower()


def log_params(dep: CChainDeployment) -> dict[str, Any]:
    """`eth_getLogs` / `eth_subscribe("logs")` filter: Transfer(treasury -> escrow) on the token."""
    return {
        "address": dep.token,
        "topics": [TRANSFER_TOPIC, _topic_addr(dep.treasury), _topic_addr(dep.escrow)],
    }


class CChainSource:
    """`LogSource` over the C-Chain: Transfer logs treasury -> escrow as `ChainEvent`s."""

    def __init__(self, w3: Web3, dep: CChainDeployment, *, log_chunk: int = 2000) -> None:
        self.w3, self.dep = w3, dep
        self.start_block = dep.deploy_block
        self._chunk = log_chunk

    @classmethod
    def from_settings(cls, settings: Any) -> CChainSource:
        dep = load_cchain_deployment(settings.cchain_deployments_file)
        url = settings.cchain_rpc_url or dep.rpc_url
        if not url:
            raise ChainReadError(
                "no C-Chain RPC url (CCHAIN_RPC_URL or rpcUrl in the deployments file)"
            )
        w3 = make_web3(url)
        if dep.chain_id is not None and w3.eth.chain_id != dep.chain_id:
            raise ChainReadError(
                f"C-Chain RPC chain id {w3.eth.chain_id} != deployments chainId {dep.chain_id}"
            )
        return cls(w3, dep)

    @property
    def ws_url(self) -> str | None:
        return self.dep.ws_url

    def head(self) -> int:
        return int(self.w3.eth.block_number)

    def events_between(self, first: int, last: int) -> list[ChainEvent]:
        out: list[ChainEvent] = []
        ts_cache: dict[int, int] = {}
        flt = log_params(self.dep)
        for lo in range(first, last + 1, self._chunk):
            hi = min(lo + self._chunk - 1, last)
            for lg in self.w3.eth.get_logs({**flt, "fromBlock": lo, "toBlock": hi}):
                block = int(lg["blockNumber"])
                if block not in ts_cache:
                    ts_cache[block] = int(self.w3.eth.get_block(block)["timestamp"])
                out.append(
                    ChainEvent(
                        EVENT_NAME,
                        block,
                        "0x" + HexBytes(lg["transactionHash"]).hex().removeprefix("0x"),
                        int(lg["logIndex"]),
                        {
                            "token": self.dep.token,
                            "from": self.dep.treasury,
                            "to": self.dep.escrow,
                            "amount": int.from_bytes(HexBytes(lg["data"]), "big"),
                        },
                        ts_cache[block],
                        True,  # a simulated top-up: test token, no real value
                    )
                )
        out.sort(key=lambda e: (e.block, e.log_index))
        return out
