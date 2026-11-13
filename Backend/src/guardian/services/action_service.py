"""emergencyLock / emergencyPause via the demo signer (a Council member's test key)."""

from __future__ import annotations

from typing import Any

from guardian.chain.base import TxResult
from guardian.chain.errors import ChainRevert
from guardian.core.errors import ApiError
from guardian.services import attempt_service as att
from guardian.services.proposal_service import require_member
from guardian.services.runtime import Runtime
from guardian.shared.scenario4 import SCENARIO4_DISTRICT, SCENARIO4_STEPS

LOCK_STEP = next(s for s in SCENARIO4_STEPS if s.action == "lock")


def _out(res: TxResult, **extra: Any) -> dict[str, Any]:
    return {
        "status": res.status,
        "txHash": res.tx_hash,
        "block": res.block,
        "simulated": res.simulated,
        **extra,
    }


def _raise_if_failed(res: TxResult) -> None:
    if res.status != "ok":
        raise ChainRevert(res.error_raw or "reverted", res.reason_code)


def lock(rt: Runtime, member: str, principal_id: str) -> dict[str, Any]:
    snap = rt.snapshot()
    require_member(snap, member)
    if principal_id not in snap.principals:
        raise ApiError(404, "DISTRICT_NOT_FOUND", f"Không có khu '{principal_id}'.")
    res = rt.chain.emergency_lock(rt.addr(member), principal_id)
    _raise_if_failed(res)
    run = next(
        (r for r in reversed(rt.stores.runs.all()) if r.status in ("running", "waiting_lock")),
        None,
    )
    if run is not None and principal_id == SCENARIO4_DISTRICT:
        m = next(m for m in snap.council if m.id == member)
        att.add_attempt(
            rt,
            scenario_run_id=run.id,
            step=LOCK_STEP.step,
            display_time=LOCK_STEP.display_time,
            signer=f"council_{member}",
            signer_label=m.label,
            principal_id=principal_id,
            action="lock",
            outcome="ok",
            reason_code=None,
            tx_hash=res.tx_hash,
            error_raw=None,
            block=res.block,
            simulated=res.simulated,
            source="server",
        )
    rt.notify_state_changed()
    return _out(res, principalId=principal_id, member=member)


def pause(rt: Runtime, member: str) -> dict[str, Any]:
    require_member(rt.snapshot(), member)
    res = rt.chain.emergency_pause(rt.addr(member))
    _raise_if_failed(res)
    rt.notify_state_changed()
    return _out(res, member=member)
