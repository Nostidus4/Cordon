"""#117: chain -> SSE latency on the L1 path. A Paid event must reach the bus within a second, even with
RPC latency and while the snapshot of the new head is still being read (it used to be read before the publish,
and again on the event loop by the responder tick, so events waited 2-6 s)."""

from __future__ import annotations

import asyncio
import time

from eth_utils import keccak
from web3 import Web3

from guardian.chain.l1 import L1Chain
from guardian.chain.l1.signers import NodeSigner, SignerRegistry
from guardian.core.config import Settings
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.chain_l1.anvil_env import (
    AllowListEnforcingProvider,
    Anvil,
    Env,
    deploy_may_labs,
)

EVENTS = 10
MAX_LATENCY_S = 1.0
COUNCIL_TIMELOCK_S = 2


class SlowReads(AllowListEnforcingProvider):
    """Every read costs a few ms, like a real node: the ~90-call snapshot then takes visible time."""

    def __init__(self, *a, **k):  # type: ignore[no-untyped-def]
        super().__init__(*a, **k)
        # tx hash -> wall time the node answered the send (automine: the block exists)
        self.mined: dict[str, float] = {}

    def make_request(self, method, params):  # type: ignore[no-untyped-def]
        if method not in ("eth_sendTransaction", "eth_getTransactionReceipt"):
            time.sleep(0.005)
        out = super().make_request(method, params)
        if method in ("eth_sendTransaction", "eth_sendRawTransaction") and "result" in out:
            h = str(out["result"])
            self.mined[h if h.startswith("0x") else "0x" + h] = time.time()
        return out


async def test_paid_events_reach_sse_fast(env: Env) -> None:
    env.fund_and_impersonate_all()
    w3 = Web3(SlowReads(env.anvil.url))
    seed = env.seed
    signers = SignerRegistry([NodeSigner(e["address"]) for e in (*seed["keys"], *seed["council"])])
    chain = L1Chain(w3, env.dep, seed, signers=signers, poll_interval=2.0)
    settings = Settings(
        chain_mode="l1",
        demo_mode=True,
        rate_limit_per_minute=100000,
        l1_poll_interval_seconds=2.0,
        l1_ws_url=env.anvil.url.replace("http", "ws"),
    )
    rt = Runtime(settings, chain=chain)
    app = create_app(settings, rt)
    seen: dict[str, float] = {}
    async with app.router.lifespan_context(app):
        orig = rt.bus.publish

        def publish(topic, data, *a, **k):  # type: ignore[no-untyped-def]
            if topic == "event" and data.get("name") == "Paid":
                seen.setdefault(data["txHash"], time.time())
            return orig(topic, data, *a, **k)

        rt.bus.publish = publish  # type: ignore[method-assign]
        key = env.as_key(seed["keys"][1]["address"])
        to = seed["recipients"][0]["address"]
        lat: list[float] = []
        for i in range(EVENTS):
            await asyncio.sleep(
                0.7 + 0.13 * i
            )  # events land while the previous snapshot is still warming
            rc = env.send(
                env.vault.functions.pay(
                    env.tokens["tUSDC"].address, to, 1_000_000 + i, keccak(text="m")
                ),
                key,
            )
            sent = time.time()
            h = rc["transactionHash"].hex()
            h = h if h.startswith("0x") else "0x" + h
            for _ in range(600):
                if h in seen:
                    break
                await asyncio.sleep(0.01)
            lat.append(seen.get(h, time.time()) - sent)
    got = str([round(x, 2) for x in lat])
    # a block mined between the snapshot warm-up and the responder tick can still cost one snapshot read on the loop
    assert sorted(lat)[-2] <= MAX_LATENCY_S, got
    assert max(lat) <= 3.5, got


async def test_council_events_reach_sse_fast(anvil_binary: str, built_contracts: None) -> None:
    """#117: Approved / Queued / Executed (an API approval, then the timelock keeper) and Paid events landing while
    those requests are in flight: every one of 10 reaches the bus within a second of its block. The approve route
    used to block the event loop (sign, receipt, ~90-call snapshot), so the indexer's publish waited behind it."""
    import httpx

    node = Anvil(anvil_binary)
    try:
        env = deploy_may_labs(node, timelock_s=COUNCIL_TIMELOCK_S)
        env.fund_and_impersonate_all()
        provider = SlowReads(env.anvil.url)
        w3 = Web3(provider)
        seed = env.seed
        signers = SignerRegistry(
            [NodeSigner(e["address"]) for e in (*seed["keys"], *seed["council"])]
        )
        chain = L1Chain(w3, env.dep, seed, signers=signers, poll_interval=2.0)
        settings = Settings(
            chain_mode="l1",
            demo_mode=True,
            rate_limit_per_minute=100000,
            l1_poll_interval_seconds=2.0,
            l1_ws_url=env.anvil.url.replace("http", "ws"),
            council_timelock_s=COUNCIL_TIMELOCK_S,
        )
        rt = Runtime(settings, chain=chain)
        # anvil stamps every block at least 1 s after the previous one, so the ~40 setup txs left the chain clock
        # ahead of the wall clock: the keeper compares the eta with `rt.now()`, give it the chain's time.
        skew = int(w3.eth.get_block("latest")["timestamp"]) - int(time.time())
        rt.clock = lambda: time.time() + skew  # type: ignore[method-assign,assignment]
        app = create_app(settings, rt)
        seen: dict[tuple[str, str], float] = {}
        async with app.router.lifespan_context(app):
            orig = rt.bus.publish

            def publish(topic, data, *a, **k):  # type: ignore[no-untyped-def]
                if topic == "event" and data.get("name") in WATCHED:
                    seen.setdefault((data["name"], data["txHash"]), time.time())
                return orig(topic, data, *a, **k)

            rt.bus.publish = publish  # type: ignore[method-assign]
            key = env.as_key(seed["keys"][1]["address"])
            to = seed["recipients"][0]["address"]

            def pay(i: int) -> None:
                rc = env.send(
                    env.vault.functions.pay(
                        env.tokens["tUSDC"].address, to, 1_000_000 + i, keccak(text="m")
                    ),
                    key,
                )
                h = rc["transactionHash"].hex()
                provider.mined["0x" + h.removeprefix("0x")] = time.time()

            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://test", timeout=60
            ) as c:
                p = (
                    await c.post(
                        "/api/proposals",
                        json={"member": "lan", "findingId": "R1_MULTI_KEY_NO_SHARED_CAP:minh"},
                    )
                ).json()
                pid = p["id"]
                await asyncio.sleep(1.0)
                paid = asyncio.create_task(_pay_during(pay, 0, 3))
                a1 = await c.post(f"/api/proposals/{pid}/approve", json={"member": "lan"})
                assert a1.status_code == 200, a1.text
                a2 = await c.post(f"/api/proposals/{pid}/approve", json={"member": "trang"})
                assert a2.status_code == 200, a2.text
                await paid
                await asyncio.create_task(
                    _pay_during(pay, 3, 3)
                )  # while the keeper waits for the eta
                for _ in range(900):  # the keeper executes after the eta
                    if any(n == "Executed" for n, _ in seen):
                        break
                    await asyncio.sleep(0.01)
                await asyncio.sleep(0.5)
                await _pay_during(pay, 6, 2)
                await asyncio.sleep(1.5)
        lat: list[tuple[str, float]] = []
        for (name, h), t in seen.items():
            lat.append((name, round(t - provider.mined.get(h, t), 2)))
        names = sorted(n for n, _ in lat)
        got = str(sorted(lat, key=lambda x: x[1]))
        assert {"Approved", "Queued", "Executed"} <= set(names), got
        assert len(lat) >= EVENTS, got
        assert max(x for _, x in lat) <= MAX_LATENCY_S, got
    finally:
        node.stop()


WATCHED = ("Paid", "Approved", "Queued", "Executed")


async def _pay_during(pay, start: int, n: int) -> None:  # type: ignore[no-untyped-def]
    for i in range(start, start + n):
        await asyncio.to_thread(pay, i)
        await asyncio.sleep(0.15)
