"""Server-side attacker for scene 4 (spec §4.3, §7.2): steps 1-5, wait for lock, step 7."""

from __future__ import annotations

import asyncio
from typing import Any

from guardian.core.errors import ApiError
from guardian.services import attempt_service as att
from guardian.services.runtime import AttemptRec, Runtime, ScenarioRunRec
from guardian.shared.scenario4 import SCENARIO4_STEPS, Scenario4Step

ATTACK_STEPS = tuple(s for s in SCENARIO4_STEPS if 1 <= s.step <= 5)
STEP7 = next(s for s in SCENARIO4_STEPS if s.step == 7)


def run_out(rt: Runtime, run: ScenarioRunRec) -> dict[str, Any]:
    attempts = sorted(
        (a for a in rt.stores.attempts.all() if a.scenario_run_id == run.id),
        key=lambda a: (a.step if a.step is not None else -1, a.id),
    )
    return {
        "id": run.id,
        "status": run.status,
        "delay": run.delay,
        "startedAt": run.started_at,
        "finishedAt": run.finished_at,
        "policyVersion": run.policy_version,
        "error": run.error,
        "attempts": [att.attempt_out(a) for a in attempts],
    }


def _step_attempt(rt: Runtime, run: ScenarioRunRec, s: Scenario4Step) -> AttemptRec:
    rec = att.run_spend(
        rt,
        s.signer,
        s.action,
        s.params,
        run_id=run.id,
        step=s.step,
        display_time=s.display_time,
        guard_source="attacker",
    )
    rt.notify_state_changed()
    return rec


async def _run_attack(rt: Runtime, run: ScenarioRunRec, delay: float) -> None:
    try:
        for i, s in enumerate(ATTACK_STEPS):
            if i:
                await asyncio.sleep(delay)
            _step_attempt(rt, run, s)
        run.status = "waiting_lock"
    except asyncio.CancelledError:
        run.status = "failed"
        run.error = "cancelled"
        raise
    except Exception as e:  # noqa: BLE001 - surface to the UI instead of dying silently
        run.status = "failed"
        run.error = f"{type(e).__name__}: {e}"
    finally:
        rt.stores.runs.save(run)
        rt.notify_state_changed(graph=False, force_city=True)


def _adopt_agent_step0(rt: Runtime, run: ScenarioRunRec) -> None:
    """The morning agent swap (step 0) belongs to the run that follows it."""
    for a in reversed(rt.stores.attempts.all()):
        if a.source == "agent" and a.outcome == "ok" and a.scenario_run_id is None:
            a.scenario_run_id, a.step, a.display_time = run.id, 0, SCENARIO4_STEPS[0].display_time
            rt.stores.attempts.save(a)
            break


async def start_scene4(rt: Runtime, delay: float | None, wait: bool = False) -> ScenarioRunRec:
    if any(r.status == "running" for r in rt.stores.runs.all()):
        raise ApiError(409, "SCENARIO_RUNNING", "Một lần chạy kịch bản đang diễn ra.")
    d = rt.settings.scenario_delay_seconds if delay is None else delay
    if d < 0:
        raise ApiError(422, "VALIDATION_ERROR", "delay must be >= 0")
    run = ScenarioRunRec(
        id=f"run-{len(rt.stores.runs.all()) + 1}",
        status="running",
        delay=d,
        started_at=rt.now(),
        policy_version=rt.snapshot().policy_version,
    )
    rt.stores.runs.save(run)
    _adopt_agent_step0(rt, run)
    task = asyncio.create_task(_run_attack(rt, run, d))
    rt.scenario_tasks[run.id] = task
    if wait:
        await task
    return run


def run_step7(rt: Runtime) -> tuple[ScenarioRunRec, AttemptRec]:
    """After the lock: key_minh tries another contract -> rejected by the node, no tx hash."""
    run = rt.stores.runs.latest()
    if run is None:
        run = ScenarioRunRec(
            id="run-1",
            status="running",
            delay=0,
            started_at=rt.now(),
            policy_version=rt.snapshot().policy_version,
        )
        rt.stores.runs.save(run)
    elif run.status == "running":
        raise ApiError(409, "SCENARIO_RUNNING", "Các bước 1-5 chưa chạy xong.")
    rec = _step_attempt(rt, run, STEP7)
    run.status, run.finished_at = "completed", rt.now()
    rt.stores.runs.save(run)
    rt.notify_state_changed(graph=False, force_city=True)
    return run, rec
