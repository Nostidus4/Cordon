"""DEMO_MODE guard: signing endpoints need DEMO_MODE, rate limit, audit log."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest_asyncio

from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings


async def _client(**kw: Any) -> tuple[Any, Runtime]:
    settings = make_settings(**kw)
    rt = Runtime(settings, chain=SimChain(clock=lambda: T0))
    return create_app(settings, rt), rt


@pytest_asyncio.fixture
async def no_demo() -> AsyncIterator[httpx.AsyncClient]:
    app, _ = await _client(demo_mode=False)
    async with (
        app.router.lifespan_context(app),  # startup seeding bypasses the HTTP guard
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        yield c


async def test_signing_endpoints_blocked_without_demo_mode(no_demo: httpx.AsyncClient) -> None:
    c = no_demo
    assert (await c.get("/api/health")).json()["demoMode"] is False
    assert (await c.get("/api/graph")).status_code == 200  # reads stay open
    for url, body in [
        ("/api/actions/lock", {"member": "lan", "principalId": "minh"}),
        ("/api/actions/pause", {"member": "lan"}),
        ("/api/proposals", {"member": "lan", "findingId": "x"}),
        ("/api/proposals/12/approve", {"member": "lan"}),
        ("/api/agent/run-once", None),
        ("/api/demo/reset", None),
        ("/api/demo/policy-v2", None),
        ("/api/scenario/scene4/run", None),
    ]:
        r = await c.post(url, json=body)
        assert r.status_code == 403, url
        assert r.json()["error"]["code"] == "DEMO_MODE_REQUIRED"


async def test_default_demo_mode_follows_chain_mode() -> None:
    from guardian.core.config import Settings

    assert Settings().demo_enabled is True  # sim -> on by default
    assert Settings(demo_mode=False).demo_enabled is False
    assert Settings(chain_mode="l1").demo_enabled is False  # never on by default off-sim


async def test_rate_limit_and_audit() -> None:
    app, rt = await _client(rate_limit_per_minute=3)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        codes = [(await c.post("/api/agent/run-once")).status_code for _ in range(4)]
        assert codes == [200, 200, 200, 429]
        r = await c.post("/api/agent/run-once")
        assert r.json()["error"]["code"] == "RATE_LIMITED"
        assert (await c.get("/api/health")).status_code == 200  # reads are not rate limited
        assert [e["action"] for e in rt.guard.audit] == ["agent.run_once"] * 3
        assert rt.guard.audit[0]["path"] == "/api/agent/run-once"
