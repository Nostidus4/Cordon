"""ChainPort conformance suite (CHN-003): one set of scenarios, run on SimChain AND on L1Chain (anvil).

Every test takes the `net` fixture (parametrised `sim` / `l1`) and asserts literal expectations taken
from the spec (section 4.3 table, section 6 rules), so passing on both means the two implementations
behave identically for the observable contract: status, reason code, raw error name, counters, event
names and payload shapes, and the PolicySnapshot fields. Ignored by design: tx_hash, block, the
`simulated` flag, deployed token/DEX addresses, and the event `by` value (the Council contract on L1,
the acting member in the sim).
"""

from __future__ import annotations

from typing import Any

import pytest

from guardian.shared.reason_codes import ReasonCode as R
from guardian.shared.scenario4 import SCENARIO4_DISTRICT, SCENARIO4_STEPS, Scenario4Step
from tests.conformance.harness import SEL, Net, norm, u, view

V2_KEYS = [
    "key_agent_data",
    "key_agent_intl_pay",
    "key_agent_rebalance",
    "key_minh",
    "key_svc_payment",
]


# ------------------------------------------------------------------ helpers
def run_step(net: Net, st: Scenario4Step) -> Any:
    c, p = net.chain, st.params
    if st.action == "swap":
        return c.swap(
            st.signer, p["dex"], SEL, p["token_in"], p["token_out"], p["amount_in"], p["min_out"]
        )
    if st.action == "pay":
        return c.pay(st.signer, p["token"], p["to"], p["amount"])
    if st.action == "lock":
        return c.emergency_lock(st.signer.removeprefix("council_"), p["principal_id"])
    return c.raw_call(st.signer, p["target"], p["data"])


def district_spent(net: Net, pid: str = SCENARIO4_DISTRICT) -> int:
    return net.snap().principals[pid].spent_today


def key_spent(net: Net, seed_id: str) -> int:
    return net.snap().keys[net.addr(seed_id)].spent_today


def policy_v2(net: Net) -> None:
    results = net.chain.apply_policy_v2()
    assert [r.status for r in results] == ["ok", "ok"]


def shape(payload: dict[str, Any]) -> dict[str, str]:
    """Field name -> python type name: the payload shape that API consumers rely on."""
    return {k: type(v).__name__ for k, v in payload.items()}


def only_event(r: Any, name: str) -> dict[str, Any]:
    (ev,) = [e for e in r.events if e.name == name]
    return ev.payload  # type: ignore[no-any-return]


# ---------------------------------------------------------- 1. seed / snapshot
def test_seed_snapshot_policy_v1(net: Net) -> None:
    snap, v = net.snap(), view(net.snap())
    assert snap.policy_version == 1 and not snap.paused
    assert snap.vault_balance == u(200_000) and snap.main_treasury == u(2_000_000)
    assert sorted(v["principals"]) == [
        "agent_data",
        "agent_intl_pay",
        "agent_rebalance",
        "huy",
        "lan",
        "minh",
        "svc_payment",
    ]
    assert v["principals"]["huy"]["keys"] == ["key_huy_1", "key_huy_2"]
    assert all(p["daily_cap"] == 0 and p["spent_today"] == 0 for p in v["principals"].values())
    assert not any(p["locked"] for p in v["principals"].values())
    caps = {k: x["daily_cap"] for k, x in v["keys"].items()}
    assert caps["key_lan"] == u(10_000) and caps["key_minh"] == u(20_000)
    assert all(
        x["active"] and x["allow_listed"] and x["spent_today"] == 0 for x in v["keys"].values()
    )
    assert [m[0] for m in v["council"]] == ["trang", "lan", "huy"]
    assert [m[3] for m in v["council"]] == [None, "lan", "huy"]  # Trang bound to no district
    assert {k: x[1] for k, x in v["recipients"].items()} == {
        "vendor_data_api": True,
        "vendor_cloud": True,
        "vendor_intl_design": True,
        "stranger_wallet": False,
    }
    assert v["protocols"]["mock_dex"][2] is True and v["protocols"]["evil_dex"][2] is False
    assert v["tokens"] == {"tUSDC": (6, True), "tTKB": (18, True), "tSCAM": (18, False)}
    assert len(v["declared_edges"]) == 4


def _propose(c: Any, *args: Any) -> int:
    r = c.propose(*args)
    assert r.ok and r.proposal_id is not None, r.error_raw
    return r.proposal_id


# ----------------------------------------------------- 2. scene 4 (spec 4.3)
def test_scene4_policy_v2_through_the_council(net: Net) -> None:
    c = net.chain
    pid = _propose(
        c,
        "lan",
        net.seed["policy_v2"]["title"],
        "minh",
        net.seed["policy_v2"]["calls"],
        "0x" + "11" * 32,
    )
    r1 = c.approve("lan", pid)
    assert norm(r1)["events"] == ["Approved"] and net.snap().policy_version == 1
    r2 = c.approve("trang", pid)
    assert r2.status == "ok"
    names = [e.name for e in r2.events]
    assert names[0] == "Approved" and names[-2:] == ["PolicyVersionBumped", "Executed"]
    assert names.count("KeyMoved") == 4 and "CapChanged" in names
    snap = net.snap()
    assert snap.policy_version == 2
    assert snap.principals["minh"].daily_cap == u(30_000)
    assert sorted(snap.keys[k].seed_id for k in snap.principals["minh"].keys) == V2_KEYS
    assert c.proposal_state(pid).status == "executed"


def test_scene4_table_steps_0_to_5(net: Net) -> None:
    policy_v2(net)
    for st in SCENARIO4_STEPS:
        if st.action in ("lock", "raw_call"):
            continue
        r = run_step(net, st)
        label = f"step {st.step}"
        assert r.status == st.expected_outcome, label
        assert (r.reason_code.value if r.reason_code else None) == st.expected_reason, label
        assert r.tx_hash, label  # reverted transactions still land on chain with a hash
        assert district_spent(net) == st.expected_district_spent_after, label
        if r.status == "reverted":
            assert r.events == [] and r.error_raw, label
    assert [s.expected_district_spent_after for s in SCENARIO4_STEPS if s.step in (0, 3, 4)] == [
        u(5_000),
        u(15_000),
        u(25_000),
    ]
    assert key_spent(net, "key_agent_rebalance") == u(5_000)  # the evil_dex swap did not count
    assert key_spent(net, "key_svc_payment") == 0
    assert net.chain.balance("vault", "tUSDC") == u(200_000) - u(25_000)


def test_scene4_lock_then_step7_blocked_at_protocol(net: Net) -> None:
    policy_v2(net)
    for st in SCENARIO4_STEPS[:6]:
        run_step(net, st)
    lock = next(s for s in SCENARIO4_STEPS if s.action == "lock")
    r = run_step(net, lock)
    assert r.status == "ok" and r.events[0].name == "PrincipalLocked"
    assert [e.name for e in r.events].count("AllowListRoleSet") == 5  # one per key of the district
    assert {e.payload["role"] for e in r.events if e.name == "AllowListRoleSet"} == {0}
    snap = net.snap()
    assert snap.principals["minh"].locked and snap.principals["minh"].spent_today == u(25_000)
    assert all(
        not snap.keys[k].allow_listed and snap.keys[k].active for k in snap.principals["minh"].keys
    )
    step7 = SCENARIO4_STEPS[-1]
    r = run_step(net, step7)
    assert r.status == "blocked_at_protocol" and r.reason_code == R.BLOCKED_AT_PROTOCOL
    assert r.tx_hash is None and r.block is None and r.events == [] and r.error_raw
    assert district_spent(net) == u(25_000)  # nothing moved after the lock


def test_scene4_attacker_total_is_20000_not_100000(net: Net) -> None:
    """Spec 4.3: with Cordon the attacker (steps 1-5) gets out 20.000, not 5 x 20.000."""
    policy_v2(net)
    assert run_step(
        net, SCENARIO4_STEPS[0]
    ).ok  # the morning agent swap (5.000) is not the attacker
    moved = 0
    for st in SCENARIO4_STEPS[1:6]:
        r = run_step(net, st)
        if r.status == "ok":
            moved += st.params["amount"]
    assert moved == u(20_000) and district_spent(net) == u(25_000)


# --------------------------------------------------------- 3. reason codes
def test_every_spend_reason_code(net: Net) -> None:
    c = net.chain
    policy_v2(net)
    dex = ("mock_dex", SEL, "tUSDC", "tTKB")
    cases: list[tuple[str, Any, str]] = [
        (
            "RECIPIENT_NOT_ALLOWED",
            lambda: c.pay("key_agent_intl_pay", "tUSDC", "stranger_wallet", u(1)),
            "RecipientNotAllowed",
        ),
        (
            "TOKEN_NOT_ALLOWED",
            lambda: c.pay("key_minh", "tSCAM", "vendor_cloud", 1),
            "TokenNotAllowed",
        ),
        (
            "PROTOCOL_NOT_ALLOWED",
            lambda: c.swap("key_agent_rebalance", "evil_dex", SEL, "tUSDC", "tTKB", u(1), 0),
            "ProtocolNotAllowed",
        ),
        (
            "SLIPPAGE",
            lambda: c.swap(
                "key_agent_rebalance", dex[0], dex[1], dex[2], dex[3], u(100), u(100) * 10**12 + 1
            ),
            "SlippageTooHigh",
        ),
        (
            "CARD_DAILY_CAP",
            lambda: c.pay("key_minh", "tUSDC", "vendor_cloud", u(20_001)),
            "KeyDailyCapExceeded",
        ),
    ]
    for code, send, raw in cases:
        r = send()
        assert (r.status, r.reason_code, r.error_raw) == ("reverted", R(code), raw), code
        assert r.tx_hash and r.events == [], code
    # district cap: 20.000 + 10.000 are in, the next payment from another key of the district fails
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(20_000)).ok
    assert c.pay("key_agent_data", "tUSDC", "vendor_cloud", u(10_000)).ok
    r = c.pay("key_svc_payment", "tUSDC", "vendor_cloud", u(1))
    assert (r.status, r.reason_code, r.error_raw) == (
        "reverted",
        R.DISTRICT_DAILY_CAP,
        "PrincipalDailyCapExceeded",
    )


def test_unregistered_and_unknown_signers(net: Net) -> None:
    stranger = "0x" + "11" * 20
    c = net.chain
    assert c.simulate_pay(stranger, "tUSDC", "vendor_cloud", 1) == R.KEY_NOT_REGISTERED
    assert c.simulate_swap(stranger, "mock_dex", SEL, "tUSDC", "tTKB", 1, 0) == R.KEY_NOT_REGISTERED


def test_pause_lock_and_check_order(net: Net) -> None:
    c = net.chain
    policy_v2(net)
    # order: paused > locked > token > recipient > card cap > district cap (spec 6.3)
    bad = ("key_minh", "tSCAM", "stranger_wallet", u(999_999))
    assert c.simulate_pay(*bad) == R.TOKEN_NOT_ALLOWED
    assert (
        c.simulate_pay("key_minh", "tUSDC", "stranger_wallet", u(999_999))
        == R.RECIPIENT_NOT_ALLOWED
    )
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", u(40_000)) == R.CARD_DAILY_CAP
    assert c.lower_district_cap("trang", "minh", u(5_000)).ok
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", u(6_000)) == R.DISTRICT_DAILY_CAP
    assert c.emergency_lock("lan", "minh").ok
    assert c.simulate_pay(*bad) == R.DISTRICT_LOCKED  # locked wins over token/recipient/caps
    assert c.emergency_pause("huy").ok and net.snap().paused
    assert c.simulate_pay(*bad) == R.VAULT_PAUSED  # paused wins over everything
    assert c.simulate_pay("key_lan", "tUSDC", "vendor_cloud", 1) == R.VAULT_PAUSED
    r = c.pay("key_lan", "tUSDC", "vendor_cloud", 1)
    assert (r.status, r.reason_code, r.error_raw) == ("reverted", R.VAULT_PAUSED, "VaultPaused")
    r = c.pay("key_huy_1", "tUSDC", "vendor_cloud", 1)
    assert r.reason_code == R.VAULT_PAUSED


def test_locked_district_reverts_for_a_key_that_is_still_listed(net: Net) -> None:
    """Locking another district leaves `lan` untouched; locking `minh` only affects minh's keys."""
    c = net.chain
    assert c.emergency_lock("huy", "minh").ok
    r = c.pay("key_lan", "tUSDC", "vendor_cloud", 1)
    assert r.status == "ok"
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.DISTRICT_LOCKED


def test_delisted_key_is_blocked_at_protocol_for_every_spend_kind(net: Net) -> None:
    c = net.chain
    assert c.emergency_lock("lan", "minh").ok
    for r in (
        c.pay("key_minh", "tUSDC", "vendor_cloud", 1),
        c.swap("key_minh", "mock_dex", SEL, "tUSDC", "tTKB", 1, 0),
        c.raw_call("key_minh", "tSCAM", "0x095ea7b3"),
    ):
        assert r.status == "blocked_at_protocol" and r.reason_code == R.BLOCKED_AT_PROTOCOL
        assert r.tx_hash is None and r.block is None and r.events == [] and r.error_raw


def test_simulate_matches_the_real_reason_and_changes_nothing(net: Net) -> None:
    c = net.chain
    policy_v2(net)
    before = view(net.snap())
    probes = [
        ("key_minh", "tUSDC", "stranger_wallet", 1, R.RECIPIENT_NOT_ALLOWED),
        ("key_minh", "tSCAM", "vendor_cloud", 1, R.TOKEN_NOT_ALLOWED),
        ("key_minh", "tUSDC", "vendor_cloud", u(30_000), R.CARD_DAILY_CAP),
        ("key_minh", "tUSDC", "vendor_cloud", 1, None),
    ]
    for key, token, to, amount, want in probes:
        assert c.simulate_pay(key, token, to, amount) == want
    assert c.simulate_swap("key_agent_rebalance", "evil_dex", SEL, "tUSDC", "tTKB", 1, 0) == (
        R.PROTOCOL_NOT_ALLOWED
    )
    assert c.simulate_swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", 1, 0) is None
    assert view(net.snap()) == before  # eth_call / dry run: no state change
    for key, token, to, amount, want in probes[:3]:  # and the real tx gives the same reason
        assert c.pay(key, token, to, amount).reason_code == want


def test_reverted_tx_changes_no_counter(net: Net) -> None:
    c = net.chain
    policy_v2(net)
    before = view(net.snap())
    r = c.pay("key_agent_intl_pay", "tUSDC", "stranger_wallet", u(20_000))
    assert r.status == "reverted" and r.tx_hash
    after = view(net.snap())
    assert after == before


# ---------------------------------------------------- 4. council: tighten
def test_tighten_with_one_member(net: Net) -> None:
    c = net.chain
    k = net.addr("key_minh")
    assert c.lower_key_cap("huy", k, u(10_000)).ok
    assert c.lower_district_cap("trang", "minh", u(5_000)).ok  # from unset = tightening
    assert c.revoke_allow("lan", "recipient", "vendor_cloud").ok
    assert c.revoke_allow("lan", "protocol", "mock_dex").ok
    assert c.simulate_swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", 1, 0) == (
        R.PROTOCOL_NOT_ALLOWED
    )
    assert c.revoke_allow("lan", "token", "tTKB").ok
    assert c.deactivate_key("huy", "key_huy_2").ok
    snap = net.snap()
    v = view(snap)
    assert snap.keys[k].daily_cap == u(10_000) and snap.principals["minh"].daily_cap == u(5_000)
    assert v["recipients"]["vendor_cloud"][1] is False
    assert v["protocols"]["mock_dex"][2] is False
    assert v["tokens"]["tTKB"] == (18, False)
    assert v["keys"]["key_huy_2"]["active"] is False and v["keys"]["key_huy_1"]["active"] is True
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.RECIPIENT_NOT_ALLOWED
    assert c.simulate_swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", 1, 0) == (
        R.TOKEN_NOT_ALLOWED  # token is checked before the protocol (spec 6.3)
    )


def test_loosening_through_the_one_member_path_is_rejected(net: Net) -> None:
    c = net.chain
    k = net.addr("key_minh")
    for r in (
        c.lower_key_cap("trang", k, u(50_000)),  # above the current cap
        c.lower_district_cap("trang", "minh", 0),  # 0 = unlimited, never a tightening
    ):
        assert r.status == "reverted" and r.error_raw == "NotTightening" and r.tx_hash
        assert r.events == []
    assert c.lower_key_cap("huy", k, 0).ok  # lowering to 0 is allowed ...
    r = c.lower_key_cap("huy", k, u(1))  # ... but raising it back from 0 is loosening
    assert r.status == "reverted" and r.error_raw == "NotTightening"
    assert net.snap().keys[k].daily_cap == 0


def test_only_council_members_can_tighten(net: Net) -> None:
    c = net.chain
    for r in (c.emergency_pause("key_minh"), c.emergency_lock("key_lan", "minh")):
        assert r.status == "reverted" and r.error_raw == "NotCouncilMember" and r.events == []
    assert not net.snap().paused and not net.snap().principals["minh"].locked
    assert c.emergency_pause("huy").ok and net.snap().paused


def test_emergency_lock_is_one_tx_and_delists_all_keys(net: Net) -> None:
    c = net.chain
    policy_v2(net)
    r = c.emergency_lock("lan", "minh")
    assert [e.name for e in r.events] == [
        "PrincipalLocked",
        *["AllowListRoleSet"] * 5,
        "EmergencyAction",
    ]
    snap = net.snap()
    assert len(snap.principals["minh"].keys) == 5 and snap.principals["minh"].locked
    assert all(not snap.keys[k].allow_listed for k in snap.principals["minh"].keys)
    assert snap.keys[net.addr("key_lan")].allow_listed  # other districts keep their access


# ----------------------------------------------------- 5. council: loosen 2/3
def test_loosen_needs_two_of_three_and_bumps_the_version_once(net: Net) -> None:
    c = net.chain
    calls = [
        {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": "key_minh", "cap": u(50_000)}}
    ]
    pid = _propose(c, "trang", "raise", "minh", calls, "0x" + "01" * 32)
    st = c.proposal_state(pid)
    assert (st.status, st.approvals, st.approved_by) == ("open", 0, [])
    r1 = c.approve("trang", pid)
    assert r1.ok and [e.name for e in r1.events] == ["Approved"]
    assert net.snap().policy_version == 1  # one approval changes nothing
    assert net.snap().keys[net.addr("key_minh")].daily_cap == u(20_000)
    again = c.approve("trang", pid)
    assert again.status == "reverted" and again.error_raw == "AlreadyApproved"
    r2 = c.approve("huy", pid)
    assert r2.ok and [e.name for e in r2.events][-3:] == [
        "CapChanged",
        "PolicyVersionBumped",
        "Executed",
    ]
    assert net.snap().policy_version == 2
    assert net.snap().keys[net.addr("key_minh")].daily_cap == u(50_000)
    st = c.proposal_state(pid)
    assert (st.status, st.approvals) == ("executed", 2)
    assert sorted(st.approved_by) == sorted([net.addr("council_trang"), net.addr("council_huy")])
    r = c.cancel("trang", pid)
    assert r.status == "reverted" and r.error_raw == "ProposalNotOpen"
    r = c.approve("lan", pid)
    assert r.error_raw == "ProposalNotOpen"


def test_unpause_is_a_loosening_and_needs_two_of_three(net: Net) -> None:
    c = net.chain
    assert c.emergency_pause("huy").ok
    pid = _propose(
        c, "trang", "unpause", None, [{"target": "vault", "fn": "unpauseAll", "args": {}}], "0x"
    )
    assert c.approve("trang", pid).ok and net.snap().paused
    assert c.approve("lan", pid).ok and not net.snap().paused
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", 1).ok


def test_conflict_of_interest_and_the_suggested_alternative(net: Net) -> None:
    c = net.chain
    req = net.seed["request_12"]
    pid = _propose(c, "trang", req["title"], "minh", req["calls"], "0x" + "02" * 32)
    assert c.approve("lan", pid).ok  # no member bound to minh
    sug = req["suggestion"]["calls"]
    pid2 = _propose(c, "trang", "move agent to huy", "huy", sug, "0x" + "03" * 32)
    r = c.approve("huy", pid2)  # Huy is the district that would receive the key
    assert r.status == "reverted" and r.error_raw == "ConflictOfInterest" and r.events == []
    assert c.proposal_state(pid2).approvals == 0
    assert c.approve("lan", pid2).ok and c.approve("trang", pid2).ok
    assert net.snap().keys[net.addr("key_agent_rebalance")].principal_id == "huy"


def test_conflict_of_interest_is_derived_from_the_calls(net: Net) -> None:
    """The declared subject is minh, but the call also moves a key out of huy's district."""
    c = net.chain
    move = [{"target": "registry", "fn": "moveKey", "args": {"key": "key_huy_1", "to": "minh"}}]
    pid = _propose(c, "trang", "huy key to minh", "minh", move, "0x" + "04" * 32)
    r = c.approve("huy", pid)
    assert r.error_raw == "ConflictOfInterest" and r.events == []
    assert c.approve("lan", pid).ok and c.approve("trang", pid).ok
    assert net.snap().keys[net.addr("key_huy_1")].principal_id == "minh"


def test_propose_errors_return_the_same_revert(net: Net) -> None:
    c = net.chain
    bad: list[tuple[str, str | None, list[dict[str, Any]], str, str]] = [
        ("trang", None, [{"target": "token", "fn": "mint", "args": {}}], "TargetNotAllowed", "x"),
        (
            "trang",
            None,
            [{"target": "vault", "fn": "selfdestruct", "args": {}}],
            "UnknownCall",
            "x",
        ),
        (
            "trang",
            "huy",
            [{"target": "vault", "fn": "lockPrincipal", "args": {"principal_id": "minh"}}],
            "SubjectMismatch",
            "x",
        ),
        (
            "key_minh",
            None,
            [{"target": "vault", "fn": "pauseAll", "args": {}}],
            "NotCouncilMember",
            "x",
        ),
    ]
    for member, subject, calls, name, _ in bad:
        r = c.propose(member, "x", subject, calls, "0x")
        assert r.status == "reverted" and r.proposal_id is None, name
        assert r.error_raw == name, name
    r = c.propose("trang", "empty", None, [], "0x")
    assert r.status == "reverted" and r.proposal_id is None
    assert net.snap().policy_version == 1


def test_cancel_by_proposer_only_and_unknown_proposal(net: Net) -> None:
    c = net.chain
    calls = [{"target": "vault", "fn": "unpauseAll", "args": {}}]
    pid = _propose(c, "trang", "unpause", None, calls, "0x")
    r = c.cancel("lan", pid)
    assert r.status == "reverted" and r.error_raw == "NotProposer"
    assert c.cancel("trang", pid).ok and c.proposal_state(pid).status == "cancelled"
    r = c.approve("lan", pid)
    assert r.status == "reverted" and r.error_raw == "ProposalNotOpen"
    with pytest.raises(KeyError):
        c.proposal_state(pid + 100)


# --------------------------------------------------------- 6. time / events
def test_day_rollover_resets_the_counters(net: Net) -> None:
    c = net.chain
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(20_000)).ok
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(1)).reason_code == R.CARD_DAILY_CAP
    day = net.snap().day_index
    net.advance_day()
    snap = net.snap()
    assert snap.day_index == day + 1
    assert snap.keys[net.addr("key_minh")].spent_today == 0
    assert snap.principals["minh"].spent_today == 0
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(1)).ok
    assert key_spent(net, "key_minh") == u(1) and district_spent(net) == u(1)


def test_day_rollover_reopens_a_district_cap(net: Net) -> None:
    c = net.chain
    policy_v2(net)
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(20_000)).ok
    assert c.pay("key_agent_data", "tUSDC", "vendor_cloud", u(10_000)).ok
    assert (
        c.pay("key_svc_payment", "tUSDC", "vendor_cloud", u(1)).reason_code == R.DISTRICT_DAILY_CAP
    )
    net.advance_day()
    assert c.pay("key_svc_payment", "tUSDC", "vendor_cloud", u(1)).ok
    assert district_spent(net) == u(1)


def test_ttkb_spend_counts_in_tusdc_value(net: Net) -> None:
    c = net.chain
    r = c.swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", u(5_000), 5_000 * 10**18)
    assert r.ok and [e.name for e in r.events] == ["Swapped"]
    assert only_event(r, "Swapped")["amountOut"] == 5_000 * 10**18
    assert c.balance("vault", "tUSDC") == u(195_000)
    assert c.balance("vault", "tTKB") == 5_000 * 10**18  # tokens stay in the vault
    assert key_spent(net, "key_agent_rebalance") == u(5_000)
    assert district_spent(net, "agent_rebalance") == u(5_000)


# TypeName per payload field, as API consumers read it (addresses and ids are `str`).
PAYLOAD_SHAPES: dict[str, dict[str, str]] = {
    "Paid": {
        "key": "str",
        "principalId": "str",
        "token": "str",
        "to": "str",
        "amount": "int",
        "day": "int",
        "keySpentAfter": "int",
        "principalSpentAfter": "int",
        "memoHash": "str",
    },
    "Swapped": {
        "key": "str",
        "principalId": "str",
        "dex": "str",
        "tokenIn": "str",
        "tokenOut": "str",
        "amountIn": "int",
        "amountOut": "int",
        "day": "int",
        "keySpentAfter": "int",
        "principalSpentAfter": "int",
        "reasonHash": "str",
    },
    "PrincipalLocked": {"principalId": "str", "by": "str"},
    "Paused": {"by": "str"},
    "AllowListRoleSet": {"key": "str", "role": "int", "by": "str"},
    "EmergencyAction": {"member": "str", "action": "str", "subject": "str"},
    "CapChanged": {"kind": "str", "subject": "str", "oldCap": "int", "newCap": "int"},
    "AllowChanged": {"kind": "str", "subject": "str", "selector": "NoneType", "allowed": "bool"},
    "KeyDeactivated": {"key": "str"},
    "Proposed": {
        "id": "int",
        "proposer": "str",
        "subjectPrincipal": "str",
        "title": "str",
        "riskReportHash": "str",
    },
    "Approved": {"id": "int", "member": "str"},
    "Executed": {"id": "int"},
    "Cancelled": {"id": "int"},
    "PolicyVersionBumped": {"version": "int"},
    "KeyMoved": {"key": "str", "fromId": "str", "toId": "str"},
}


def test_event_payload_shapes_and_values(net: Net) -> None:
    c = net.chain
    key_minh = net.addr("key_minh")
    seen: dict[str, dict[str, Any]] = {}

    def keep(r: Any) -> Any:
        for e in r.events:
            seen.setdefault(e.name, e.payload)
            assert e.simulated is (net.kind == "sim") and e.tx_hash and e.ts > 0
        return r

    paid = keep(c.pay("key_minh", "tUSDC", "vendor_cloud", u(100), "invoice-1"))
    p = only_event(paid, "Paid")
    assert (p["key"], p["principalId"], p["amount"]) == (key_minh, "minh", u(100))
    assert (p["keySpentAfter"], p["principalSpentAfter"]) == (u(100), u(100))
    assert p["to"] == net.addr("vendor_cloud") and p["day"] == net.snap().day_index
    sw = keep(c.swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", u(5_000), 0))
    assert only_event(sw, "Swapped")["amountIn"] == u(5_000)
    keep(c.lower_key_cap("huy", net.addr("key_huy_1"), u(5)))
    keep(c.revoke_allow("lan", "recipient", "vendor_cloud"))
    keep(c.deactivate_key("huy", "key_huy_2"))
    keep(c.emergency_pause("trang"))
    keep(c.emergency_lock("lan", "minh"))
    pid_move = _propose(
        c,
        "trang",
        "move",
        "huy",
        [{"target": "registry", "fn": "moveKey", "args": {"key": "key_lan", "to": "huy"}}],
        "0x" + "05" * 32,
    )
    pid_unpause = _propose(
        c, "trang", "unpause", None, [{"target": "vault", "fn": "unpauseAll", "args": {}}], "0x"
    )
    for ev in c.events_since(0):  # `propose` returns the id, so read its event from the log
        if ev.name == "Proposed":
            seen.setdefault("Proposed", ev.payload)
    keep(c.approve("trang", pid_move))
    keep(c.approve("huy", pid_unpause))
    keep(c.approve("trang", pid_unpause))  # executes
    keep(c.cancel("trang", pid_move))
    for name, want in PAYLOAD_SHAPES.items():
        if name in ("KeyMoved",):
            continue  # needs an executed move; covered in the Council scenarios
        assert name in seen, f"{name} was not emitted"
        got = shape(seen[name])
        if name == "Proposed":
            got["subjectPrincipal"] = "str"  # None (general) or an id
        assert got == want, name
    lock = seen["PrincipalLocked"]
    assert lock["principalId"] == "minh"
    ea = seen["EmergencyAction"]
    assert ea["action"] == "lockPrincipal" or ea["action"] in {
        "setKeyDailyCap",
        "setRecipientAllowed",
        "deactivateKey",
        "pauseAll",
    }
    assert seen["AllowListRoleSet"]["key"] == key_minh and seen["AllowListRoleSet"]["role"] == 0


def test_emergency_action_subjects(net: Net) -> None:
    c = net.chain
    subj = {
        "lock": only_event(c.emergency_lock("lan", "minh"), "EmergencyAction")["subject"],
        "deact": only_event(c.deactivate_key("huy", "key_huy_2"), "EmergencyAction")["subject"],
        "recipient": only_event(
            c.revoke_allow("lan", "recipient", "vendor_cloud"), "EmergencyAction"
        )["subject"],
        "pause": only_event(c.emergency_pause("huy"), "EmergencyAction")["subject"],
    }
    assert subj == {
        "lock": "minh",
        "deact": net.addr("key_huy_2"),
        "recipient": net.addr("vendor_cloud"),
        "pause": "",
    }


def test_events_since_returns_what_the_transactions_emitted(net: Net) -> None:
    c = net.chain
    head = net.snap().block
    r1 = c.pay("key_minh", "tUSDC", "vendor_cloud", u(1))
    r2 = c.pay("key_lan", "tUSDC", "vendor_cloud", u(2))
    assert c.pay("key_minh", "tUSDC", "stranger_wallet", u(1)).status == "reverted"
    evs = c.events_since(head)
    assert [e.name for e in evs] == ["Paid", "Paid"]  # a reverted tx emits nothing
    assert [e.tx_hash for e in evs] == [r1.tx_hash, r2.tx_hash]
    assert [e.payload["amount"] for e in evs] == [u(1), u(2)]
    assert evs == sorted(evs, key=lambda e: (e.block, e.log_index))
    assert c.events_since(net.snap().block) == []


def test_vault_and_snapshot_address_fields(net: Net) -> None:
    c = net.chain
    assert c.vault_addr.startswith("0x") and len(c.vault_addr) == 42
    assert net.snap().keys[net.addr("key_minh")].address == net.addr("key_minh")
    assert c.balance("vault", "tUSDC") == net.snap().vault_balance == u(200_000)


# ------------------------------------------- 7. the suite must catch a bug
def test_suite_fails_when_the_adapter_checks_in_the_wrong_order(
    net: Net, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Meta check (acceptance): inject a wrong check order and the spend-reason scenario fails."""
    real = net.chain.pay

    def wrong_order(signer: str, token: str, to: str, amount: int, memo: str = "") -> Any:
        r = real(signer, token, to, amount, memo)
        if r.reason_code == R.TOKEN_NOT_ALLOWED:  # as if the recipient were checked first
            r.reason_code = R.RECIPIENT_NOT_ALLOWED
        return r

    monkeypatch.setattr(net.chain, "pay", wrong_order)
    with pytest.raises(AssertionError):
        test_every_spend_reason_code(net)
