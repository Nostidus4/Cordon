"""Scene 4 order guard: policy v2 is required, and the morning agent swap (step 0) is auto-run when missing."""

from __future__ import annotations

import httpx
import pytest

from guardian.agent_rebalance import reason_writer
from guardian.services import scenario_service as sc
from guardian.shared.scenario4 import SCENARIO4_STEPS

RUN = "/api/scenario/scene4/run?delay=0&wait=true"
V2_MSG = "Cần áp luật v2 (Hội đồng gom khoá) trước khi chạy cảnh này."


def disp(v: dict) -> str:
    return v["display"]


@pytest.fixture(autouse=True)
def no_llm(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Any LLM call in these tests is a bug (it would be paid): fail loudly if one is attempted."""
    calls: list[int] = []

    def boom(*_a: object, **_k: object) -> None:
        calls.append(1)
        raise AssertionError("the LLM must not be called when scene 4 auto-runs the agent")

    monkeypatch.setattr(reason_writer, "open_session", boom)
    return calls


async def test_policy_v1_is_refused(client: httpx.AsyncClient) -> None:
    await client.post("/api/demo/reset")
    r = await client.post(RUN)
    assert r.status_code == 409
    assert r.json()["error"] == {"code": "POLICY_V2_REQUIRED", "message": V2_MSG}
    assert (await client.get("/api/scenario/runs")).json() == []
    assert (await client.get("/api/agent/runs")).json() == []  # the refusal ran nothing


async def test_v2_without_agent_run_auto_runs_agent_then_spec_numbers(
    client: httpx.AsyncClient, no_llm: list[int]
) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    assert (await client.get("/api/agent/runs")).json() == []
    r = await client.post(RUN)
    assert r.status_code == 200, r.text
    run = r.json()
    agents = (await client.get("/api/agent/runs")).json()
    assert len(agents) == 1 and agents[0]["outcome"] == "swapped"
    assert agents[0]["reasonSource"] == "template"
    steps = {x["step"]: x for x in run["attempts"]}
    assert sorted(steps) == [0, 1, 2, 3, 4, 5]
    assert disp(steps[0]["amount"]) == "5.000"
    for s in SCENARIO4_STEPS[1:6]:
        assert steps[s.step]["outcome"] == s.expected_outcome, s.step
        assert steps[s.step]["reasonCode"] == s.expected_reason, s.step
    assert [steps[i]["reasonCode"] for i in (1, 2, 5)] == [
        "RECIPIENT_NOT_ALLOWED",
        "PROTOCOL_NOT_ALLOWED",
        "DISTRICT_DAILY_CAP",
    ]
    assert disp(steps[5]["principalSpentAfter"]) == "25.000"
    attacker = sum(
        int(steps[i]["amount"]["raw"]) for i in range(1, 6) if steps[i]["outcome"] == "ok"
    )
    assert attacker == 20_000_000_000
    assert disp((await client.get("/api/districts/minh")).json()["spentToday"]) == "25.000"
    assert no_llm == []


async def test_v2_with_prior_agent_run_adopts_it_without_a_second_run(
    client: httpx.AsyncClient,
) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    first = (await client.post("/api/agent/run-once")).json()
    assert first["outcome"] == "swapped"
    run = (await client.post(RUN)).json()
    assert len((await client.get("/api/agent/runs")).json()) == 1
    step0 = next(x for x in run["attempts"] if x["step"] == 0)
    assert step0["id"] == first["attemptId"]
    assert disp((await client.get("/api/districts/minh")).json()["spentToday"]) == "25.000"


async def test_agent_step0_failure_is_refused(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    await client.post("/api/demo/reset")
    await client.post("/api/demo/policy-v2")
    monkeypatch.setattr(
        sc.agent_runner,
        "run_once",
        lambda rt, llm_reason=True: {"outcome": "blocked", "reasonCode": "CARD_DAILY_CAP"},
    )
    r = await client.post(RUN)
    assert r.status_code == 409 and r.json()["error"]["code"] == "AGENT_STEP0_FAILED"
    assert (await client.get("/api/scenario/runs")).json() == []
