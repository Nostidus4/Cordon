"""Fixtures shared by the payroll API tests."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest_asyncio

from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings

DAY = 86400


@pytest_asyncio.fixture
async def no_demo_client() -> AsyncIterator[httpx.AsyncClient]:
    settings = make_settings(demo_mode=False)
    rt = Runtime(settings, chain=SimChain(clock=lambda: T0))
    app = create_app(settings, rt)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c,
    ):
        yield c
