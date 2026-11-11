"""GET /api/attempts?run= and POST /api/attempts (record from an external attacker CLI)."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.attempt import AttemptIn, AttemptOut
from guardian.services import attempt_service as att

router = APIRouter(prefix="/api", tags=["attempts"])


@router.get("/attempts", response_model=list[AttemptOut])
async def list_attempts(rt: RuntimeDep, run: str | None = None):  # type: ignore[no-untyped-def]
    """`run` = scenario run id, or `latest`; omitted = every attempt."""
    return [att.attempt_out(a) for a in att.list_attempts(rt, run)]


@router.post("/attempts", response_model=AttemptOut, status_code=201)
async def record_attempt(body: AttemptIn, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    rec = att.record_external(rt, body.model_dump(by_alias=True))
    return att.attempt_out(rec)
