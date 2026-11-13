"""FastAPI app factory (`uv run guardian-api`)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from guardian.api.router import api_router
from guardian.core.config import Settings, get_settings
from guardian.core.errors import register_handlers
from guardian.services.demo_reset import reset as demo_reset
from guardian.services.runtime import Runtime


def create_app(settings: Settings | None = None, runtime: Runtime | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        rt = runtime or Runtime(settings)  # CHAIN_MODE=l1: L1StartupError on bad config
        rt.bind_loop(asyncio.get_running_loop())
        app.state.runtime = rt
        await demo_reset(rt, startup=True)  # seed request #12 so the app starts at scene 1
        rt.start_responder_ticker()
        try:
            yield
        finally:
            await rt.shutdown()

    app = FastAPI(title="Cordon API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run("guardian.main:app", host="0.0.0.0", port=8000, reload=True)
