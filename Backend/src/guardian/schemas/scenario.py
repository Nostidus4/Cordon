from __future__ import annotations

from guardian.schemas.attempt import AttemptOut
from guardian.schemas.common import CamelModel


class Scene4Body(CamelModel):
    step: int | None = None


class ScenarioRunOut(CamelModel):
    id: str
    status: str  # running | waiting_lock | completed | failed
    delay: float
    started_at: int
    finished_at: int | None = None
    policy_version: int
    error: str | None = None
    attempts: list[AttemptOut]
