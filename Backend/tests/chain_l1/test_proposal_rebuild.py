"""Rebuild of the proposal store from the Council (l1, no Postgres): decoding with fakes + anvil restart."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest_asyncio
from eth_utils import to_checksum_address
from fastapi import FastAPI
from web3 import Web3

from guardian.chain.contracts import bind
from guardian.chain.l1 import L1Chain
from guardian.chain.l1.calls import CallDecoder, CallEncoder
from guardian.chain.l1.signers import NodeSigner, SignerRegistry
from guardian.chain.precompiles import tx_allowlist
from guardian.main import create_app
from guardian.services.proposal_rebuild import infer_change
from guardian.services.runtime import Runtime
from tests.chain_l1.anvil_env import AllowListEnforcingProvider, Env
from tests.chain_l1.test_api_l1_anvil import R1_MINH, l1_settings, post

W3 = Web3()
A = {
    n: to_checksum_address("0x" + c * 20)
    for n, c in (("reg", "11"), ("vault", "22"), ("other", "77"))
}
KEY = to_checksum_address("0xFBF0927D8fF0845912002Bf65B2fAC64f0Eb5eC1")


def _codec() -> tuple[CallEncoder, CallDecoder]:
    c = bind(W3, A["reg"], A["vault"], None)
    ta = tx_allowlist(W3)
    enc = CallEncoder(c.registry, c.vault, ta, lambda r: to_checksum_address(r), lambda _a: None)
    return enc, CallDecoder(c.registry, c.vault, ta)


def test_decoder_inverts_the_encoder_into_the_graph_vocabulary() -> None:
    enc, dec = _codec()
    calls = [
        {"target": "registry", "fn": "moveKey", "args": {"key": KEY, "toId": "minh"}},
        {"target": "registry", "fn": "createPrincipal", "args": {"id": "ops", "label": "Ops"}},
        {
            "target": "vault",
            "fn": "setPrincipalDailyCap",
            "args": {"principalId": "minh", "cap": "130000"},
        },
        {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": KEY, "cap": "5"}},
        {"target": "vault", "fn": "unlockPrincipal", "args": {"principalId": "lan"}},
        {"target": "vault", "fn": "unpauseAll", "args": {}},
        {"target": "tx_allowlist", "fn": "setNone", "args": {"address": KEY}},
    ]
    assert dec.decode(enc.encode(calls)) == calls


def test_undecodable_calls_stay_raw() -> None:
    _, dec = _codec()
    out = dec.decode([(A["other"], b"\x12\x34\x56\x78\x00"), (A["vault"], b"\xde\xad\xbe\xef")])
    assert out[0] == {"target": A["other"], "fn": "0x12345678", "args": {"data": "0x1234567800"}}
    assert out[1]["target"] == A["vault"] and out[1]["fn"] == "0xdeadbeef"
    assert out[1]["args"] == {"data": "0xdeadbeef"}


def test_infer_change_matches_to_calls_shapes() -> None:
    bump = {"target": "vault", "fn": "bumpPolicyVersion", "args": {}}
    mv = {"target": "registry", "fn": "moveKey", "args": {"key": KEY, "toId": "huy"}}
    cap = {
        "target": "vault",
        "fn": "setPrincipalDailyCap",
        "args": {"principalId": "minh", "cap": "7"},
    }
    assert infer_change([mv, bump]) == {"kind": "move_key", "key": KEY, "to": "huy"}
    assert infer_change([cap, bump]) == {
        "kind": "set_district_cap",
        "principal_id": "minh",
        "cap": 7,
    }
    merged = infer_change([{**mv, "args": {"key": KEY, "toId": "minh"}}, cap, bump])
    assert merged == {"kind": "merge_district", "into": "minh", "keys": [KEY], "district_cap": 7}
    assert infer_change([{"target": "vault", "fn": "unpauseAll", "args": {}}, bump]) is None
    assert infer_change([mv, cap, bump]) is None  # keys moved to another district than the cap's


# ------------------------------------------------------------------ anvil
def _fresh_chain(env: Env, old: L1Chain) -> L1Chain:
    w3 = Web3(AllowListEnforcingProvider(env.anvil.url))
    signers = SignerRegistry(
        [NodeSigner(e["address"]) for e in (*env.seed["keys"], *env.seed["council"])]
    )
    return L1Chain(w3, env.dep, env.seed, signers=signers)


@pytest_asyncio.fixture
async def before_after(
    env: Env, l1: Any
) -> AsyncIterator[tuple[httpx.AsyncClient, httpx.AsyncClient, FastAPI]]:
    env.fund_and_impersonate_all()
    s = l1_settings()
    app1 = create_app(s, Runtime(s, chain=l1._chain))
    async with (
        app1.router.lifespan_context(app1),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app1), base_url="http://t") as c1,
    ):
        p = await post(c1, "/api/proposals", {"member": "lan", "findingId": R1_MINH}, 201)
        await post(c1, f"/api/proposals/{p['id']}/approve", {"member": "lan"})
        await post(
            c1,
            "/api/proposals",
            {
                "member": "trang",
                "change": {
                    "kind": "move_key",
                    "key": app1.state.runtime.key_by_seed("key_agent_rebalance").address,
                    "to": "huy",
                },
            },
            201,
        )
        await post(
            c1,
            "/api/proposals",
            {
                "member": "trang",
                "change": {
                    "kind": "set_district_cap",
                    "principalId": "minh",
                    "cap": 40_000_000,
                },
            },
            201,
        )
        await post(c1, "/api/proposals/3/approve", {"member": "lan"})
        await post(c1, "/api/proposals/3/approve", {"member": "trang"})  # executes (or queues)
        first = (await c1.get("/api/proposals")).json()
        # "restart": a new Runtime on the same chain with empty stores
        rt2 = Runtime(s, chain=_fresh_chain(env, l1._chain))
        app2 = create_app(s, rt2)
        async with (
            app2.router.lifespan_context(app2),
            httpx.AsyncClient(transport=httpx.ASGITransport(app=app2), base_url="http://t") as c2,
        ):
            c1.first = first  # type: ignore[attr-defined]
            yield c1, c2, app2


async def test_restart_rebuilds_the_same_proposals(before_after: Any) -> None:
    c1, c2, app2 = before_after
    first = c1.first
    second = (await c2.get("/api/proposals")).json()
    assert [p["id"] for p in second] == [p["id"] for p in first] == [3, 2, 1]
    for a, b in zip(first, second, strict=True):
        for k in (
            "id",
            "title",
            "status",
            "approvals",
            "approvalCount",
            "queued",
            "eta",
            "subjectPrincipal",
            "proposer",
            "riskReportHash",
            "vetoedBy",
            "calls",
            "descriptionVi",
        ):
            assert a[k] == b[k], (a["id"], k)
        assert b["reportBasis"] == "rebuilt_from_chain"
    by_id = {p["id"]: p for p in second}
    assert by_id[2]["change"] == {"kind": "move_key", "key": by_id[2]["change"]["key"], "to": "huy"}
    assert by_id[1]["approvals"] == ["lan"] and by_id[1]["status"] == "open"
    # approving still works after the rebuild (trang is the second vote)
    out = await post(c2, "/api/proposals/1/approve", {"member": "trang"})
    assert out["approvalCount"] == 2 and out["approvals"] == ["lan", "trang"]
    assert len(app2.state.runtime.stores.proposals.all()) == 3  # no duplicates
