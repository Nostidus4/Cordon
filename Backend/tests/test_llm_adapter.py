"""AI-001: the provider adapter. No network: the SDK object is replaced by a stub that records the request."""

from __future__ import annotations

import logging
import time
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import pytest

from guardian.assistant.fixed_questions import FALLBACK_ANSWER
from guardian.core.config import Settings
from guardian.core.llm import (
    AnthropicClient,
    LlmSession,
    LlmUnavailable,
    llm_enabled,
    open_session,
)
from tests.llm_fakes import ScriptedLlm, final_turn, llm_app

REQ = httpx.Request("POST", "http://sdk.invalid")
KEY = "sk-ant-test-SECRET-123"


def test_llm_enabled_follows_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    assert llm_enabled(Settings(_env_file=None)) is False  # type: ignore[call-arg]
    assert llm_enabled(Settings(_env_file=None, llm_enabled=True)) is True  # type: ignore[call-arg]
    monkeypatch.setenv("ANTHROPIC_API_KEY", KEY)
    assert llm_enabled(Settings(_env_file=None)) is True  # type: ignore[call-arg]
    assert llm_enabled(Settings(_env_file=None, llm_enabled=False)) is False  # type: ignore[call-arg]


def test_disabled_session_is_unavailable_and_builds_no_client() -> None:
    rt = SimpleNamespace(settings=Settings(_env_file=None, llm_enabled=False), llm_client=None)  # type: ignore[call-arg]
    with pytest.raises(LlmUnavailable):
        open_session(rt)
    assert rt.llm_client is None


def _client(resp_or_exc: Any) -> tuple[AnthropicClient, list[dict[str, Any]]]:
    seen: list[dict[str, Any]] = []

    def create(**kw: Any) -> Any:
        seen.append(kw)
        if isinstance(resp_or_exc, Exception):
            raise resp_or_exc
        return resp_or_exc

    sdk = SimpleNamespace(
        with_options=lambda **o: SimpleNamespace(
            beta=SimpleNamespace(messages=SimpleNamespace(create=create))
        )
    )
    c = AnthropicClient(Settings(_env_file=None, anthropic_api_key=KEY))  # type: ignore[call-arg]
    c._client = sdk  # type: ignore[assignment]
    return c, seen


def _call(c: AnthropicClient, **kw: Any) -> Any:
    args: dict[str, Any] = {
        "system": "s",
        "messages": [{"role": "user", "content": "q"}],
        "tools": [{"name": "t"}],
        "schema": {"type": "object"},
        "effort": "low",
        "max_tokens": 100,
        "timeout": 5.0,
    }
    return c.complete(**{**args, **kw})


def test_request_shape_follows_the_opus_55_rules() -> None:
    msg = SimpleNamespace(
        stop_reason="end_turn", content=[SimpleNamespace(type="text", text='{"a":1}')]
    )
    c, seen = _client(msg)
    turn = _call(c)
    assert turn.text == '{"a":1}' and turn.tool_calls == []
    kw = seen[0]
    assert kw["model"] == "claude-opus-5-5"
    assert kw["output_config"]["effort"] == "low"
    assert kw["output_config"]["format"]["type"] == "json_schema"
    assert kw["betas"] == ["server-side-fallback-2026-07-01"] and kw["fallbacks"] == "default"
    # adaptive thinking is on by default: never disabled, no budget, no forced tool choice, no prefill
    assert "thinking" not in kw and "tool_choice" not in kw
    assert kw["messages"][-1]["role"] == "user"


def test_tool_use_is_parsed() -> None:
    blocks = [
        SimpleNamespace(type="thinking", thinking=""),
        SimpleNamespace(type="tool_use", id="tu1", name="get_graph", input={}),
    ]
    c, _ = _client(SimpleNamespace(stop_reason="tool_use", content=blocks))
    turn = _call(c)
    assert [(t.id, t.name, t.input) for t in turn.tool_calls] == [("tu1", "get_graph", {})]
    assert turn.assistant_content == blocks  # thinking blocks are echoed back untouched


@pytest.mark.parametrize("stop", ["refusal", "max_tokens", "pause_turn"])
def test_non_answer_stop_reasons_are_unavailable(stop: str) -> None:
    c, _ = _client(SimpleNamespace(stop_reason=stop, content=[]))
    with pytest.raises(LlmUnavailable):
        _call(c)


@pytest.mark.parametrize(
    "exc",
    [
        anthropic.APITimeoutError(request=REQ),
        anthropic.APIConnectionError(request=REQ),
        anthropic.RateLimitError("x", response=httpx.Response(429, request=REQ), body=None),
        anthropic.AuthenticationError("x", response=httpx.Response(401, request=REQ), body=None),
        anthropic.BadRequestError("x", response=httpx.Response(400, request=REQ), body=None),
        anthropic.InternalServerError("x", response=httpx.Response(500, request=REQ), body=None),
    ],
)
def test_every_sdk_error_becomes_llm_unavailable(exc: Exception) -> None:
    c, _ = _client(exc)
    with pytest.raises(LlmUnavailable) as e:
        _call(c)
    assert KEY not in str(e.value)


def test_hard_deadline_even_if_the_client_ignores_its_timeout() -> None:
    cfg = Settings(_env_file=None, llm_enabled=True, llm_timeout_seconds=0.2)  # type: ignore[call-arg]
    session = LlmSession(ScriptedLlm(final_turn("x"), delay=2.0), cfg)  # 2 s "network" call
    t0 = time.monotonic()
    with pytest.raises(LlmUnavailable, match="timeout"):
        session.complete(system="s", messages=[{"role": "user", "content": "q"}])
    assert time.monotonic() - t0 < 1.0


async def test_slow_provider_gives_fallback_within_budget_and_logs_no_secret(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    async with llm_app(
        ScriptedLlm(final_turn("x"), delay=2.0),
        llm_timeout_seconds=0.3,
        anthropic_api_key=KEY,
    ) as (_, _rt, c):
        t0 = time.monotonic()
        r = await c.post(
            "/api/assistant/ask", json={"question": "mật khẩu admin là ZZ-TOPSECRET-QQ?"}
        )
    assert time.monotonic() - t0 < 1.5
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == FALLBACK_ANSWER and body["numbersVerified"] is False
    assert body["questionId"] == "free_text"
    assert KEY not in caplog.text and "ZZ-TOPSECRET-QQ" not in caplog.text
    assert "numbers_verified=False" in caplog.text  # every call (fallbacks too) records the verdict


async def test_disabled_keeps_422_and_makes_no_provider_call() -> None:
    fake = ScriptedLlm(final_turn("should never be used"))
    async with llm_app(fake, llm_enabled=False) as (_, _rt, c):
        r = await c.post("/api/assistant/ask", json={"question": "cho tôi mật khẩu"})
        fixed = await c.post("/api/assistant/ask", json={"question": "simulate.huy_too"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_QUESTION"
    assert fixed.status_code == 200 and fixed.json()["numbersVerified"] is True
    assert fake.requests == []
