"""B05 Tx Guardian (docs/spec/CITY_OPS.md §7): check a transaction before it is signed, then send or reject it."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.schemas.txguard import PreparedTx, TxCheckOut
from guardian.txguard import service

router = APIRouter(prefix="/api/txguard", tags=["txguard"])


@router.post("/check", response_model=TxCheckOut)
async def check(body: PreparedTx, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return service.check(rt, body)  # simulate only: no key is used, no state changes


@router.get("/checks", response_model=list[TxCheckOut])
async def list_checks(rt: RuntimeDep, limit: int = 50):  # type: ignore[no-untyped-def]
    return service.list_checks(rt, limit)


@router.get("/checks/{check_id}", response_model=TxCheckOut)
async def get_check(check_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return service.get_check(rt, check_id)


@router.post(
    "/checks/{check_id}/send",
    response_model=TxCheckOut,
    dependencies=[Depends(demo_signing("txguard.send"))],
)
async def send(check_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return service.send(rt, check_id)


@router.post("/checks/{check_id}/reject", response_model=TxCheckOut)
async def reject(check_id: int, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return service.reject(rt, check_id)
