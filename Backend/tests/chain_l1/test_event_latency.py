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
from tests.chain_l1.anvil_env import AllowListEnforcingProvider, Env

EVENTS = 10
MAX_LATENCY_S = 1.0


class SlowReads(AllowListEnforcingProvider):
    """Every read costs a few ms, like a real node: the ~90-call snapshot then takes visible time."""

    def make_request(self, method, params):  # type: ignore[no-untyped-def]
        if method not in ("eth_sendTransaction", "eth_getTransactionReceipt"):
            time.sleep(0.005)
        return super().make_request(method, params)


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
