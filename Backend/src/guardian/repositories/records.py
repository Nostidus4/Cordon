"""Async repositories for `attempts` and `scenario_runs`.

`AttemptRec` fields without a column of their own travel in `attempts.action` (jsonb) next to the action
name, so a reloaded rec equals the original. Money stays the `{raw, display}` string dicts, never float."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from guardian.models import Attempt, ScenarioRun
from guardian.services.runtime import AttemptRec, ScenarioRunRec

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


class RecordRepo:
    def __init__(self, sessions: Sessions) -> None:
        self._s = sessions

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
