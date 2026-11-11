"""R1..R4 fire on seed; R1 disappears after policy v2."""

from guardian.graph.changes import apply_change
from guardian.graph.findings import R1, R2, R3, change_findings, compute_findings
from tests.graph_fixtures import K_REB, snapshot_v1, snapshot_v2, usdc


def by(fs, rule, pid=None):
    return [f for f in fs if f["rule"] == rule and (pid is None or f["principal_id"] == pid)]


def test_r1_v1_not_v2():
    f = by(compute_findings(snapshot_v1()), R1, "minh")
    assert len(f) == 1 and f[0]["severity"] == "HIGH"
    p = f[0]["proposal"]
    assert p["kind"] == "merge_district" and p["into"] == "minh"
    assert p["district_cap"] == usdc(30_000) and len(p["keys"]) == 5
    assert not by(compute_findings(snapshot_v2()), R1, "minh")


def test_r1_only_minh_on_v1_none_on_v2():
    assert [f["principal_id"] for f in by(compute_findings(snapshot_v1()), R1)] == ["minh"]
    assert not by(compute_findings(snapshot_v2()), R1)
    assert not by(compute_findings(snapshot_v1()), R1, "huy")


def test_r2_when_no_allowlisted_recipient():
    s = snapshot_v1()
    assert not by(compute_findings(s), R2)
    for r in s.recipients:
        r.allowed = False
    assert len(by(compute_findings(s), R2)) == 4


def test_r3_admin_is_operator():
    assert len(by(compute_findings(snapshot_v1()), R3, "minh")) == 1
    assert not by(compute_findings(snapshot_v2()), R3)


def test_r4_scene5():
    s = snapshot_v1()
    ch = {"kind": "move_key", "key": K_REB, "to": "huy"}
    f = change_findings(s, ch)
    assert len(f) == 1 and f[0]["severity"] == "HIGH"
    assert f[0]["data"]["members"] == ["huy"] and f[0]["data"]["conflictOfInterest"]
    assert f[0]["proposal"]["owner"] == "council"
    # not-a-member subject (minh) -> no R4
    assert not change_findings(s, {"kind": "move_key", "key": K_REB, "to": "minh"})
    # a loosening that does not raise huy exposure above threshold -> no R4
    assert apply_change(s, ch).keys[K_REB].principal_id == "huy"
