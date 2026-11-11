"""Shared FastAPI dependencies: runtime accessor and the DEMO_MODE guard."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request

from guardian.services.runtime import Runtime


def get_runtime(request: Request) -> Runtime:
    return request.app.state.runtime  # type: ignore[no-any-return]


RuntimeDep = Annotated[Runtime, Depends(get_runtime)]


def demo_signing(action: str) -> Callable[[Request], Awaitable[None]]:
    """Dependency factory for every endpoint that signs with a test key."""

    async def dep(request: Request) -> None:
        rt = get_runtime(request)
        client = request.client.host if request.client else "unknown"
        rt.guard.check(action, client, request.url.path, request.method)

    return dep
