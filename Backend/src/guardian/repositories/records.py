"""Async repositories for `attempts`, `scenario_runs` and (DB-003) proposals, agent runs, assistant logs,
findings, sim runs.

`AttemptRec` fields without a column of their own travel in `attempts.action` (jsonb) next to the action
name, so a reloaded rec equals the original. Money stays the `{raw, display}` string dicts, never float."""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from guardian.models import (
    AgentRun,
    AssistantLog,
    Attempt,
    Finding,
    Proposal,
    ScenarioRun,
    SimRun,
)
from guardian.services.runtime import (
    AgentRunRec,
    AssistantLogRec,
    AttemptRec,
    FindingRec,
    ProposalRec,
    ScenarioRunRec,
    SimRunRec,
)

Sessions = async_sessionmaker[AsyncSession]
_EXTRA = (
    "display_time", "signer_label", "principal_id", "block", "amount", "token", "to", "to_label",
    "principal_spent_after", "key_spent_after", "simulated", "source",
)  # fmt: skip


def _dt(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, UTC)


def _attempt_row(a: AttemptRec) -> Attempt:
    return Attempt(
        id=str(a.id),
        scenario_run_id=a.scenario_run_id,
        step=a.step,
        signer=a.signer,
        action={"name": a.action, **{k: getattr(a, k) for k in _EXTRA}},
        outcome=a.outcome,
        reason_code=a.reason_code,
        tx_hash=a.tx_hash,
        error_raw=a.error_raw,
        created_at=_dt(a.ts),
    )


def _attempt_rec(r: Attempt) -> AttemptRec:
    extra: dict[str, Any] = {k: r.action[k] for k in _EXTRA}
    return AttemptRec(
        id=int(r.id),
        scenario_run_id=r.scenario_run_id,
        step=r.step,
        signer=r.signer,
        action=r.action["name"],
        outcome=r.outcome,
        reason_code=r.reason_code,
        tx_hash=r.tx_hash,
        error_raw=r.error_raw,
        ts=int(r.created_at.timestamp()),
        **extra,
    )


def _run_row(r: ScenarioRunRec) -> ScenarioRun:
    return ScenarioRun(
        id=r.id,
        name="scene4",
        started_at=_dt(r.started_at),
        finished_at=_dt(r.finished_at) if r.finished_at is not None else None,
        status=r.status,
        delay=r.delay,  # seconds, not money
        policy_version=r.policy_version,
        error=r.error,
    )


def _run_rec(r: ScenarioRun) -> ScenarioRunRec:
    return ScenarioRunRec(
        id=r.id,
        status=r.status,
        delay=r.delay,
        started_at=int(r.started_at.timestamp()),
        policy_version=r.policy_version,
        finished_at=int(r.finished_at.timestamp()) if r.finished_at is not None else None,
        error=r.error,
    )


_PROPOSAL_EXTRA = (
    "subject_principal", "change", "description_vi", "proposer", "created_at", "finding_id",
    "report_basis", "executed_at", "executed_tx_hash",
)  # fmt: skip


def _proposal_row(p: ProposalRec, status: str, approvers: list[str]) -> Proposal:
    """`status`/`approvals` are what the chain says at save time (informational: the API reads the chain).
    The fields without a column travel in `approvals.rec`."""
    return Proposal(
        id=str(p.id),
        onchain_id=p.id,
        title=p.title,
        subject_principal=p.subject_principal or "",
        calls=p.calls,
        risk_report=p.risk_report,
        risk_report_hash=p.risk_report_hash,
        approvals={"approvers": approvers, "rec": {k: getattr(p, k) for k in _PROPOSAL_EXTRA}},  # type: ignore[arg-type]
        status=status,
    )


def _proposal_rec(r: Proposal) -> ProposalRec:
    return ProposalRec(
        id=int(r.id),
        title=r.title,
        calls=r.calls,
        risk_report=r.risk_report,
        risk_report_hash=r.risk_report_hash,
        **r.approvals["rec"],  # type: ignore[call-overload]
    )


def _agent_run_row(a: AgentRunRec) -> AgentRun:
    return AgentRun(
        id=str(a.id),
        decision={"rec": asdict(a)},
        reason_text=a.reason_text or "",
        reason_source=a.reason_source or "",
        tx_hash=a.tx_hash,
        outcome=a.outcome,
        created_at=_dt(a.ts),
    )


def _assistant_row(a: AssistantLogRec) -> AssistantLog:
    return AssistantLog(
        id=str(a.id),
        question=a.question,
        tool_calls=[],
        answer={"rec": asdict(a)},
        numbers_verified=a.numbers_verified,
        created_at=_dt(a.ts),
    )


def _finding_row(f: FindingRec) -> Finding:
    return Finding(
        id=f.id,
        rule_id=f.rule_id,
        principal_id=f.principal_id,
        severity=f.severity,
        data=f.data,
        created_at=_dt(f.created_at),
        resolved_by_proposal=None
        if f.resolved_by_proposal is None
        else str(f.resolved_by_proposal),
    )


def _finding_rec(r: Finding) -> FindingRec:
    return FindingRec(
        r.id, r.rule_id, r.principal_id, r.severity, r.data, int(r.created_at.timestamp()),
        None if r.resolved_by_proposal is None else int(r.resolved_by_proposal),
    )  # fmt: skip


def _sim_row(r: SimRunRec) -> SimRun:
    return SimRun(
        id=r.id,
        input=r.input,
        output=r.output,
        graph_version=str(r.graph_version),
        created_at=_dt(r.ts),
    )


def _sim_rec(r: SimRun) -> SimRunRec:
    return SimRunRec(r.id, r.input, r.output, int(r.graph_version), int(r.created_at.timestamp()))


class RecordRepo:
    def __init__(self, sessions: Sessions) -> None:
        self._s = sessions

    async def put(self, row: Any) -> None:
        """Upsert any mapped row (primary key merge)."""
        async with self._s.begin() as s:
            await s.merge(row)

    async def load(self, model: Any) -> list[Any]:
        async with self._s() as s:
            return list((await s.scalars(select(model))).all())

    async def wipe(self, model: Any) -> None:
        async with self._s.begin() as s:
            await s.execute(delete(model))

    async def save_proposal(self, p: ProposalRec, status: str, approvers: list[str]) -> None:
        await self.put(_proposal_row(p, status, approvers))

    async def save_agent_run(self, a: AgentRunRec) -> None:
        await self.put(_agent_run_row(a))

    async def save_assistant_log(self, a: AssistantLogRec) -> None:
        await self.put(_assistant_row(a))

    async def save_attempt(self, a: AttemptRec) -> None:
        async with self._s.begin() as s:
            await s.merge(_attempt_row(a))

    async def save_run(self, r: ScenarioRunRec) -> None:
        async with self._s.begin() as s:
            await s.merge(_run_row(r))

    async def attempts(self) -> list[AttemptRec]:
        async with self._s() as s:
            return [_attempt_rec(r) for r in (await s.scalars(select(Attempt))).all()]

    async def runs(self) -> list[ScenarioRunRec]:
        async with self._s() as s:
            return [_run_rec(r) for r in (await s.scalars(select(ScenarioRun))).all()]

    async def clear_attempts(self) -> None:
        async with self._s.begin() as s:
            await s.execute(delete(Attempt))

    async def clear_runs(self) -> None:
        async with self._s.begin() as s:
            await s.execute(delete(ScenarioRun))
