"""DEMO_SIGNING_TOKEN: when set, every signing endpoint needs header X-Demo-Token (401 DEMO_TOKEN_REQUIRED)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest_asyncio

from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings

TOKEN = "s3cret-demo-token"
OK = {"X-Demo-Token": TOKEN}


async def _app(**kw: Any) -> Any:
    settings = make_settings(**kw)
    return create_app(settings, Runtime(settings, chain=SimChain(clock=lambda: T0)))


@pytest_asyncio.fixture
async def guarded() -> AsyncIterator[httpx.AsyncClient]:
    app = await _app(demo_signing_token=TOKEN)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        yield c


@pytest_asyncio.fixture
async def open_api() -> AsyncIterator[httpx.AsyncClient]:
    app = await _app()
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        yield c


ENDPOINTS: list[tuple[str, dict[str, Any] | None]] = [
    ("/api/actions/lock", {"member": "lan", "principalId": "minh"}),
    ("/api/demo/reset", None),
    ("/api/proposals/12/approve", {"member": "lan"}),
    ("/api/agent/run-once", None),
]


async def test_missing_or_wrong_token_is_401(guarded: httpx.AsyncClient) -> None:
    for url, body in ENDPOINTS:
        for headers in ({}, {"X-Demo-Token": "nope"}, {"X-Demo-Token": ""}):
            r = await guarded.post(url, json=body, headers=headers)
            assert r.status_code == 401, (url, headers)
            assert r.json()["error"]["code"] == "DEMO_TOKEN_REQUIRED"
    assert (await guarded.get("/api/health")).status_code == 200  # reads stay open
    assert (await guarded.get("/api/graph")).status_code == 200


async def test_correct_token_passes(guarded: httpx.AsyncClient) -> None:
    r = await guarded.post("/api/demo/reset", headers=OK)
    assert r.status_code == 200, r.text
    r = await guarded.post(
        "/api/actions/lock", json={"member": "lan", "principalId": "minh"}, headers=OK
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok"
    r = await guarded.post("/api/proposals/12/approve", json={"member": "lan"}, headers=OK)
    assert r.status_code == 200, r.text


async def test_rejection_not_audited_and_counts_toward_rate_limit() -> None:
    app = await _app(demo_signing_token=TOKEN, rate_limit_per_minute=2)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        assert (await c.post("/api/agent/run-once")).status_code == 401
        assert (await c.post("/api/agent/run-once")).status_code == 401
        assert (await c.post("/api/agent/run-once", headers=OK)).status_code == 429
        assert app.state.runtime.guard.audit == []


async def test_token_unset_changes_nothing(open_api: httpx.AsyncClient) -> None:
    assert (await open_api.post("/api/demo/reset")).status_code == 200
    r = await open_api.post("/api/demo/reset", headers={"X-Demo-Token": "anything"})
    assert r.status_code == 200


async def test_cors_preflight_allows_the_token_header(guarded: httpx.AsyncClient) -> None:
    r = await guarded.options(
        "/api/actions/lock",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-demo-token,content-type",
        },
    )
    assert r.status_code == 200, r.text
    assert "x-demo-token" in r.headers["access-control-allow-headers"].lower()
