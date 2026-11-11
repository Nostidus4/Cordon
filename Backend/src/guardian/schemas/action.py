from __future__ import annotations

from guardian.schemas.common import CamelModel


class LockRequest(CamelModel):
    member: str
    principal_id: str


class PauseRequest(CamelModel):
    member: str


class ActionOut(CamelModel):
    status: str
    tx_hash: str | None = None
    block: int | None = None
    simulated: bool
    member: str
    principal_id: str | None = None
