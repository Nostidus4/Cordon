"""GET /api/events?since=<block>: chain events with block > since."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.event import EventOut
from guardian.services import views

_ALL = 10**9  # the endpoint has never paginated

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events", response_model=list[EventOut])
async def events(rt: RuntimeDep, since: int = 0):  # type: ignore[no-untyped-def]
    dec = rt.token_decimals()
    return [views.api_event(e, dec) for e in rt.events.list(since, limit=_ALL)]
