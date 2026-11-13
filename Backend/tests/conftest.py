"""Fixtures: API app with a fixed-clock SimChain (no midnight flake), httpx client, helpers."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import httpx
import pytest_asyncio
from fastapi import FastAPI

from guardian.chain.sim import SimChain
from guardian.core.config import Settings
from guardian.main import create_app
from guardian.services.runtime import Runtime

T0 = 1_800_000_000 - 1_800_000_000 % 86400 + 3600  # 01:00 UTC, fixed day for the sim chain


def make_settings(**kw: Any) -> Settings:
    base: dict[str, Any] = {
        "demo_mode": True,
        "rate_limit_per_minute": 100_000,
        "scenario_delay_seconds": 0.0,
        "llm_enabled": False,  # never reach a real provider from the suite, whatever the dev's env holds
    }
    return Settings(**{**base, **kw})


@pytest_asyncio.fixture
async def app() -> AsyncIterator[FastAPI]:
    settings = make_settings()
    rt = Runtime(settings, chain=SimChain(clock=lambda: T0))
    application = create_app(settings, rt)
    async with application.router.lifespan_context(application):
        yield application


@pytest_asyncio.fixture
async def rt(app: FastAPI) -> Runtime:
    return app.state.runtime  # type: ignore[no-any-return]


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def collect_sse(
    app: FastAPI, trigger: Callable[[], Awaitable[Any]], want: set[str], timeout: float = 5.0
) -> dict[str, list[str]]:
    """Run GET /api/stream through raw ASGI (httpx cannot stream an endless body), call `trigger`,
    wait until every event type in `want` was seen, then disconnect. Returns type -> data list."""
    msgs: list[dict[str, Any]] = []
    started, disconnect = asyncio.Event(), asyncio.Event()

    async def receive() -> dict[str, Any]:
        await disconnect.wait()
        return {"type": "http.disconnect"}

    async def send(m: dict[str, Any]) -> None:
        msgs.append(m)
        if m["type"] == "http.response.start":
            started.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "path": "/api/stream",
        "raw_path": b"/api/stream",
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 1),
        "server": ("test", 80),
        "scheme": "http",
        "root_path": "",
        "app": app,
    }
    task = asyncio.create_task(app(scope, receive, send))  # type: ignore[arg-type]
    await asyncio.wait_for(started.wait(), timeout)
    await trigger()

    def parse() -> dict[str, list[str]]:
        body = b"".join(m.get("body", b"") for m in msgs if m["type"] == "http.response.body")
        out: dict[str, list[str]] = {}
        for block in body.decode().replace("\r\n", "\n").split("\n\n"):
            ev = next((ln[6:].strip() for ln in block.split("\n") if ln.startswith("event:")), None)
            data = next((ln[5:].strip() for ln in block.split("\n") if ln.startswith("data:")), "")
            if ev:
                out.setdefault(ev, []).append(data)
        return out

    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not want <= parse().keys() and loop.time() < deadline:
        await asyncio.sleep(0.02)
    disconnect.set()
    await asyncio.wait_for(task, timeout)
    return parse()
