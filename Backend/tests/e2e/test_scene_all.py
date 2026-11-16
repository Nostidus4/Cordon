"""Scenes 1-5 end to end through the API on the sim chain: the same body `infra/l1/e2e_scene_all.py` runs on the real
Guardian L1 (OPS-004, spec §13.4)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings
from tests.e2e.scene_all import run_scenes


def test_scene_all_on_sim() -> None:
    settings = make_settings()
    app = create_app(settings, Runtime(settings, chain=SimChain(clock=lambda: T0)))
    with TestClient(app) as c:
        assert c.post("/api/demo/reset").status_code == 200
        rep = run_scenes(c, real=False, log=lambda *_: None)
    assert not rep.failed, rep.table()
    assert len(rep.rows) > 60


def test_scene_all_on_running_stack() -> None:
    """`E2E_BASE_URL=http://localhost:8000 make e2e` (L1-003): the same body against a RUNNING stack (docker compose).

    Start from a freshly reset demo (sim: this test resets it; L1: `make demo-reset` first, or a fresh
    `infra/l1/anvil_dev.py up`). On an L1 stack also set E2E_RPC_URL (host-reachable RPC) and E2E_DEPLOYMENTS_FILE
    (or E2E_COUNCIL) so the AllowList reads and the Council conflict check run through `cast`; E2E_HUY defaults to
    `members.huy` of that file."""
    import json
    import os

    import httpx
    import pytest

    base = os.environ.get("E2E_BASE_URL")
    if not base:
        pytest.skip("set E2E_BASE_URL to run the scenes against a running stack")
    with httpx.Client(base_url=base, timeout=180) as c:
        health = c.get("/api/health").json()
        real = not health["simulated"]
        council = os.environ.get("E2E_COUNCIL")
        huy = os.environ.get("E2E_HUY")
        if real and os.environ.get("E2E_DEPLOYMENTS_FILE"):
            with open(os.environ["E2E_DEPLOYMENTS_FILE"], encoding="utf-8") as f:
                dep = json.load(f)
            council = council or dep["contracts"]["council"]
            huy = huy or dep.get("members", {}).get("huy")
        if not real:
            assert c.post("/api/demo/reset").status_code == 200
        rep = run_scenes(
            c,
            real=real,
            rpc=os.environ.get("E2E_RPC_URL") if real else None,
            council=council,
            huy_address=huy,
            log=print,
        )
    print(rep.table())
    assert not rep.failed, rep.table()
