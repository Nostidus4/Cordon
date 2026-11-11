"""Snapshot table spec §8.4 (v1 minh, v1 minh+huy, v2 minh, v2 + request #12)."""

from guardian.graph.simulate import simulate_compromise
from tests.graph_fixtures import K_DATA, K_HUY1, K_MINH, K_REB, snapshot_v1, snapshot_v2, usdc


def t(r):
    x = r["totals"]
    return int(x["youThink"]), int(x["enforced"]), int(x["estimated"]), x["percentOfMainTreasury"]


def test_v1_minh():
    r = simulate_compromise(snapshot_v1(), ["minh"])
    assert t(r) == (usdc(20_000), usdc(20_000), usdc(100_000), 5.0)
    assert len(r["reachedKeys"]) == 5
    nodes = set(r["highlights"]["nodeIds"])
    assert {f"k:{a}" for a in snapshot_v1().principals["minh"].keys} <= nodes
    assert {"k:" + K_MINH, "k:" + K_DATA, "k:" + K_REB} <= nodes
    assert sum(n.startswith("k:") for n in nodes) == 5
    via = {k["key"]: k["via"] for k in r["reachedKeys"]}
    assert via[K_MINH] == ["onchain"] and via[K_DATA] == ["declared"]
    assert "e:minh-admins-svc_payment" in r["highlights"]["edgeIds"]


def test_v1_minh_huy():
    r = simulate_compromise(snapshot_v1(), ["minh", "huy"])
    assert t(r) == (usdc(60_000), usdc(60_000), usdc(140_000), 7.0)
    assert K_HUY1 in {k["key"] for k in r["reachedKeys"]}


def test_v2_minh():
    r = simulate_compromise(snapshot_v2(), ["minh"])
    assert t(r) == (usdc(30_000), usdc(30_000), usdc(30_000), 1.5)


def test_v2_request_12():
    change = {"kind": "set_district_cap", "principal_id": "minh", "cap": usdc(130_000)}
    r = simulate_compromise(snapshot_v2(), ["minh"], change)
    assert t(r["before"]) == (usdc(30_000),) * 3 + (1.5,)
    assert t(r["after"]) == (usdc(130_000),) * 3 + (6.5,)


def test_locked_and_inactive_contribute_zero():
    s = snapshot_v1()
    s.principals["minh"].locked = True
    s.keys[K_DATA].allow_listed = False
    r = simulate_compromise(s, ["minh"])
    assert t(r)[1] == 0 and t(r)[2] == usdc(60_000)


def test_input_not_mutated():
    s = snapshot_v1()
    simulate_compromise(s, ["minh"], {"kind": "move_key", "key": K_REB, "to": "huy"})
    assert s.keys[K_REB].principal_id == "agent_rebalance"
