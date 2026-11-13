"""CHN-002 acceptance on anvil with the real contracts: spend writes, Council writes, error mapping."""

from __future__ import annotations

import logging

import pytest
from eth_account import Account

from guardian.chain.client import ChainWriteError
from guardian.chain.l1 import L1Chain
from guardian.chain.l1.signers import LocalSigner, SignerError, SignerRegistry
from guardian.shared.money import to_base
from guardian.shared.reason_codes import ReasonCode as R
from tests.chain_l1.anvil_env import Env

SEL = "0x10b84623"  # MockDEX swap selector in the seed
u = to_base


def _head(env: Env) -> int:
    return int(env.w3.eth.block_number)


# ------------------------------------------------------------------ spend
def test_pay_to_stranger_reverts_with_hash_and_reason(l1: L1Chain, env: Env) -> None:
    r = l1.pay("key_agent_intl_pay", "tUSDC", "stranger_wallet", u(20_000))
    assert r.status == "reverted" and r.reason_code == R.RECIPIENT_NOT_ALLOWED
    assert r.tx_hash and r.tx_hash.startswith("0x") and r.block
    assert r.error_raw == "RecipientNotAllowed" and r.events == [] and r.simulated is False
    receipt = env.w3.eth.get_transaction_receipt(r.tx_hash)  # the reverted tx really is on chain
    assert receipt["status"] == 0


def test_pay_ok_has_paid_event_and_moves_money(l1: L1Chain, env: Env) -> None:
    vendor = env.seed["recipients"][1]["address"]
    r = l1.pay("key_minh", "tUSDC", "vendor_cloud", u(100), memo="invoice-1")
    assert r.status == "ok" and r.reason_code is None and r.error_raw is None
    (ev,) = r.events
    assert ev.name == "Paid" and ev.simulated is False and ev.tx_hash == r.tx_hash
    assert ev.payload["amount"] == u(100) and ev.payload["principalId"] == "minh"
    assert env.tokens["tUSDC"].functions.balanceOf(vendor).call() == u(100)
    assert l1.snapshot().keys[env.seed["keys"][0]["address"]].spent_today == u(100)


def test_swap_through_evil_dex_is_protocol_not_allowed(l1: L1Chain) -> None:
    r = l1.swap("key_agent_rebalance", "evil_dex", SEL, "tUSDC", "tTKB", u(5_000), 0)
    assert r.status == "reverted" and r.reason_code == R.PROTOCOL_NOT_ALLOWED and r.tx_hash


def test_swap_slippage_and_ok(l1: L1Chain) -> None:
    too_much = u(5_000) * 10**12 + 1
    r = l1.swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", u(5_000), too_much)
    assert r.status == "reverted" and r.reason_code == R.SLIPPAGE
    r = l1.swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", u(5_000), 5_000 * 10**18)
    assert r.status == "ok" and [e.name for e in r.events] == ["Swapped"]
    assert r.events[0].payload["amountOut"] == 5_000 * 10**18


def test_district_cap_after_25k_spent(l1: L1Chain) -> None:
    assert all(r.ok for r in l1.apply_policy_v2())
    assert l1.swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", u(5_000), 0).ok
    assert l1.pay("key_agent_data", "tUSDC", "vendor_data_api", u(10_000)).ok
    assert l1.pay("key_minh", "tUSDC", "vendor_cloud", u(10_000)).ok
    r = l1.pay("key_svc_payment", "tUSDC", "vendor_cloud", u(10_000))
    assert r.status == "reverted" and r.reason_code == R.DISTRICT_DAILY_CAP and r.tx_hash


def test_card_cap_and_unregistered_key(l1: L1Chain, env: Env) -> None:
    assert l1.pay("key_lan", "tUSDC", "vendor_cloud", u(10_001)).reason_code == R.CARD_DAILY_CAP
    # a key the seed does not know: local (private-key) signer path, still a real reverted tx
    acct = Account.create()
    env.w3.provider.make_request("anvil_setBalance", [acct.address, hex(10**18)])
    env.w3.provider.make_request("anvil_setCode", [acct.address, "0x"])
    env.allowlist.functions.__seedRole(acct.address, 1).transact({"from": env.admin})
    l1.signers.add(LocalSigner(acct.key.hex()))
    r = l1.pay(acct.address, "tUSDC", "vendor_cloud", 1)
    assert r.status == "reverted" and r.reason_code == R.KEY_NOT_REGISTERED and r.tx_hash


def test_simulate_returns_reason_and_sends_nothing(l1: L1Chain, env: Env) -> None:
    before = _head(env)
    assert l1.simulate_pay("key_minh", "tUSDC", "stranger_wallet", 1) == R.RECIPIENT_NOT_ALLOWED
    assert l1.simulate_pay("key_minh", "tSCAM", "vendor_cloud", 1) == R.TOKEN_NOT_ALLOWED
    assert l1.simulate_pay("key_minh", "tUSDC", "vendor_cloud", u(30_000)) == R.CARD_DAILY_CAP
    assert l1.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) is None
    assert (
        l1.simulate_swap("key_agent_rebalance", "evil_dex", SEL, "tUSDC", "tTKB", 1, 0)
        == R.PROTOCOL_NOT_ALLOWED
    )
    assert l1.simulate_swap("key_agent_rebalance", "mock_dex", SEL, "tUSDC", "tTKB", 1, 0) is None
    assert _head(env) == before  # eth_call only


# ------------------------------------------------- blocked at protocol (node)
def test_delisted_key_is_blocked_at_protocol_without_hash(l1: L1Chain, env: Env) -> None:
    key = env.seed["keys"][0]["address"]
    env.send(env.allowlist.functions.setNone(key), env.admin)
    before = _head(env)
    r = l1.pay("key_minh", "tUSDC", "vendor_cloud", 1)
    assert r.status == "blocked_at_protocol" and r.reason_code == R.BLOCKED_AT_PROTOCOL
    assert r.tx_hash is None and r.block is None and r.events == []
    assert r.error_raw and "cannot issue transaction from non-allow listed address" in r.error_raw
    assert _head(env) == before  # nothing reached a block
    assert l1.raw_call("key_minh", "tSCAM", "0x095ea7b3").status == "blocked_at_protocol"


# ---------------------------------------------------------------- council
def test_emergency_lock_one_tx_all_five_keys_delisted(l1: L1Chain, env: Env) -> None:
    assert all(r.ok for r in l1.apply_policy_v2())
    before = _head(env)
    r = l1.emergency_lock("lan", "minh")
    assert r.status == "ok" and _head(env) == before + 1  # one tx, one block
    assert "PrincipalLocked" in [e.name for e in r.events]
    snap = l1.snapshot()
    keys = snap.principals["minh"].keys
    assert len(keys) == 5 and snap.principals["minh"].locked
    assert all(not snap.keys[k].allow_listed for k in keys)
    assert l1.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.DISTRICT_LOCKED


def test_tighten_paths_and_loosen_via_one_member_is_rejected(l1: L1Chain, env: Env) -> None:
    k = env.seed["keys"][0]["address"]
    assert l1.lower_key_cap("huy", k, u(10_000)).ok
    assert l1.lower_district_cap("trang", "minh", u(5_000)).ok  # from unset
    assert l1.revoke_allow("lan", "recipient", "vendor_cloud").ok
    assert l1.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.RECIPIENT_NOT_ALLOWED
    assert l1.revoke_allow("lan", "protocol", "mock_dex").ok  # selector from the seed
    assert l1.revoke_allow("lan", "token", "tTKB").ok
    assert l1.deactivate_key("huy", "key_huy_2").ok
    snap = l1.snapshot()
    assert snap.keys[k].daily_cap == u(10_000) and snap.principals["minh"].daily_cap == u(5_000)
    huy2 = next(k["address"] for k in env.seed["keys"] if k["seed_id"] == "key_huy_2")
    assert snap.keys[huy2].active is False
    # loosening through the 1-member path
    r = l1.lower_key_cap("trang", k, u(50_000))
    assert r.status == "reverted" and r.error_raw == "NotTightening" and r.tx_hash
    r = l1.lower_district_cap("trang", "minh", 0)
    assert r.status == "reverted" and r.error_raw == "NotTightening"
    # outsiders
    assert l1.emergency_pause("key_minh").error_raw == "NotCouncilMember"
    assert l1.emergency_pause("huy").ok and l1.snapshot().paused
    assert l1.simulate_pay("key_minh", "tUSDC", "vendor_cloud", 1) == R.VAULT_PAUSED


def test_propose_two_approvals_executes_and_bumps_version_once(l1: L1Chain) -> None:
    calls = [
        {"target": "vault", "fn": "setKeyDailyCap", "args": {"key": "key_minh", "cap": u(50_000)}}
    ]
    v = l1.snapshot().policy_version
    pid = l1.propose("trang", "raise", "minh", calls, "0x01").proposal_id
    assert pid == 1
    r1 = l1.approve("trang", pid)
    assert r1.ok and [e.name for e in r1.events] == ["Approved"]
    assert l1.snapshot().policy_version == v
    assert l1.approve("trang", pid).error_raw == "AlreadyApproved"
    r2 = l1.approve("huy", pid)
    assert r2.ok and [e.name for e in r2.events][-3:] == [
        "CapChanged",
        "PolicyVersionBumped",
        "Executed",
    ]
    snap = l1.snapshot()
    assert snap.policy_version == v + 1
    assert snap.keys[l1._addr("key_minh")].daily_cap == u(50_000)
    assert l1.cancel("trang", pid).error_raw == "ProposalNotOpen"
    again = l1.propose(
        "lan", "again", None, [{"target": "vault", "fn": "unpauseAll", "args": {}}], "0x"
    )
    assert again.proposal_id == 2


def test_conflict_of_interest_declared_and_derived(l1: L1Chain) -> None:
    move = [
        {"target": "registry", "fn": "moveKey", "args": {"key": "key_agent_rebalance", "to": "huy"}}
    ]
    pid = l1.propose("trang", "to huy", "huy", move, "0x02").proposal_id
    r = l1.approve("huy", pid)
    assert r.status == "reverted" and r.error_raw == "ConflictOfInterest" and r.events == []
    # declared subject is minh but the call also touches huy's district: huy still cannot approve
    move2 = [{"target": "registry", "fn": "moveKey", "args": {"key": "key_huy_1", "to": "minh"}}]
    pid2 = l1.propose("trang", "huy key to minh", "minh", move2, "0x03").proposal_id
    assert l1.approve("huy", pid2).error_raw == "ConflictOfInterest"
    assert l1.approve("lan", pid2).ok and l1.approve("trang", pid2).ok


def test_propose_errors_match_the_sim(l1: L1Chain, env: Env) -> None:
    bad = [
        ("trang", None, [{"target": "token", "fn": "mint", "args": {}}], "TargetNotAllowed"),
        ("trang", None, [{"target": "vault", "fn": "selfdestruct", "args": {}}], "UnknownCall"),
        (  # subject not among the affected principals
            "trang",
            "huy",
            [{"target": "vault", "fn": "lockPrincipal", "args": {"principal_id": "minh"}}],
            "SubjectMismatch",
        ),
        (  # not a member
            "key_minh",
            None,
            [{"target": "vault", "fn": "pauseAll", "args": {}}],
            "NotCouncilMember",
        ),
    ]
    for member, subject, calls, name in bad:
        r = l1.propose(member, "x", subject, calls, "0x")
        assert (r.ok, r.error_raw, r.proposal_id) == (False, name, None), name
    assert l1.snapshot().policy_version == 1  # nothing executed


def test_unknown_signer_and_missing_council(l1: L1Chain, env: Env) -> None:
    with pytest.raises(SignerError):
        l1.pay("vendor_cloud", "tUSDC", "vendor_cloud", 1)  # an address we hold no key for
    with pytest.raises(ValueError):  # unknown id, not hex: rejected at the port boundary
        l1.pay("nobody", "tUSDC", "vendor_cloud", 1)
    empty = L1Chain(env.w3, env.dep, env.seed, signers=SignerRegistry())
    with pytest.raises(SignerError):
        empty.pay("key_minh", "tUSDC", "vendor_cloud", 1)
    with pytest.raises(ChainWriteError):
        L1Chain(
            env.w3,
            env.dep.__class__(**{**env.dep.__dict__, "council": None}),
            env.seed,
            signers=l1.signers,
        ).emergency_pause("huy")


# ----------------------------------------------------------------- secrets
def test_no_private_key_or_rpc_url_in_logs_or_errors(
    l1: L1Chain, env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    acct = Account.create()
    env.w3.provider.make_request("anvil_setBalance", [acct.address, hex(10**18)])
    env.allowlist.functions.__seedRole(acct.address, 1).transact({"from": env.admin})
    signer = LocalSigner(acct.key.hex())
    l1.signers.add(signer)
    secret = acct.key.hex().removeprefix("0x")
    with caplog.at_level(logging.DEBUG):
        results = [
            l1.pay(acct.address, "tUSDC", "vendor_cloud", 1),
            l1.pay("key_minh", "tUSDC", "stranger_wallet", 1),
            l1.emergency_pause("huy"),
        ]
    blob = caplog.text + repr(signer) + repr(l1.signers._by_address) + repr(results)
    assert secret not in blob.lower()
    assert f"127.0.0.1:{env.anvil.port}" not in blob
    # a transport failure must not leak the URL either
    env.anvil.stop()
    with pytest.raises(ChainWriteError) as e:
        l1.pay("key_minh", "tUSDC", "vendor_cloud", 1)
    assert f"127.0.0.1:{env.anvil.port}" not in str(e.value)
