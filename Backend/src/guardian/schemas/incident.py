"""IncidentOut (docs/spec/CITY_OPS.md §4.4): GET /api/incidents, SSE `incident_updated`."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from guardian.schemas.common import CamelModel

IncidentStatus = Literal["detected", "contained", "awaiting_council", "recovering", "resolved"]
StepKey = Literal["detect", "contain", "propose", "recover", "verify"]
StepStatus = Literal["done", "active", "pending", "skipped"]


class IncidentSubject(CamelModel):
    principal_id: str | None = None
    key: str | None = None


class IncidentTrigger(CamelModel):
    reason_code: str | None = None
    attempt_ids: list[int] = Field(default_factory=list)
    # one of these, depending on the trigger (all optional, additive)
    agent_run_id: int | None = None
    assistant_log_id: int | None = None
    proposal_id: int | None = None


class IncidentStep(CamelModel):
    key: StepKey
    label_vi: str
    status: StepStatus
    ts: int | None = None
    detail_vi: str = ""
    tx_hash: str | None = None


class IncidentOut(CamelModel):
    id: int
    building: str
    fault_id: str | None = None
    title_vi: str
    status: IncidentStatus
    opened_at: int
    resolved_at: int | None = None
    subject: IncidentSubject
    trigger: IncidentTrigger
    steps: list[IncidentStep]
    proposal_id: int | None = None
