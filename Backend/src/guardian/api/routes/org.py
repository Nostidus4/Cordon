"""GET /api/org: company, main treasury, spending vault, Council."""

from fastapi import APIRouter

from guardian.api.deps import RuntimeDep
from guardian.schemas.org import OrgOut
from guardian.services import org_service

router = APIRouter(prefix="/api", tags=["org"])


@router.get("/org", response_model=OrgOut)
async def get_org(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return org_service.org(rt)
