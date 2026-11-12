"""Reset to the start of scene 1 (spec §14.2) + shortcuts for fast end-to-end testing."""

from __future__ import annotations

import logging
from typing import Any

from guardian.chain.l1.startup import L1StartupError
from guardian.chain.sim.engine import load_seed
from guardian.core.errors import ApiError
from guardian.graph.findings import R1
from guardian.services import proposal_service as ps
from guardian.services.runtime import Runtime

REQUEST_PROPOSER = "trang"
log = logging.getLogger("guardian.demo_reset")


async def reset(rt: Runtime, *, startup: bool = False) -> dict[str, Any]:
    """Back to scene 1.

    sim: the in-memory chain is rewound and request #12 seeded.
    l1 at startup: only the in-memory stores are cleared (no request #12, no chain work).
    l1 on `POST /api/demo/reset`: the ledger cannot be rewound, so `make demo-reset` has already deployed a
    FRESH contract set and written it to the deployments file (`infra/l1/demo-reset.sh`). This call reloads that
    deployment without a restart, clears the stores, keeps the event log and seeds request #12 on the new Council
    (its counter was left at 11 by the script, so the id is 12)."""
    for t in list(rt.scenario_tasks.values()):
        t.cancel()
    rt.scenario_tasks.clear()
    if rt.is_l1 and not startup:
        try:
            rt.reload_deployment()
        except L1StartupError as exc:
            raise ApiError(502, "RELOAD_FAILED", f"Không nạp được bộ hợp đồng mới: {exc}") from exc
    if not rt.is_l1:
        rt.chain.reset()
        rt.event_log.clear()
    rt.stores.clear()
    seeded: int | None = None
    if not rt.is_l1:
        _seed_request_12(rt)
        seeded = 12
    elif not startup:
        seeded = _seed_request_12_l1(rt)
    rt.graph_version += 1
    snap = rt.snapshot()
    rt.publish(
        "reset",
        {
            "at": rt.now(),
            "policyVersion": snap.policy_version,
            "policyLabel": snap.policy_label,
            "graphVersion": rt.graph_version,
            "block": snap.block,
        },
    )
    rt.notify_state_changed(force_city=True)
    return {
        "status": "ok",
        "policyVersion": snap.policy_version,
        "policyLabel": snap.policy_label,
        "graphVersion": rt.graph_version,
        "seededProposalId": seeded,
    }


def _seed_request_12(rt: Runtime) -> None:
    """Request #12 (spec §10.4): minh 30.000 -> 130.000. Its risk report is evaluated on the clean
    policy-v2 reference state (spec F1: 30.000 -> 130.000, 1,5% -> 6,5%) because the live state at
    reset time is still v1."""
    r12 = load_seed()["request_12"]
    cap = next(c["args"]["cap"] for c in r12["calls"] if c["fn"] == "setPrincipalDailyCap")
    rt.chain.council.next_id = r12["id"]
    ps.propose(
        rt,
        REQUEST_PROPOSER,
        None,
        {"kind": "set_district_cap", "principalId": r12["subject_principal"], "cap": cap},
        r12["title"],
        snap=ps.reference_v2_snapshot(),
        report_basis="policy_v2_reference",
    )


def _seed_request_12_l1(rt: Runtime) -> int | None:
    """Request #12 as a real proposal of the new Council. Its id is whatever the counter gives (12 when the reset
    script ran); a failure is logged and the reset still succeeds."""
    r12 = load_seed()["request_12"]
    cap = next(c["args"]["cap"] for c in r12["calls"] if c["fn"] == "setPrincipalDailyCap")
    try:
        out = ps.propose(
            rt,
            REQUEST_PROPOSER,
            None,
            {"kind": "set_district_cap", "principalId": r12["subject_principal"], "cap": cap},
            r12["title"],
            snap=ps.reference_v2_snapshot(),
            report_basis="policy_v2_reference",
        )
    except Exception:  # reset must not fail on the seeded request
        log.exception("could not seed request #12 on the new Council")
        return None
    if out["id"] != r12["id"]:
        log.warning("request #12 got proposal id %s (Council counter was not 11)", out["id"])
    return int(out["id"])


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
