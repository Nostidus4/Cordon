"""GET /api/faults and POST /api/faults/{id}/inject (docs/spec/CITY_OPS.md §3). Injection is DEMO_MODE only."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.fault import FaultDef, FaultResult
from guardian.services import faults

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
    return faults.inject(rt, fault_id)
