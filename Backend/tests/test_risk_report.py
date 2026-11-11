"""Risk report C1 / F1 / F2 + stable hash."""

from guardian.graph.risk_report import build_risk_report, risk_report_hash
from tests.graph_fixtures import K_REB, snapshot_v1, snapshot_v2, usdc

MERGE = {"kind": "merge_district", "into": "minh", "district_cap": usdc(30_000), "keys": []}


def merge_change():
    s = snapshot_v1()
    return {
        **MERGE,
        "keys": list(s.principals["minh"].keys)
        + [
            k
            for p in ("agent_data", "agent_intl_pay", "agent_rebalance", "svc_payment")
            for k in s.principals[p].keys
        ],
    }


def test_c1_merge():
    r = build_risk_report(snapshot_v1(), merge_change(), ["minh"])
    assert (r["before"]["enforced"], r["before"]["estimated"]) == (
        str(usdc(20_000)),
        str(usdc(100_000)),
    )
    assert (r["after"]["enforced"], r["after"]["estimated"]) == (str(usdc(30_000)),) * 2
    assert any(f["rule"].startswith("R1") for f in r["findingsBefore"])
    assert not any(
        f["rule"].startswith("R1") and f["principal_id"] == "minh" for f in r["findingsAfter"]
    )
    assert r["conflictOfInterest"] is False


def test_f1_request_12():
    ch = {"kind": "set_district_cap", "principal_id": "minh", "cap": usdc(130_000)}
    r = build_risk_report(snapshot_v2(), ch)
    assert (r["before"]["enforced"], r["after"]["enforced"]) == (
        str(usdc(30_000)),
        str(usdc(130_000)),
    )
    assert (r["before"]["percentOfMainTreasury"], r["after"]["percentOfMainTreasury"]) == (1.5, 6.5)


def test_f2_conflict_and_hash_stable():
    ch = {"kind": "move_key", "key": K_REB, "to": "huy"}
    a = build_risk_report(snapshot_v1(), ch, generated_at="x")
    b = build_risk_report(snapshot_v1(), ch, generated_at="y")
    assert a["conflictOfInterest"] and a["conflictedMembers"] == ["huy"]
    h = risk_report_hash(a)
    assert h == risk_report_hash(b) and h.startswith("0x") and len(h) == 66
    c = build_risk_report(snapshot_v1(), {"kind": "move_key", "key": K_REB, "to": "minh"})
    assert risk_report_hash(c) != h
