"""CHN-003 end to end: the API started with CHAIN_MODE=l1 on anvil runs the spec 13.4 flow over HTTP.

policy v2 (propose + 2 approvals) -> agent run-once -> scene 4 steps 1-5 -> lock -> step 7, with the
same numbers as the sim (`tests/test_api.py::test_full_flow`): district spent 5.000 / 15.000 / 25.000,
attacker total 20.000, step 7 `blocked_at_protocol` without a hash. The chain is the real contracts on
anvil; the node's Tx AllowList rejection is emulated by `AllowListEnforcingProvider`.

`POST /api/demo/reset` on L1 (OPS-003) reloads the deployment the deployments file holds (a fresh set that
`make demo-reset` deployed); `test_reset_on_l1_reloads_the_new_deployment` stands in for the script by deploying a
second set on the same node and pointing the runtime at it.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from web3 import Web3

from guardian.chain.l1 import L1Chain
from guardian.chain.l1.signers import NodeSigner, SignerRegistry
from guardian.core.config import Settings
from guardian.core.demo_guard import DemoModeError
from guardian.main import create_app
from guardian.services.runtime import Runtime
from guardian.shared.scenario4 import SCENARIO4_STEPS
from tests.chain_l1.anvil_env import AllowListEnforcingProvider, Env, deploy_may_labs
from tests.conftest import collect_sse

R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh"


def disp(m: dict[str, str]) -> str:
    return m["display"]


async def post(
    c: httpx.AsyncClient, url: str, body: dict[str, Any] | None = None, ok: int = 200
) -> Any:
    r = await c.post(url, json=body)
    assert r.status_code == ok, r.text
    return r.json()


def l1_settings(**kw: Any) -> Settings:
    base: dict[str, Any] = {
        "chain_mode": "l1",
        "demo_mode": True,
        "rate_limit_per_minute": 100_000,
        "scenario_delay_seconds": 0.0,
        "l1_poll_interval_seconds": 0.05,
    }
    return Settings(**{**base, **kw})


@pytest_asyncio.fixture
async def l1_app(env: Env, l1: L1Chain) -> AsyncIterator[FastAPI]:
    """The real app, `CHAIN_MODE=l1`, on the seeded anvil (node-held signers stand in for test keys)."""
    settings = l1_settings()
    rt = Runtime(settings, chain=l1)
    app = create_app(settings, rt)
    async with app.router.lifespan_context(app):
        yield app


@pytest_asyncio.fixture
async def c(l1_app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=l1_app), base_url="http://test"
    ) as client:
        yield client


async def test_health_reports_a_real_chain(c: httpx.AsyncClient, l1_app: FastAPI) -> None:
    h = (await c.get("/api/health")).json()
    assert h["chainMode"] == "l1" and h["simulated"] is False and h["demoMode"] is True
    assert h["policyVersion"] == 1 and h["l1Block"] > 0 and h["indexerLagBlocks"] <= 1
    org = (await c.get("/api/org")).json()
    assert org["vault"]["address"] == l1_app.state.runtime.chain.dep.vault
    assert disp(org["vault"]["balance"]) == "200.000"


async def test_reset_on_l1_reloads_the_new_deployment(
    c: httpx.AsyncClient, l1_app: FastAPI, env: Env, monkeypatch: pytest.MonkeyPatch
) -> None:
    rt = l1_app.state.runtime
    # dirty the first deployment: policy v2 executed, one attempt recorded
    p = await post(c, "/api/proposals", {"member": "lan", "findingId": R1_MINH}, ok=201)
    await post(c, f"/api/proposals/{p['id']}/approve", {"member": "lan"})
    await post(c, f"/api/proposals/{p['id']}/approve", {"member": "trang"})
    assert (await c.get("/api/graph")).json()["policyVersion"] == 2
    await post(
        c,
        "/api/attempts",
        {"signer": "key_minh", "action": "pay", "outcome": "reverted"},
        ok=201,
    )
    old_vault = rt.chain.dep.vault
    events_before = len(rt.event_log)
    assert events_before > 0 and rt.stores.attempts

    # what `make demo-reset` does: a fresh set on the same node (a baseline of 1: nothing bumped it)
    env2 = deploy_may_labs(env.anvil)
    env2.fund_and_impersonate_all()
    w3 = Web3(AllowListEnforcingProvider(env.anvil.url))
    signers = SignerRegistry(
        [NodeSigner(e["address"]) for e in (*env2.seed["keys"], *env2.seed["council"])]
    )
    monkeypatch.setattr(
        "guardian.chain.l1.startup.build_l1_chain",
        lambda settings: L1Chain(w3, env2.dep, env2.seed, signers=signers),
    )
    r = await post(c, "/api/demo/reset")
    assert r["status"] == "ok" and r["policyVersion"] == 1 and r["policyLabel"] == 1

    assert rt.chain.dep.vault == env2.dep.vault != old_vault
    g = (await c.get("/api/graph")).json()
    assert g["policyVersion"] == 1 and g["policyLabel"] == 1 and len(g["districts"]) == 7
    assert all(d["spentToday"]["raw"] == "0" and not d["locked"] for d in g["districts"])
    assert (await c.get("/api/attempts")).json() == []
    assert len(rt.event_log) >= events_before  # events of the old deployment are kept
    proposals = (await c.get("/api/proposals")).json()
    assert [x["id"] for x in proposals] == [r["seededProposalId"]]
    assert proposals[0]["reportBasis"] == "policy_v2_reference"
    # a second reset right after the first also works
    again = await post(c, "/api/demo/reset")
    assert again["status"] == "ok"


async def test_full_flow_on_l1_matches_the_sim_numbers(
    c: httpx.AsyncClient, l1_app: FastAPI, env: Env
) -> None:
    # --- scene 1-2: map and simulate read the L1 snapshot
    g = (await c.get("/api/graph")).json()
    assert g["policyVersion"] == 1 and len(g["districts"]) == 7
    t = (await post(c, "/api/simulate", {"compromised": ["minh"]}))["totals"]
    assert [disp(t[k]) for k in ("youThink", "enforced", "estimated")] == [
        "20.000",
        "20.000",
        "100.000",
    ]

    # --- scene 3: policy v2 through the Council (propose by Lan, Lan + Trang approve)
    d = await post(c, "/api/proposals/draft", {"findingId": R1_MINH})
    assert d["sent"] is False and d["riskReportHash"].startswith("0x")
    p = await post(c, "/api/proposals", {"member": "lan", "findingId": R1_MINH}, 201)
    assert p["status"] == "open" and p["id"] == 1  # first proposal of this deployment
    p = await post(c, f"/api/proposals/{p['id']}/approve", {"member": "lan"})
    assert p["status"] == "open" and p["approvals"] == ["lan"]
    p = await post(c, f"/api/proposals/{p['id']}/approve", {"member": "trang"})
    assert p["status"] == "executed" and p["executedTxHash"]
    g = (await c.get("/api/graph")).json()
    assert g["policyVersion"] == 2
    dist = next(x for x in g["districts"] if x["principalId"] == "minh")
    assert len(dist["keys"]) == 5 and disp(dist["dailyCap"]) == "30.000"

    # --- scene 4: the morning agent, attacker 1-5, lock, step 7
    a = await post(c, "/api/agent/run-once")
    assert a["outcome"] == "swapped" and disp(a["decision"]["amountIn"]) == "5.000" and a["txHash"]
    assert disp((await c.get("/api/districts/minh")).json()["spentToday"]) == "5.000"

    run = await post(c, "/api/scenario/scene4/run?delay=0&wait=true")
    assert run["status"] == "waiting_lock"
    steps = {x["step"]: x for x in run["attempts"]}
    assert sorted(steps) == [0, 1, 2, 3, 4, 5]
    for s in SCENARIO4_STEPS[1:6]:
        got = steps[s.step]
        assert got["outcome"] == s.expected_outcome, s.step
        assert got["reasonCode"] == s.expected_reason, s.step
        assert got["simulated"] is False and got["txHash"], s.step  # on-chain, hash present
    assert [steps[i]["reasonCode"] for i in (1, 2, 5)] == [
        "RECIPIENT_NOT_ALLOWED",
        "PROTOCOL_NOT_ALLOWED",
        "DISTRICT_DAILY_CAP",
    ]
    assert [disp(steps[i]["principalSpentAfter"]) for i in range(1, 6)] == [
        "5.000",
        "5.000",
        "15.000",
        "25.000",
        "25.000",
    ]
    assert disp((await c.get("/api/districts/minh")).json()["spentToday"]) == "25.000"
    attacker = sum(
        int(steps[i]["amount"]["raw"]) for i in range(1, 6) if steps[i]["outcome"] == "ok"
    )
    assert attacker == 20_000_000_000  # 20.000 got out, not 5 x 20.000 = 100.000

    lock = await post(c, "/api/actions/lock", {"member": "lan", "principalId": "minh"})
    assert lock["status"] == "ok" and lock["txHash"] and lock["simulated"] is False
    dist = (await c.get("/api/districts/minh")).json()
    assert dist["locked"] and all(not k["allowListed"] for k in dist["keys"])
    assert disp(dist["spentToday"]) == "25.000"  # nothing moved by the lock

    run = await post(c, "/api/scenario/scene4/run", {"step": 7}, 200)
    s7 = next(x for x in run["attempts"] if x["step"] == 7)
    assert run["status"] == "completed"
    assert s7["outcome"] == "blocked_at_protocol" and s7["txHash"] is None
    assert s7["reasonCode"] == "BLOCKED_AT_PROTOCOL" and s7["badge"] == "rejected_by_chain"
    assert any(x["step"] == 6 and x["action"] == "lock" and x["txHash"] for x in run["attempts"])
    runs = (await c.get("/api/scenario/runs")).json()
    assert len(runs) == 1 and len(runs[0]["attempts"]) == 8  # replay feed: steps 0..7

    # the event feed comes from the chain (indexer): Paid / Swapped / PrincipalLocked...
    rt: Runtime = l1_app.state.runtime
    assert rt.indexer is not None
    await asyncio.sleep(0.3)  # one indexer cycle (poll 50 ms)
    ev = (await c.get("/api/events?since=0")).json()
    names = [e["name"] for e in ev]
    assert names.count("Swapped") == 1 and names.count("Paid") == 2
    assert "PrincipalLocked" in names and "Executed" in names
    assert all(e["simulated"] is False for e in ev)
    assert (await c.get("/api/health")).json()["simulated"] is False

    # --- scene 5: conflict of interest on a real Council
    key = next(k["address"] for k in dist["keys"] if k["seedId"] == "key_agent_rebalance")
    move = {"kind": "move_key", "key": key, "to": "huy"}
    mp = await post(c, "/api/proposals", {"member": "lan", "change": move}, 201)
    assert mp["subjectPrincipal"] == "huy"
    huy = next(m for m in mp["members"] if m["id"] == "huy")
    assert huy["conflicted"] and not huy["canApprove"]
    r = await c.post(f"/api/proposals/{mp['id']}/approve", json={"member": "huy"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "CONFLICT_OF_INTEREST"
    mp2 = next(x for x in (await c.get("/api/proposals")).json() if x["id"] == mp["id"])
    assert mp2["status"] == "open" and mp2["approvals"] == []


async def test_sse_streams_chain_events_from_the_indexer(
    c: httpx.AsyncClient, l1_app: FastAPI
) -> None:
    async def trigger() -> None:
        await post(c, "/api/actions/pause", {"member": "huy"})

    got = await collect_sse(l1_app, trigger, {"event", "graph_updated"}, timeout=10.0)
    assert any('"Paused"' in d for d in got["event"])
    assert got["graph_updated"]


# -------------------------------------------------------------- startup errors
async def test_missing_deployments_file_is_a_clear_startup_error() -> None:
    from guardian.chain.l1.startup import L1StartupError

    with pytest.raises(L1StartupError, match="deployments file not found.*DEPLOYMENTS_FILE"):
        Runtime(l1_settings(deployments_file="/nonexistent/fuji-l1.json"))


async def test_deployments_without_contracts_is_a_clear_startup_error(
    tmp_path: Any,
) -> None:
    from guardian.chain.l1.startup import L1StartupError

    f = tmp_path / "empty.json"
    f.write_text("{}")
    with pytest.raises(L1StartupError, match="no address for registry, vault"):
        Runtime(l1_settings(deployments_file=str(f)))


async def test_unreachable_node_is_a_clear_startup_error(env: Env, tmp_path: Any) -> None:
    import json

    from guardian.chain.l1.startup import L1StartupError

    dep = env.dep
    f = tmp_path / "dep.json"
    f.write_text(
        json.dumps({"contracts": {"registry": dep.registry, "vault": dep.vault}, "chainId": 31337})
    )
    with pytest.raises(L1StartupError, match="L1_RPC_URL") as e:
        Runtime(l1_settings(deployments_file=str(f), l1_rpc_url="http://127.0.0.1:1"))
    assert "127.0.0.1" not in str(e.value)  # the URL never lands in a message


async def test_demo_mode_without_signer_keys_names_the_missing_variables(
    env: Env, tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import json

    from guardian.chain.l1.startup import L1StartupError

    for k in list(__import__("os").environ):
        if k.startswith("L1_KEY_"):
            monkeypatch.delenv(k)
    monkeypatch.chdir(tmp_path)  # no .env here
    dep = env.dep
    f = tmp_path / "dep.json"
    f.write_text(
        json.dumps(
            {
                "contracts": {"registry": dep.registry, "vault": dep.vault, "council": dep.council},
                "chainId": 31337,
            }
        )
    )
    with pytest.raises(L1StartupError) as e:
        Runtime(l1_settings(deployments_file=str(f), l1_rpc_url=env.anvil.url))
    msg = str(e.value)
    assert (
        "L1_KEY_KEY_MINH" in msg
        and "L1_KEY_COUNCIL_LAN" in msg
        and "L1_KEY_KEY_AGENT_REBALANCE" in msg
    )
    # without DEMO_MODE the same config starts (read-only API)
    rt = Runtime(l1_settings(deployments_file=str(f), l1_rpc_url=env.anvil.url, demo_mode=False))
    assert rt.snapshot().policy_version == 1
    await rt.shutdown()


async def test_demo_mode_is_refused_on_a_chain_that_is_not_a_test_chain(
    l1: L1Chain,
) -> None:
    with pytest.raises(DemoModeError, match="chain id 31337 is not a test chain"):
        Runtime(l1_settings(demo_chain_ids=[424242]), chain=l1)
    rt = Runtime(l1_settings(demo_mode=False, demo_chain_ids=[424242]), chain=l1)  # read-only: fine
    await rt.shutdown()


async def test_bad_signer_key_is_rejected_without_echoing_it(
    env: Env, monkeypatch: pytest.MonkeyPatch, tmp_path: Any
) -> None:
    import json

    from eth_account import Account

    from guardian.chain.l1.startup import L1StartupError

    wrong = Account.create().key.hex()
    monkeypatch.setenv("L1_KEY_KEY_MINH", wrong)
    monkeypatch.chdir(tmp_path)
    dep = env.dep
    f = tmp_path / "dep.json"
    f.write_text(
        json.dumps({"contracts": {"registry": dep.registry, "vault": dep.vault}, "chainId": 31337})
    )
    with pytest.raises(L1StartupError, match="L1_KEY_KEY_MINH derives") as e:
        Runtime(l1_settings(deployments_file=str(f), l1_rpc_url=env.anvil.url))
    assert wrong.removeprefix("0x") not in str(e.value)
