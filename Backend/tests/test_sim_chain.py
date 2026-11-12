"""SimChain: spec §13.1 T1-T7, T9-T13, I1/I2 (seeded random loops) + scene 4 end-to-end (§4.3)."""

import random

from guardian.agent_rebalance.rule_engine import decide
from guardian.chain.sim import SimChain
from guardian.shared.money import to_base
from guardian.shared.reason_codes import ReasonCode as R
from guardian.shared.scenario4 import SCENARIO4_DISTRICT, SCENARIO4_STEPS

T0 = 1_800_000_000 - 1_800_000_000 % 86400 + 3600  # 01:00 UTC
SEL = "0x" + "00" * 4


def mk():
    return SimChain(clock=lambda: T0)


def u(n):
    return to_base(n)


def swap(c, signer, dex="mock_dex", t_out="tTKB", amt=5_000, min_out=0):
    sel = c._meta[c._addr(dex)]["selector"]
    return c.swap(signer, dex, sel, "tUSDC", t_out, u(amt), min_out)


def spent(c, pid="minh"):
    return c.snapshot().principals[pid].spent_today


def test_seed_snapshot():
    s = mk().snapshot()
    assert (
        s.policy_version == 1 and s.vault_balance == u(200_000) and s.main_treasury == u(2_000_000)
    )
    assert len(s.keys) == 8 and len(s.principals) == 7
    assert s.principals["huy"].keys and len(s.principals["huy"].keys) == 2
    assert all(p.daily_cap == 0 for p in s.principals.values())
    assert {m.id: m.principal_id for m in s.council} == {"trang": None, "lan": "lan", "huy": "huy"}


def test_t1_t2_shared_cap_across_keys():
    c = mk()
    c.apply_policy_v2()
    for k in ("key_minh", "key_agent_data"):
        assert c.pay(k, "tUSDC", "vendor_cloud", u(15_000)).status == "ok"
    assert spent(c) == u(30_000)
    r = c.pay("key_svc_payment", "tUSDC", "vendor_cloud", u(1))
    assert r.status == "reverted" and r.reason_code == R.DISTRICT_DAILY_CAP


def test_t3_many_small_payments_never_exceed():
    c = mk()
    ok = 0
    for _ in range(40):
        r = c.pay("key_minh", "tUSDC", "vendor_cloud", u(1_000))
        ok += r.status == "ok"
    assert ok == 20 and r.reason_code == R.CARD_DAILY_CAP
    assert c.snapshot().keys[c._addr("key_minh")].spent_today == u(20_000)


def test_t4_day_rollover():
    c = mk()
    c.pay("key_minh", "tUSDC", "vendor_cloud", u(20_000))
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(1)).reason_code == R.CARD_DAILY_CAP
    c.advance_day()
    assert c.snapshot().keys[c._addr("key_minh")].spent_today == 0
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", u(1)).status == "ok"


def test_t5_allowlists_and_money_moves():
    c = mk()
    assert (
        c.pay("key_minh", "tUSDC", "stranger_wallet", u(1)).reason_code == R.RECIPIENT_NOT_ALLOWED
    )
    assert c.pay("key_minh", "tSCAM", "vendor_cloud", 1).reason_code == R.TOKEN_NOT_ALLOWED
    assert swap(c, "key_agent_rebalance", dex="evil_dex").reason_code == R.PROTOCOL_NOT_ALLOWED
    # wrong selector on the approved DEX
    r = c.swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", u(1), 0)
    assert r.reason_code == R.PROTOCOL_NOT_ALLOWED
    before = c.balance("vault", "tUSDC")
    r = c.pay("key_minh", "tUSDC", "vendor_cloud", u(100))
    assert r.status == "ok" and r.tx_hash and r.events[0].name == "Paid"
    assert c.balance("vault", "tUSDC") == before - u(100)
    assert c.balance("vendor_cloud", "tUSDC") == u(100)


def test_revert_has_hash_but_no_event_and_no_state_change():
    c = mk()
    n = len(c.events)
    r = c.pay("key_minh", "tUSDC", "stranger_wallet", u(1))
    assert r.status == "reverted" and r.tx_hash and r.block and r.events == []
    assert len(c.events) == n and spent(c) == 0
    assert r.simulated is True


def test_t6_check_order():
    c = mk()
    c.emergency_pause("trang")
    assert c.pay("key_minh", "tSCAM", "stranger_wallet", u(999)).reason_code == R.VAULT_PAUSED
    c.reset()
    # unregistered key (but allow-listed to be able to send): use a fresh address via direct sim
    assert c.simulate_pay("0x" + "11" * 20, "tUSDC", "vendor_cloud", 1) == R.KEY_NOT_REGISTERED
    # locked before token/recipient/caps
    c.emergency_lock("lan", "minh")
    assert c.simulate_pay("key_minh", "tSCAM", "stranger_wallet", u(999)) == R.DISTRICT_LOCKED
    # token before recipient, recipient before card cap, card cap before district cap
    c.reset()
    c.apply_policy_v2()
    assert c.simulate_pay("key_minh", "tSCAM", "stranger_wallet", u(999_999)) == R.TOKEN_NOT_ALLOWED
    assert (
        c.simulate_pay("key_minh", "tUSDC", "stranger_wallet", u(999_999))
        == R.RECIPIENT_NOT_ALLOWED
    )
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", u(40_000)) == R.CARD_DAILY_CAP
    c.pay("key_minh", "tUSDC", "vendor_cloud", u(20_000))
    c.pay("key_agent_data", "tUSDC", "vendor_cloud", u(10_000))
    assert c.simulate_pay("key_svc_payment", "tUSDC", "vendor_cloud", u(1)) == R.DISTRICT_DAILY_CAP
    n = c.block
    assert c.simulate_pay("key_svc_payment", "tUSDC", "vendor_cloud", u(1)) is not None
    assert c.block == n  # eth_call: no state change


def test_t7_lock_blocks_district_and_sets_none():
    c = mk()
    c.apply_policy_v2()
    r = c.emergency_lock("lan", "minh")
    assert r.status == "ok" and [e.name for e in r.events] == ["PrincipalLocked", "EmergencyAction"]
    snap = c.snapshot()
    assert snap.principals["minh"].locked
    assert all(not snap.keys[k].allow_listed for k in snap.principals["minh"].keys)
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.DISTRICT_LOCKED
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", 1).status == "blocked_at_protocol"


def test_t9_tighten_one_loosen_two_thirds_outsider_nothing():
    c = mk()
    k = c._addr("key_minh")
    assert c.lower_key_cap("huy", k, u(10_000)).status == "ok"
    assert c.lower_district_cap("trang", "minh", u(5_000)).status == "ok"  # from unset
    assert c.revoke_allow("lan", "recipient", "vendor_cloud").status == "ok"
    assert c.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.RECIPIENT_NOT_ALLOWED
    assert c.deactivate_key("huy", "key_huy_2").status == "ok"
    # loosening through the 1-member path reverts
    for call in (
        {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": "key_minh", "cap": u(50_000)}},
        {
            "target": "vault",
            "fn": "setPrincipalDailyCap",
            "args": {"principal_id": "minh", "cap": 0},
        },
        {
            "target": "vault",
            "fn": "setRecipientAllowed",
            "args": {"recipient": "stranger_wallet", "allowed": True},
        },
        {"target": "vault", "fn": "unlockPrincipal", "args": {"principal_id": "minh"}},
        {"target": "vault", "fn": "unpauseAll", "args": {}},
    ):
        r = c.direct_call("trang", call)
        assert r.status == "reverted" and r.error_raw == "NeedsThreshold", call
    # outsiders (a key, a stranger) can do nothing
    c.txallow.set_enabled(c._addr("stranger_wallet"))
    assert c.emergency_lock("stranger_wallet", "minh").error_raw == "NotCouncilMember"
    assert (
        c.emergency_pause("key_minh").error_raw == "NotCouncilMember"
    )  # allow-listed key, not a member
    r = c.propose("key_minh", "x", None, [], "0x00")
    assert r.status == "reverted" and r.proposal_id is None
    # loosening via proposal needs 2 approvals
    pid = c.propose(
        "trang",
        "raise",
        None,
        [
            {
                "target": "vault",
                "fn": "setKeyDailyCap",
                "args": {"key": "key_minh", "cap": u(50_000)},
            }
        ],
        "0x00",
    ).proposal_id
    r1 = c.approve("trang", pid)
    assert r1.status == "ok" and [e.name for e in r1.events] == ["Approved"]
    assert c.snapshot().keys[k].daily_cap == u(10_000)
    assert c.approve("trang", pid).error_raw == "AlreadyApproved"
    r2 = c.approve("huy", pid)
    assert [e.name for e in r2.events][-2:] == ["CapChanged", "Executed"]
    assert c.snapshot().keys[k].daily_cap == u(50_000)
    assert c.cancel("trang", pid).error_raw == "ProposalNotOpen"


def test_t10_conflict_of_interest_and_suggestion():
    c = mk()
    req = c._seed["request_12"]
    pid = c.propose("trang", req["title"], "minh", req["calls"], "0x01").proposal_id
    assert c.approve("lan", pid).status == "ok"
    pid2 = c.propose(
        "trang", "move agent to huy", "huy", req["suggestion"]["calls"], "0x02"
    ).proposal_id
    r = c.approve("huy", pid2)
    assert r.status == "reverted" and r.error_raw == "ConflictOfInterest" and r.events == []
    assert c.approve("lan", pid2).status == "ok" and c.approve("trang", pid2).status == "ok"
    assert c.snapshot().keys[c._addr("key_agent_rebalance")].principal_id == "huy"


def test_t11_target_outside_list_rejected():
    c = mk()
    r = c.propose("trang", "evil", None, [{"target": "token", "fn": "mint", "args": {}}], "0x00")
    assert r.status == "reverted" and r.error_raw == "TargetNotAllowed"
    r = c.propose(
        "trang", "evil", None, [{"target": "vault", "fn": "selfdestruct", "args": {}}], "0x"
    )
    assert r.status == "reverted" and r.proposal_id is None
    assert c.council.proposals == {}


def test_t12_pause_and_unpause_needs_two_thirds():
    c = mk()
    assert c.emergency_pause("huy").status == "ok"
    for k in ("key_minh", "key_huy_1", "key_lan"):
        assert c.pay(k, "tUSDC", "vendor_cloud", 1).reason_code == R.VAULT_PAUSED
    assert (
        c.direct_call("huy", {"target": "vault", "fn": "unpauseAll", "args": {}}).status
        == "reverted"
    )
    pid = c.propose(
        "trang", "unpause", None, [{"target": "vault", "fn": "unpauseAll", "args": {}}], "0x"
    ).proposal_id
    c.approve("trang", pid)
    assert c.snapshot().paused
    c.approve("lan", pid)
    assert not c.snapshot().paused
    assert c.pay("key_minh", "tUSDC", "vendor_cloud", 1).status == "ok"


def test_t13_swap_slippage_and_tokens_stay_in_vault():
    c = mk()
    r = swap(c, "key_agent_rebalance", min_out=u(5_000) * 10**12 + 1)
    assert (
        r.status == "reverted" and r.reason_code == R.SLIPPAGE and spent(c, "agent_rebalance") == 0
    )
    assert c.balance("vault", "tUSDC") == u(200_000)
    r = swap(c, "key_agent_rebalance", min_out=5_000 * 10**18)
    assert r.status == "ok"
    ev = r.events[0]
    assert ev.name == "Swapped" and ev.payload["amountOut"] == 5_000 * 10**18
    assert c.balance("vault", "tTKB") == 5_000 * 10**18
    assert c.balance("vault", "tUSDC") == u(195_000)
    assert ev.payload["keySpentAfter"] == u(5_000) and ev.payload["principalSpentAfter"] == u(5_000)


def test_ttkb_spend_counts_in_tusdc():
    c = mk()
    swap(c, "key_agent_rebalance")
    # selling tTKB back is counted via the 1:1 quote (5.000 more of the 20.000 key cap)
    sel = c._meta[c._addr("mock_dex")]["selector"]
    r = c.swap("key_agent_rebalance", "mock_dex", sel, "tTKB", "tUSDC", 5_000 * 10**18, 0)
    assert r.status == "ok" and r.events[0].payload["keySpentAfter"] == u(10_000)
    assert c.balance("vault", "tUSDC") == u(200_000)


def test_events_subscribe_and_since():
    c = mk()
    got = []
    unsub = c.subscribe(got.append)
    b0 = c.block
    c.pay("key_minh", "tUSDC", "vendor_cloud", u(1))
    c.pay("key_minh", "tUSDC", "stranger_wallet", u(1))  # reverted: no event
    assert [e.name for e in got] == ["Paid"] and got[0].simulated
    assert [e.name for e in c.events_since(b0)] == ["Paid"]
    assert c.events_since(c.block) == []
    unsub()
    c.pay("key_minh", "tUSDC", "vendor_cloud", u(1))
    assert len(got) == 1
    blocks = [e.block for e in c.events]
    assert blocks == sorted(blocks)


def test_reset_and_topup():
    c = mk()
    c.apply_policy_v2()
    c.pay("key_minh", "tUSDC", "vendor_cloud", u(1))
    c.topup(u(1_000))
    s = c.snapshot()
    assert s.vault_balance == u(200_000) + u(1_000) - u(1) and s.main_treasury == u(1_999_000)
    c.reset()
    s = c.snapshot()
    assert (
        s.policy_version == 1
        and s.vault_balance == u(200_000)
        and s.principals["minh"].daily_cap == 0
    )
    assert len(s.principals["minh"].keys) == 1 and not c.events


def test_policy_v2_snapshot():
    c = mk()
    c.apply_policy_v2()
    s = c.snapshot()
    assert s.policy_version == 2 and s.principals["minh"].daily_cap == u(30_000)
    assert len(s.principals["minh"].keys) == 5
    assert s.principals["agent_data"].keys == []
    assert len(s.declared_edges) == 4


# ---- I1 / I2 randomized (seeded) ----
def _random_action(c, rng, keys, rcpts):
    k = rng.choice(keys)
    if rng.random() < 0.3:
        return swap(c, k, t_out="tTKB", amt=rng.randint(1, 9_000))
    return c.pay(k, "tUSDC", rng.choice(rcpts), u(rng.randint(1, 9_000)))


def test_i1_principal_spent_never_exceeds_cap():
    rng = random.Random(1234)
    keys = [
        "key_minh",
        "key_agent_data",
        "key_agent_intl_pay",
        "key_agent_rebalance",
        "key_svc_payment",
    ]
    rcpts = ["vendor_cloud", "vendor_data_api", "stranger_wallet"]
    c = mk()
    c.apply_policy_v2()
    for i in range(600):
        if i % 150 == 149:
            c.advance_day()
        _random_action(c, rng, keys, rcpts)
        if rng.random() < 0.02:
            c.lower_district_cap("trang", "minh", u(rng.randint(1, 30_000)))
        s = c.snapshot().principals["minh"]
        # after a cap is lowered below what is already spent, no further spend is possible
        assert s.spent_today <= max(s.daily_cap, c.vault.spent_principal("minh", c.day_index))
    for e in c.events:
        if e.name in ("Paid", "Swapped"):
            assert e.payload["principalSpentAfter"] <= u(30_000)


def test_i2_locked_district_spent_does_not_increase():
    rng = random.Random(99)
    keys = [
        "key_minh",
        "key_agent_data",
        "key_agent_intl_pay",
        "key_agent_rebalance",
        "key_svc_payment",
    ]
    c = mk()
    c.apply_policy_v2()
    for _ in range(20):
        _random_action(c, rng, keys, ["vendor_cloud"])
    c.emergency_lock("lan", "minh")
    frozen = spent(c)
    for _ in range(200):
        r = _random_action(c, rng, keys, ["vendor_cloud", "vendor_data_api"])
        assert r.status == "blocked_at_protocol" and r.tx_hash is None
        assert spent(c) == frozen
    for k in keys:
        assert c.simulate_pay(k, "tUSDC", "vendor_cloud", 1) == R.DISTRICT_LOCKED


# ---- Scene 4 end to end ----
def test_scene4_end_to_end_on_policy_v2():
    c = mk()
    c.apply_policy_v2()
    snap = c.snapshot()
    d = decide(
        snap.vault_balance,
        0,
        snap.keys[c._addr("key_agent_rebalance")].daily_cap,
        snap.principals["minh"].daily_cap,
    )
    assert d and d.amount_in == u(5_000)
    for st in SCENARIO4_STEPS:
        p = st.params
        if st.action == "swap":
            sel = c._meta[c._addr(p["dex"])]["selector"]
            res = c.swap(
                st.signer,
                p["dex"],
                sel,
                p["token_in"],
                p["token_out"],
                p["amount_in"],
                p["min_out"],
            )
        elif st.action == "pay":
            res = c.pay(st.signer, p["token"], p["to"], p["amount"])
        elif st.action == "lock":
            res = c.emergency_lock(st.signer.removeprefix("council_"), p["principal_id"])
        else:
            res = c.raw_call(st.signer, p["target"], p["data"])
        assert res.status == st.expected_outcome, st.step
        assert (res.reason_code.value if res.reason_code else None) == st.expected_reason, st.step
        if st.expected_district_spent_after is not None:
            assert spent(c, SCENARIO4_DISTRICT) == st.expected_district_spent_after, st.step
        if st.step == 7:
            assert res.tx_hash is None and res.block is None and res.events == []
        elif st.expected_outcome == "reverted":
            assert res.tx_hash and res.events == []
        else:
            assert res.tx_hash and res.events
    snap = c.snapshot()
    assert snap.principals["minh"].locked
    assert all(not snap.keys[k].allow_listed for k in snap.principals["minh"].keys)
    assert [e.name for e in c.events if e.name in ("Paid", "Swapped")] == [
        "Swapped",
        "Paid",
        "Paid",
    ]
