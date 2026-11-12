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
