"""AGT-002: the standalone runner shares run-once's logic and the chain still stops it."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import pytest

from guardian.agent_rebalance import runner
from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from guardian.shared.money import to_base
from tests.conftest import T0, make_settings


@pytest.fixture
def chain(rt: Runtime) -> SimChain:
    assert isinstance(rt.chain, SimChain)
    return rt.chain


def test_first_run_swaps_5000(rt: Runtime) -> None:
    assert rt.chain.balance("vault", "tUSDC") == to_base(200_000)
    assert rt.chain.balance("vault", "tTKB") == 0
    out = runner.run_once(rt, llm_reason=False)
    assert out["outcome"] == "swapped"
    assert out["decision"]["amountIn"]["raw"] == str(to_base(5_000))
    assert out["reasonHash"] and out["reasonText"]
    snap = rt.snapshot()
    ks = rt.key_by_seed(runner.AGENT_SEED, snap)
    assert snap.principals[ks.principal_id].spent_today == to_base(5_000)


def test_blocked_when_cap_used_up_then_day_rollover(rt: Runtime, chain: SimChain) -> None:
    rt.settings.responder_enabled = (
        False  # else the responder locks the district after repeated blocks
    )
    for _ in range(20):
        if runner.run_once(rt, llm_reason=False)["outcome"] != "swapped":
            break
    before = (chain.balance("vault", "tUSDC"), chain.balance("vault", "tTKB"))
    spent = rt.snapshot().principals["agent_rebalance"].spent_today
    out = runner.run_once(rt, llm_reason=False)
    assert out["outcome"] == "blocked" and out["reasonCode"] == "CARD_DAILY_CAP"
    assert out["txHash"] is None
    assert (chain.balance("vault", "tUSDC"), chain.balance("vault", "tTKB")) == before
    assert rt.snapshot().principals["agent_rebalance"].spent_today == spent
    last = rt.stores.attempts[-1]
    assert (last.outcome, last.source, last.reason_code) == ("blocked", "agent", "CARD_DAILY_CAP")
    chain.advance_day(1)
    o2 = runner.run_once(rt, llm_reason=False)
    assert o2["outcome"] == "swapped"


def test_no_action_when_balanced(rt: Runtime, chain: SimChain) -> None:
    chain.ledger.mint(
        chain.vault_addr, chain._addr("tTKB"), 50_000 * 10**18
    )  # tTKB has 18 decimals: ~20% of the vault
    assert runner.run_once(rt, llm_reason=False)["outcome"] == "no_action"


def _strip(o: dict[str, Any]) -> dict[str, Any]:
    o = {k: v for k, v in o.items() if k not in ("id", "ts", "txHash", "attemptId")}
    o["steps"] = [
        {**s, "detail": {k: v for k, v in s["detail"].items() if k != "txHash"}} for s in o["steps"]
    ]
    return o


async def test_same_as_api(client: httpx.AsyncClient) -> None:
    resp = await client.post("/api/agent/run-once")
    assert resp.status_code == 200, resp.text
    settings = make_settings()
    rt2 = Runtime(settings, chain=SimChain(clock=lambda: T0))
    app2 = create_app(settings, rt2)
    async with app2.router.lifespan_context(app2):
        direct = runner.run_once(rt2)
    assert _strip(resp.json()) == _strip(direct)


def _spawn(lock: Path, cycles: int) -> subprocess.Popen[str]:
    env = {**os.environ, "GUARDIAN_AGENT_LOCK": str(lock), "LLM_ENABLED": "false"}
    cmd = [sys.executable, "-m", "guardian.agent_rebalance.main", "--interval-seconds", "0.3"]
    if cycles:
        cmd += ["--cycles", str(cycles)]
    return subprocess.Popen(
        cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )


def test_process_cycles_sigterm_and_single_instance(tmp_path: Path) -> None:
    lock = tmp_path / "agent.lock"
    p = _spawn(lock, 0)
    try:
        lines: list[str] = []
        deadline = time.time() + 30
        assert p.stdout is not None
        while len([x for x in lines if "cycle outcome=" in x]) < 3 and time.time() < deadline:
            line = p.stdout.readline()
            if not line:
                break
            lines.append(line)
        assert len([x for x in lines if "cycle outcome=" in x]) >= 3, lines
        assert "outcome=swapped amount=5.000" in "".join(lines)
        second = _spawn(lock, 1)
        assert second.wait(timeout=30) != 0
        p.send_signal(signal.SIGTERM)
        assert p.wait(timeout=10) == 0
    finally:
        if p.poll() is None:
            p.kill()
