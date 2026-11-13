"""GET /api/faults and POST /api/faults/{id}/inject (docs/spec/CITY_OPS.md §3). Injection is DEMO_MODE only."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.fault import FaultDef, FaultResult
from guardian.services import faults, violations

router = APIRouter(prefix="/api/faults", tags=["faults"])


@router.get("", response_model=list[FaultDef])
async def list_faults():  # type: ignore[no-untyped-def]
    return faults.list_faults()


@router.post(
    "/{fault_id}/inject",
    response_model=FaultResult,
    dependencies=[Depends(demo_signing("faults.inject"))],
)
async def inject(fault_id: str, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    before = max((a.id for a in rt.stores.attempts), default=0)
    out = faults.inject(rt, fault_id)
    violations.tag_fault(rt, fault_id, before)  # so the violations board can say "fault"
    return out
