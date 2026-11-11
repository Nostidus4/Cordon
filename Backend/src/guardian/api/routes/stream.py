"""GET /api/stream: SSE (event, attempt, graph_updated, proposal_updated, agent_run, city_updated, reset)."""

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from guardian.api.deps import RuntimeDep

router = APIRouter(prefix="/api", tags=["stream"])
PING_SECONDS = 15


@router.get("/stream")
async def stream(rt: RuntimeDep) -> EventSourceResponse:
    queue = rt.bus.subscribe()  # subscribe before the response starts: no missed events

    async def gen() -> AsyncIterator[dict[str, Any]]:
        try:
            while True:
                event_type, data = await queue.get()
                yield {"event": event_type, "data": json.dumps(data, ensure_ascii=False)}
        finally:
            rt.bus.unsubscribe(queue)

    return EventSourceResponse(gen(), ping=PING_SECONDS)
