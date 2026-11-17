"""Scene 5 on the L1 (#115): a request rebuilt from the chain shows its live report, even after the scene-4 lock."""

from __future__ import annotations

import pytest

from guardian.chain.sim import SimChain
from guardian.services import action_service
from guardian.services import proposal_service as ps
from guardian.services.proposal_rebuild import REBUILT_BASIS
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings


def _rt() -> Runtime:
    return Runtime(make_settings(), chain=SimChain(clock=lambda: T0), clock=lambda: T0)


def _rebuilt_placeholder(rt: Runtime, pid: int) -> None:
    """Make the stored record look like one rebuilt after an API restart: before == after, no real report."""
    rec = rt.stores.proposals.get(pid)
    assert rec is not None
    rec.report_basis = REBUILT_BASIS
    rec.risk_report = {**rec.risk_report, "after": rec.risk_report["before"]}


def _ends(out: dict) -> tuple[str, str]:
    r = out["riskReport"]
    return r["before"]["enforced"]["display"], r["after"]["enforced"]["display"]


def test_rebuilt_open_request_is_recomputed_on_live_state() -> None:
    rt = _rt()
    out = ps.propose(
        rt,
        "trang",
        None,
        {"kind": "set_district_cap", "principalId": "minh", "cap": 130_000_000_000},
    )
    _rebuilt_placeholder(rt, out["id"])
    before, after = _ends(ps.proposal_out(rt, out["id"]))
    assert before != after and after == "130.000"


def test_rebuilt_open_request_survives_the_district_lock() -> None:
    rt = _rt()
    out = ps.propose(
        rt,
        "trang",
        None,
        {"kind": "set_district_cap", "principalId": "minh", "cap": 130_000_000_000},
    )
    _rebuilt_placeholder(rt, out["id"])
    unlocked = _ends(ps.proposal_out(rt, out["id"]))
    action_service.lock(rt, "lan", "minh")
    assert rt.snapshot().principals["minh"].locked
    assert _ends(ps.proposal_out(rt, out["id"])) == unlocked != ("0", "0")


@pytest.mark.parametrize("basis", ["live", "policy_v2_reference"])
def test_other_reports_stay_frozen(basis: str) -> None:
    rt = _rt()
    out = ps.propose(
        rt,
        "trang",
        None,
        {"kind": "set_district_cap", "principalId": "minh", "cap": 130_000_000_000},
        report_basis=basis,
    )
    frozen = _ends(out)
    action_service.lock(rt, "lan", "minh")
    assert _ends(ps.proposal_out(rt, out["id"])) == frozen
