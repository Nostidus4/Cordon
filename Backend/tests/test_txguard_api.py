"""CITY-003: B05 Tx Guardian service + API (check, send, reject), explanation verifier, scene-4 / F05 hook."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from guardian.core.llm import LlmUnavailable
from guardian.schemas.txguard import PreparedTx
from guardian.services import scenario_service
from guardian.services.runtime import Runtime
from guardian.shared.money import to_base
from guardian.shared.reason_codes import REASON_TABLE
from guardian.txguard import explain as ex
from guardian.txguard import service as tg
from tests.llm_fakes import ScriptedLlm, llm_app
from tests.test_city_ops_api import post, to_v2

MAX_UINT = str(2**256 - 1)


def body(rt: Runtime, kind: str = "pay", **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "kind": kind,
        "signer": rt.addr("key_minh"),
        "token": rt.addr("tUSDC"),
        "to": rt.addr("vendor_cloud"),
        "amount": str(to_base(1_000)),
    }
    return {**base, **kw}


async def check(c: httpx.AsyncClient, b: dict[str, Any], ok: int = 200) -> Any:
    return await post(c, "/api/txguard/check", b, ok=ok)


def rule_ids(out: dict[str, Any]) -> list[str]:
    return [f["ruleId"] for f in out["findings"]]


@pytest.fixture(autouse=True)
async def _reset(client: httpx.AsyncClient) -> None:
    await post(client, "/api/demo/reset")


# ----------------------------------------------------------------------------- check
async def test_a_whitelisted_payment_is_safe_and_makes_no_change(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    attempts, events = len(rt.stores.attempts.all()), len(rt.event_log)
    block = rt.snapshot().block
    out = await check(client, body(rt))
    assert out["level"] == "safe" and out["findings"] == [] and out["status"] == "pending"
    assert out["diff"]["chainReason"] is None and out["diff"]["recipientKnown"] is True
    assert out["diff"]["outflows"] == [
        {"token": "tUSDC", "amount": {"raw": str(to_base(1_000)), "display": "1.000"}}
    ]
    assert out["diff"]["principalId"] == "minh" and out["diff"]["simulated"] is True
    assert out["explanationSource"] == "template" and out["numbersVerified"] is True
    assert out["sentTx"] is None
    # a check only reads
    assert (len(rt.stores.attempts.all()), len(rt.event_log), rt.snapshot().block) == (
        attempts,
        events,
        block,
    )


async def test_payment_to_a_stranger_is_flagged_and_shows_the_chain_reason(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    out = await check(client, body(rt, to=rt.addr("stranger_wallet")))
    assert out["level"] == "danger"
    assert out["diff"]["chainReason"] == "RECIPIENT_NOT_ALLOWED"
    assert out["diff"]["recipientKnown"] is False
    assert "unknown_contract" in rule_ids(out)


async def test_unlimited_approval_and_raw_approve_are_flagged(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    a = await check(client, body(rt, "approve", amount=MAX_UINT))
    assert a["level"] == "danger" and "unlimited_approval" in rule_ids(a)
    assert a["diff"]["approvals"][0]["unlimited"] is True and a["diff"]["simulated"] is False
    data = tg.approve_calldata(rt.addr("vendor_cloud"), 2**255)
    r = await check(
        client, body(rt, "raw", token=None, amount=None, to=rt.addr("tUSDC"), data=data)
    )
    assert "unlimited_approval" in rule_ids(r)
    assert r["diff"]["approvals"][0]["spender"] == rt.addr("vendor_cloud")


async def test_drain_swap_slippage_and_poisoning(client: httpx.AsyncClient, rt: Runtime) -> None:
    vault = rt.chain.balance(rt.chain.vault_addr, rt.addr("tUSDC"))
    d = await check(client, body(rt, amount=str(vault)))
    assert "drain" in rule_ids(d)
    swap = body(
        rt,
        "swap",
        to=rt.addr("mock_dex"),
        tokenOut=rt.addr("tTKB"),
        amount=str(to_base(1_000)),
        minOut="0",
    )
    s = await check(client, swap)
    assert "abnormal_slippage" in rule_ids(s) and s["diff"]["inflows"][0]["token"] == "tTKB"
    assert s["diff"]["inflows"][0]["amount"]["display"] == "1.000"  # 1 tTKB = 1 tUSDC in value
    ok = await check(client, {**swap, "minOut": str(to_base(1_000) * 10**12)})
    assert "abnormal_slippage" not in rule_ids(ok)
    vendor = rt.addr("vendor_cloud")
    fake = vendor[:6] + "0" * 32 + vendor[-4:]
    p = await check(client, body(rt, to=fake))
    assert "address_poisoning" in rule_ids(p) and p["level"] == "danger"


async def test_bad_input_is_a_422(client: httpx.AsyncClient, rt: Runtime) -> None:
    for bad in (
        body(rt, signer="0x" + "12" * 20),  # not a key of the organisation
        body(rt, amount="-5"),
        body(rt, amount=None),
        body(rt, to="not-an-address"),
        body(rt, "raw", data="zz", token=None, amount=None),
    ):
        r = await client.post("/api/txguard/check", json=bad)
        assert r.status_code == 422, bad


async def test_list_get_and_404(client: httpx.AsyncClient, rt: Runtime) -> None:
    a, b = await check(client, body(rt)), await check(client, body(rt))
    rows = (await client.get("/api/txguard/checks")).json()
    assert [r["id"] for r in rows] == [b["id"], a["id"]]
    assert (await client.get("/api/txguard/checks?limit=1")).json()[0]["id"] == b["id"]
    assert (await client.get(f"/api/txguard/checks/{a['id']}")).json()["id"] == a["id"]
    r = await client.get("/api/txguard/checks/999")
    assert r.status_code == 404 and r.json()["error"]["code"] == "TX_CHECK_NOT_FOUND"


async def test_demo_reset_clears_the_checks(client: httpx.AsyncClient, rt: Runtime) -> None:
    await check(client, body(rt))
    await post(client, "/api/demo/reset")
    assert (await client.get("/api/txguard/checks")).json() == []


# ----------------------------------------------------------------------------- reject / send
async def test_reject_never_sends_and_blocks_a_later_send(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    out = await check(client, body(rt))
    vault = rt.chain.balance(rt.chain.vault_addr, rt.addr("tUSDC"))
    attempts, events, block = len(rt.stores.attempts.all()), len(rt.event_log), rt.snapshot().block
    spent = rt.snapshot().principals["minh"].spent_today
    done = await post(client, f"/api/txguard/checks/{out['id']}/reject")
    assert done["status"] == "rejected" and done["sentTx"] is None
    assert rt.chain.balance(rt.chain.vault_addr, rt.addr("tUSDC")) == vault
    assert (len(rt.stores.attempts.all()), len(rt.event_log), rt.snapshot().block) == (
        attempts,
        events,
        block,
    )
    assert rt.snapshot().principals["minh"].spent_today == spent
    r = await client.post(f"/api/txguard/checks/{out['id']}/send")
    assert r.status_code == 409 and r.json()["error"]["code"] == "TX_CHECK_NOT_PENDING"
    again = await client.post(f"/api/txguard/checks/{out['id']}/reject")
    assert again.status_code == 409
    assert (await client.get(f"/api/txguard/checks/{out['id']}")).json()["status"] == "rejected"


async def test_send_signs_through_the_normal_spend_path(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    out = await check(client, body(rt))
    attempts = len(rt.stores.attempts.all())
    sent = await post(client, f"/api/txguard/checks/{out['id']}/send")
    assert sent["status"] == "sent" and sent["sentTx"]["ok"] is True
    assert sent["sentTx"]["txHash"] and sent["sentTx"]["simulated"] is True
    assert len(rt.stores.attempts.all()) == attempts + 1
    assert rt.stores.attempts.all()[-1].amount["raw"] == str(to_base(1_000))
    r = await client.post(f"/api/txguard/checks/{out['id']}/send")
    assert r.status_code == 409


async def test_send_of_a_flagged_tx_still_obeys_the_chain(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    out = await check(client, body(rt, to=rt.addr("stranger_wallet")))
    sent = await post(client, f"/api/txguard/checks/{out['id']}/send")
    assert sent["status"] == "sent" and sent["sentTx"]["ok"] is False
    assert sent["sentTx"]["reasonCode"] == "RECIPIENT_NOT_ALLOWED"


async def test_send_needs_demo_mode(client: httpx.AsyncClient, rt: Runtime) -> None:
    out = await check(client, body(rt))
    rt.settings.demo_mode = False
    try:
        r = await client.post(f"/api/txguard/checks/{out['id']}/send")
        assert r.status_code == 403 and r.json()["error"]["code"] == "DEMO_MODE_REQUIRED"
        assert (await client.get(f"/api/txguard/checks/{out['id']}")).json()["status"] == "pending"
    finally:
        rt.settings.demo_mode = True


# ----------------------------------------------------------------------------- explanation verifier
async def test_template_numbers_are_all_in_the_diff_for_every_reason_and_kind(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    cases = [
        body(rt),
        body(rt, to=rt.addr("stranger_wallet")),
        body(rt, "approve", amount=MAX_UINT),
        body(rt, "approve", amount=str(to_base(7_500))),
        body(rt, "swap", to=rt.addr("evil_dex"), tokenOut=rt.addr("tTKB"), minOut="0"),
        body(rt, "raw", token=None, amount=None, to=rt.addr("tSCAM"), data="0x095ea7b3"),
    ]
    for c in cases:
        out = await check(client, c)
        assert out["explanationSource"] == "template" and out["numbersVerified"] is True
        shown = {n["value"] for n in out["numbers"]}
        for tok in ex.NUMBER_RE.findall(out["explanationVi"]):
            assert tok in shown, (tok, out["explanationVi"])


def test_every_reason_text_is_number_free() -> None:
    for code, info in REASON_TABLE.items():
        assert not ex.NUMBER_RE.findall(info.vi), code


def _prepared(rt: Runtime) -> PreparedTx:
    return PreparedTx.model_validate(body(rt))


async def test_llm_text_with_an_invented_number_falls_back_to_the_template() -> None:
    invented = ScriptedLlm(
        _turn('{"explanation": "Chuyển 1.000 tUSDC, rồi sẽ còn 999.999 trong kho."}')
    )
    async with llm_app(invented) as (_, rt, _c):
        out = tg.check(rt, _prepared(rt))
        assert invented.requests, "the fake LLM must have been asked"
        assert out.explanation_source == "template" and out.numbers_verified is True
        assert "999.999" not in out.explanation_vi


async def test_llm_text_that_only_uses_diff_numbers_is_accepted() -> None:
    good = ScriptedLlm(_turn('{"explanation": "Kho chuyển 1.000 tUSDC cho nhà cung cấp cloud."}'))
    async with llm_app(good) as (_, rt, _c):
        out = tg.check(rt, _prepared(rt))
        assert out.explanation_source == "llm" and out.numbers_verified is True
        assert {n.value for n in out.numbers} == {"1.000"}


async def test_llm_text_with_an_address_or_failure_falls_back() -> None:
    for step in (
        _turn('{"explanation": "Gửi tới 0xabc123 ngay."}'),
        _turn("not json"),
        LlmUnavailable("timeout"),
    ):
        async with llm_app(ScriptedLlm(step)) as (_, rt, _c):
            out = tg.check(rt, _prepared(rt))
            assert out.explanation_source == "template"


def _turn(text: str) -> Any:
    from guardian.core.llm import LlmTurn

    return LlmTurn("end_turn", text=text, assistant_content=[{"type": "text", "text": text}])


# ----------------------------------------------------------------------------- scene 4 / F05
async def test_scene4_attacker_steps_show_up_as_flagged_attacker_checks(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    await to_v2(client)
    await post(
        client, "/api/agent/run-once"
    )  # the morning swap (step 0): 5.000 already spent in the district
    await scenario_service.start_scene4(rt, 0.0, wait=True)
    rows = (await client.get("/api/txguard/checks?limit=100")).json()
    mine = [r for r in rows if r["prepared"]["source"] == "attacker"]
    assert len(mine) == 5
    by_reason = {r["diff"]["chainReason"] for r in mine}
    assert {"RECIPIENT_NOT_ALLOWED", "PROTOCOL_NOT_ALLOWED", "DISTRICT_DAILY_CAP"} <= by_reason
    flagged = [r for r in mine if r["level"] != "safe"]
    assert len(flagged) >= 3 and all(r["status"] == "pending" for r in mine)
    step2 = next(r for r in mine if r["diff"]["chainReason"] == "PROTOCOL_NOT_ALLOWED")
    assert {"unknown_contract", "abnormal_slippage"} <= set(rule_ids(step2))


async def test_f05_records_attacker_checks_and_leaves_its_actions_unchanged(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    await to_v2(client)
    res = await post(client, "/api/faults/F05_KEY_LEAK/inject")
    assert [a["reasonCode"] for a in res["actions"][-5:]] == [
        "RECIPIENT_NOT_ALLOWED",
        "PROTOCOL_NOT_ALLOWED",
        None,
        None,
        "DISTRICT_DAILY_CAP",
    ]
    rows = (await client.get("/api/txguard/checks?limit=100")).json()
    mine = [r for r in rows if r["prepared"]["source"] == "attacker"]
    assert len(mine) == 5 and sum(1 for r in mine if r["level"] == "danger") >= 3


def test_a_failing_check_never_breaks_the_attempt(rt: Runtime) -> None:
    tg.record_attempt(rt, "key_minh", "pay", {"token": "nope", "to": "x", "amount": 1}, "attacker")
    assert rt.stores.tx_checks == {}
