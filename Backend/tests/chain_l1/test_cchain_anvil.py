"""IDX-002 on two local anvils ("C-Chain" with a plain ERC-20, and the seeded "L1").

C-Chain source: Transfer(treasury -> escrow) stored once, restart without duplicates, `last_block_c` advances
and shows in /api/health. Correlation: the L1 `TopUpRecorded(cChainTxHash)` with the same hash links both sides in
/api/topups. Websocket: the socket is cut mid-stream and the indexer falls back to polling without loss or
duplicates (the TCP proxy in front of anvil's ws port plays the network).
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from guardian.chain.cchain import CChainSource, load_cchain_deployment, log_params
from guardian.chain.l1 import L1Chain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from guardian.workers.indexer import Indexer, InMemoryEventSink
from guardian.workers.ws_source import LogWatcher
from tests.chain_l1.anvil_env import Anvil, Env, artifact, free_port
from tests.chain_l1.test_api_l1_anvil import l1_settings


@dataclass
class CChain:
    anvil: Anvil
    token: Any
    treasury: str
    escrow: str
    other: str
    deploy_block: int
    file: Path

    def transfer(self, to: str, amount: int, sender: str | None = None) -> str:
        """Send tokens; returns the tx hash (0x hex, lowercase)."""
        h = self.token.functions.transfer(to, amount).transact({"from": sender or self.treasury})
        rc = self.anvil.w3.eth.wait_for_transaction_receipt(h)
        assert rc["status"] == 1
        return "0x" + bytes(rc["transactionHash"]).hex()

    def source(self) -> CChainSource:
        return CChainSource(self.anvil.w3, load_cchain_deployment(self.file))

    def write_file(self, **extra: Any) -> None:
        w3 = self.anvil.w3
        doc = {
            "network": "local-c",
            "chainId": w3.eth.chain_id,
            "rpcUrl": self.anvil.url,
            "wsUrl": None,
            "token": self.token.address,
            "treasury": self.treasury,
            "escrow": self.escrow,
            "owners": [self.treasury],
            "threshold": 3,
            "deployBlock": self.deploy_block,
            **extra,
        }
        self.file.write_text(json.dumps(doc), encoding="utf-8")


@pytest.fixture
def cchain(anvil_binary: str, built_contracts: None, tmp_path: Path) -> Iterator[CChain]:
    node = Anvil(anvil_binary)
    try:
        w3 = node.w3
        deployer, treasury, escrow, other = (w3.eth.accounts[i] for i in range(4))
        art = artifact("TestUSDC", "TestUSDC")
        factory = w3.eth.contract(abi=art["abi"], bytecode=art["bytecode"]["object"])
        rc = w3.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": deployer}))
        token = w3.eth.contract(address=rc["contractAddress"], abi=art["abi"])
        for who in (treasury, other):
            w3.eth.wait_for_transaction_receipt(
                token.functions.mint(who, 1_000_000_000).transact({"from": deployer})
            )
        c = CChain(
            node, token, treasury, escrow, other, int(rc["blockNumber"]), tmp_path / "local-c.json"
        )
        c.write_file()
        yield c
    finally:
        node.stop()


def wait_for(cond: Callable[[], bool], timeout: float = 10.0) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(0.02)
    return cond()


# --------------------------------------------------------------------------- C-Chain source
def test_transfer_is_indexed_once_and_survives_restart(cchain: CChain) -> None:
    sink = InMemoryEventSink()
    idx = Indexer(cchain.source(), sink, label="c")
    h1 = cchain.transfer(cchain.escrow, 30_000_000)
    cchain.transfer(cchain.other, 5_000_000)  # not to the escrow: ignored
    cchain.transfer(cchain.escrow, 1_000_000, sender=cchain.other)  # not from the treasury: ignored
    h2 = cchain.transfer(cchain.escrow, 12_000_000)
    idx.sync_once()

    rows = sink.all()
    assert [(e.name, e.tx_hash, e.payload["amount"]) for e in rows] == [
        ("CChainTransfer", h1, 30_000_000),
        ("CChainTransfer", h2, 12_000_000),
    ]
    assert rows[0].payload["from"] == cchain.treasury and rows[0].payload["to"] == cchain.escrow
    assert all(e.simulated for e in rows)
    head = cchain.anvil.w3.eth.block_number
    assert sink.last_block() == head
    st = idx.status()
    assert (st.last_block_c, st.head_c, st.last_block_l1) == (head, head, None)

    # "restart": a new indexer on the same store adds nothing and the cursor is kept
    before = [(e.tx_hash, e.log_index) for e in rows]
    again = Indexer(cchain.source(), sink, label="c")
    assert again.sync_once() == []
    assert [(e.tx_hash, e.log_index) for e in sink.all()] == before

    # a new transfer after the restart is picked up, last_block_c advances
    h3 = cchain.transfer(cchain.escrow, 1)
    assert [e.tx_hash for e in again.sync_once()] == [h3]
    assert sink.last_block() == head + 1 and len(sink) == 3

    # an empty store rebuilds the identical list from the deployment block
    rebuilt = InMemoryEventSink()
    Indexer(cchain.source(), rebuilt, label="c").sync_once()
    assert [(e.tx_hash, e.log_index, e.payload) for e in rebuilt.all()] == [
        (e.tx_hash, e.log_index, e.payload) for e in sink.all()
    ]


def test_deployment_file_must_name_token_treasury_escrow(tmp_path: Path) -> None:
    from guardian.chain.client import ChainReadError

    p = tmp_path / "c.json"
    p.write_text("{}")
    with pytest.raises(ChainReadError, match="token, treasury, escrow"):
        load_cchain_deployment(p)


# --------------------------------------------------------------------------- API: health + correlation
def _hash32(tx_hash: str) -> bytes:
    return bytes.fromhex(tx_hash.removeprefix("0x"))


@pytest_asyncio.fixture
async def topup_app(env: Env, cchain: CChain) -> AsyncIterator[tuple[FastAPI, httpx.AsyncClient]]:
    env.fund_and_impersonate_all()
    from web3 import Web3

    from guardian.chain.l1.signers import NodeSigner, SignerRegistry
    from tests.chain_l1.anvil_env import AllowListEnforcingProvider

    w3 = Web3(AllowListEnforcingProvider(env.anvil.url))
    signers = SignerRegistry(
        [NodeSigner(e["address"]) for e in (*env.seed["keys"], *env.seed["council"])]
    )
    chain = L1Chain(w3, env.dep, env.seed, signers=signers)
    settings = l1_settings(cchain_deployments_file=str(cchain.file))
    rt = Runtime(settings, chain=chain)
    app = create_app(settings, rt)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        yield app, client
    chain.close()


async def test_health_reports_last_block_c_and_topups_link_on_the_tx_hash(
    topup_app: tuple[FastAPI, httpx.AsyncClient], env: Env, cchain: CChain
) -> None:
    app, c = topup_app
    rt: Runtime = app.state.runtime
    h = (await c.get("/api/health")).json()
    assert (
        h["lastBlockC"] == cchain.anvil.w3.eth.block_number and h["cChainBlock"] == h["lastBlockC"]
    )
    assert (await c.get("/api/topups")).json() == []

    tx = cchain.transfer(cchain.escrow, 30_000_000)
    c_block = cchain.anvil.w3.eth.block_number
    assert wait_for(lambda: rt.c_sink.last_block() == c_block)
    h = (await c.get("/api/health")).json()
    assert h["lastBlockC"] == c_block and h["cChainBlock"] == c_block
    only_c = (await c.get("/api/topups")).json()
    assert only_c == [
        {
            "cChainTxHash": tx,
            "amount": {"raw": "30000000", "display": "30"},
            "cChainBlock": c_block,
            "l1TxHash": None,
            "l1Block": None,
            "linked": False,
            "simulated": True,
        }
    ]

    # the L1 vault records the same hash (what the OPS-002 script does after the transfer)
    env.council_call(env.vault, "recordTopUp", _hash32(tx), 30_000_000)
    assert wait_for(lambda: any(e.name == "TopUpRecorded" for e in rt.indexer.sink.all()))
    (row,) = (await c.get("/api/topups")).json()
    l1 = next(e for e in rt.indexer.sink.all() if e.name == "TopUpRecorded")
    assert row["linked"] is True and row["cChainTxHash"] == tx
    assert (row["l1TxHash"], row["l1Block"], row["cChainBlock"]) == (l1.tx_hash, l1.block, c_block)
    assert row["amount"]["raw"] == "30000000" and row["simulated"] is True

    # an L1 record without a matching C-Chain transfer is listed unlinked, no duplicate of the linked one
    env.council_call(env.vault, "recordTopUp", b"\x11" * 32, 7_000_000)
    assert wait_for(lambda: sum(e.name == "TopUpRecorded" for e in rt.indexer.sink.all()) == 2)
    rows = (await c.get("/api/topups")).json()
    assert [r["linked"] for r in rows] == [False, True]
    assert rows[0]["cChainTxHash"] == "0x" + "11" * 32 and rows[0]["cChainBlock"] is None


async def test_cchain_off_by_default(env: Env) -> None:
    """No CCHAIN_DEPLOYMENTS_FILE: no C-Chain indexer, health and topups answer as before."""
    env.fund_and_impersonate_all()
    chain = L1Chain(env.w3, env.dep, env.seed)
    settings = l1_settings()
    rt = Runtime(settings, chain=chain)
    app = create_app(settings, rt)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c,
    ):
        h = (await c.get("/api/health")).json()
        assert rt.c_indexer is None
        assert h["lastBlockC"] is None and h["cChainBlock"] is None
        assert (await c.get("/api/topups")).json() == []


# --------------------------------------------------------------------------- websocket
class TcpProxy:
    """Plain TCP forwarder in front of anvil, so a test can cut (and later restore) the websocket."""

    def __init__(self, target_port: int) -> None:
        self.port = free_port()
        self._target = target_port
        self._loop = asyncio.new_event_loop()
        self._server: asyncio.Server | None = None
        self._writers: set[asyncio.StreamWriter] = set()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._thread.start()
        self.listen()

    def _call(self, coro: Any) -> Any:
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(10)

    def listen(self) -> None:
        async def start() -> None:
            self._server = await asyncio.start_server(self._handle, "127.0.0.1", self.port)

        self._call(start())

    def kill(self) -> None:
        """Stop accepting and drop every open connection."""

        async def stop() -> None:
            assert self._server is not None
            self._server.close()
            for w in list(self._writers):
                w.close()
            self._writers.clear()

        self._call(stop())

    async def _handle(self, r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        try:
            ur, uw = await asyncio.open_connection("127.0.0.1", self._target)
        except OSError:
            w.close()
            return
        self._writers.update((w, uw))

        async def pipe(src: asyncio.StreamReader, dst: asyncio.StreamWriter) -> None:
            try:
                while data := await src.read(65536):
                    dst.write(data)
                    await dst.drain()
            except (ConnectionError, OSError):
                pass
            finally:
                dst.close()

        await asyncio.gather(pipe(r, uw), pipe(ur, w))

    def close(self) -> None:
        self.kill()
        self._loop.call_soon_threadsafe(self._loop.stop)


def test_websocket_wakes_the_indexer_and_a_cut_falls_back_to_polling(cchain: CChain) -> None:
    proxy = TcpProxy(cchain.anvil.port)
    src = cchain.source()
    watcher = LogWatcher(
        f"ws://127.0.0.1:{proxy.port}", log_params(src.dep), retry_initial=0.1, retry_max=0.3
    )
    sink = InMemoryEventSink()
    # slow polling while the socket is up (60 s): only the websocket can make events show up quickly
    idx = Indexer(src, sink, label="c", poll_interval=0.2, ws_idle_interval=60.0, watcher=watcher)
    idx.sync_once()
    idx.start()
    try:
        assert wait_for(lambda: watcher.connected, 5)
        assert idx.status().ws_connected is True
        sent = [cchain.transfer(cchain.escrow, 1_000_000)]
        assert wait_for(lambda: len(sink) == 1, 3), "ws push did not wake the indexer"

        proxy.kill()  # the connection dies mid-stream
        assert wait_for(lambda: not watcher.connected, 5)
        assert idx.status().ws_connected is False
        sent += [
            cchain.transfer(cchain.escrow, 2_000_000),
            cchain.transfer(cchain.escrow, 3_000_000),
        ]
        assert wait_for(lambda: len(sink) == 3, 5), "polling fallback lost events"

        proxy.listen()  # the network is back: the watcher reconnects on its own
        assert wait_for(lambda: watcher.connected, 5)
        sent.append(cchain.transfer(cchain.escrow, 4_000_000))
        assert wait_for(lambda: len(sink) == 4, 3)
        time.sleep(0.5)  # let a few more cycles run: still no duplicates
    finally:
        idx.stop()
        proxy.close()
    assert [e.tx_hash for e in sink.all()] == sent
    assert watcher.connects >= 2
    reference = InMemoryEventSink()
    Indexer(cchain.source(), reference, label="c").sync_once()
    assert [(e.tx_hash, e.log_index, e.payload) for e in sink.all()] == [
        (e.tx_hash, e.log_index, e.payload) for e in reference.all()
    ]


def test_l1_websocket_wakes_the_l1_indexer(env: Env) -> None:
    """`eth_subscribe("logs")` on the L1 (all four contracts): a recordTopUp reaches the sink within seconds
    although the poll interval is a minute."""
    from guardian.workers.indexer import L1ChainSource

    source = L1ChainSource(L1Chain(env.w3, env.dep, env.seed))
    watcher = LogWatcher(env.anvil.url.replace("http", "ws"), source.log_params())
    sink = InMemoryEventSink()
    idx = Indexer(source, sink, poll_interval=60.0, ws_idle_interval=60.0, watcher=watcher)
    idx.sync_once()
    idx.start()
    try:
        assert wait_for(lambda: watcher.connected, 5)
        n = len(sink)
        env.council_call(env.vault, "recordTopUp", b"\x22" * 32, 5)
        assert wait_for(lambda: len(sink) == n + 1, 5)
    finally:
        idx.stop()
    assert [e.name for e in sink.all()][-1] == "TopUpRecorded"
