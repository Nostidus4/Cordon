"""Scene 4 from the server (replaces the attacker CLI) + saved runs for Replay."""

from fastapi import APIRouter, Depends

from guardian.api.deps import RuntimeDep, demo_signing
from guardian.core.errors import ApiError
from guardian.schemas.scenario import ScenarioRunOut, Scene4Body
from guardian.services import scenario_service as sc

router = APIRouter(prefix="/api/scenario", tags=["scenario"])
guard = Depends(demo_signing("scenario.scene4"))


@router.post("/scene4/run", response_model=ScenarioRunOut, dependencies=[guard])
async def run_scene4(
    rt: RuntimeDep,
    body: Scene4Body | None = None,  # type: ignore[no-untyped-def]
    delay: float | None = None,
    wait: bool = False,
):
    """Steps 1-5 as a background task (`delay` seconds between steps, default 3, 0 allowed), then
    waits for the lock. `{"step": 7}` = step 7. `wait=true` blocks until steps 1-5 are done."""
    if body is not None and body.step is not None:
        if body.step != 7:
            raise ApiError(422, "VALIDATION_ERROR", "step: only 7 is supported")
        run, _ = sc.run_step7(rt)
        return sc.run_out(rt, run)
    run = await sc.start_scene4(rt, delay, wait)
    return sc.run_out(rt, run)


@router.post("/scene4/step7", response_model=ScenarioRunOut, dependencies=[guard])
async def step7(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    run, _ = sc.run_step7(rt)
    return sc.run_out(rt, run)


@router.get("/runs", response_model=list[ScenarioRunOut])
async def runs(rt: RuntimeDep):  # type: ignore[no-untyped-def]
    return [sc.run_out(rt, r) for r in rt.stores.runs.values()]


@router.get("/runs/{run_id}", response_model=ScenarioRunOut)
async def get_run(run_id: str, rt: RuntimeDep):  # type: ignore[no-untyped-def]
    run = rt.stores.runs.get(run_id)
    if run is None:
        raise ApiError(404, "RUN_NOT_FOUND", f"Không có lần chạy '{run_id}'.")
    return sc.run_out(rt, run)
