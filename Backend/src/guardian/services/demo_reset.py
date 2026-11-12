"""Reset to the start of scene 1 (spec §14.2) + shortcuts for fast end-to-end testing."""

from __future__ import annotations

from typing import Any

from guardian.chain.sim.engine import load_seed
from guardian.core.errors import ApiError
from guardian.graph.findings import R1
from guardian.services import proposal_service as ps
from guardian.services.runtime import Runtime

REQUEST_PROPOSER = "trang"


async def reset(rt: Runtime) -> dict[str, Any]:
    for t in list(rt.scenario_tasks.values()):
        t.cancel()
    rt.scenario_tasks.clear()
    rt.chain.reset()
    rt.events.clear()
    rt.stores.clear()
    _seed_request_12(rt)
    rt.graph_version += 1
    snap = rt.snapshot()
    rt.publish(
        "reset",
        {
            "at": rt.now(),
            "policyVersion": snap.policy_version,
            "graphVersion": rt.graph_version,
            "block": snap.block,
        },
    )
    rt.notify_state_changed(force_city=True)
    return {
        "status": "ok",
        "policyVersion": snap.policy_version,
        "graphVersion": rt.graph_version,
        "seededProposalId": 12,
    }


def _seed_request_12(rt: Runtime) -> None:
    """Request #12 (spec §10.4): minh 30.000 -> 130.000. Its risk report is evaluated on the clean
    policy-v2 reference state (spec F1: 30.000 -> 130.000, 1,5% -> 6,5%) because the live state at
    reset time is still v1."""
    r12 = load_seed()["request_12"]
    cap = next(c["args"]["cap"] for c in r12["calls"] if c["fn"] == "setPrincipalDailyCap")
    rt.sim.council.next_id = r12["id"]
    ps.propose(
        rt,
        REQUEST_PROPOSER,
        None,
        {"kind": "set_district_cap", "principalId": r12["subject_principal"], "cap": cap},
        r12["title"],
        snap=ps.reference_v2_snapshot(),
        report_basis="policy_v2_reference",
    )


def apply_policy_v2(rt: Runtime) -> dict[str, Any]:
    """propose (Lan) + Lan and Trang approve, through the real council path."""
    fid = f"{R1}:minh"
    if not any(f["id"] == fid for f in rt.findings()):
        raise ApiError(
            409, "POLICY_V2_NOT_APPLICABLE", "Khu minh không còn finding R1 (đã gom khoá chưa?)."
        )
    out = ps.propose(rt, "lan", fid, None)
    for m in ("lan", "trang"):
        out = ps.approve(rt, out["id"], m)
    return out
