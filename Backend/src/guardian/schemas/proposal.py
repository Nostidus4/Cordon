from __future__ import annotations

from typing import Any

from guardian.schemas.common import CamelModel, JsonDict


class DraftRequest(CamelModel):
    finding_id: str | None = None
    change: dict[str, Any] | None = None
    compromised: list[str] | None = None


class ProposeRequest(CamelModel):
    member: str
    finding_id: str | None = None
    change: dict[str, Any] | None = None
    title: str | None = None


class ApproveRequest(CamelModel):
    member: str


class WarningOut(CamelModel):
    code: str
    text: str


class DraftOut(CamelModel):
    title: str
    finding_id: str | None = None
    change: JsonDict
    calls: list[JsonDict]
    description_vi: list[str]
    risk_report: JsonDict
    risk_report_hash: str
    subject_principal: str | None = None
    classification: str
    requires_council: bool
    conflicted_members: list[str]
    warnings: list[WarningOut]
    sent: bool


class MemberApproval(CamelModel):
    id: str
    label: str
    principal_id: str | None = None
    approved: bool
    conflicted: bool
    can_approve: bool
    disabled_reason: str | None = None


class ProposalOut(CamelModel):
    id: int
    title: str
    status: str
    subject_principal: str | None = None
    proposer: str
    approvals: list[str]
    approval_count: int
    threshold: int
    members: list[MemberApproval]
    conflicted_members: list[str]
    change: JsonDict | None = None
    calls: list[JsonDict]
    description_vi: list[str]
    risk_report: JsonDict
    risk_report_hash: str
    report_basis: str
    warnings: list[WarningOut]
    finding_id: str | None = None
    created_at: int
    executed_at: int | None = None
    executed_tx_hash: str | None = None
    # timelock (#77): `eta` = earliest execution (unix s) once the threshold was reached, `queued` while waiting
    eta: int | None = None
    queued: bool = False
    vetoed_by: str | None = None  # Council member id who vetoed
