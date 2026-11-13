"""LLM provider adapter (issue AI-001): one narrow interface, one Anthropic implementation, any failure -> `LlmUnavailable`.

The LLM never decides money. Callers use this module for two things only: phrasing text and answering read-only
questions through read-only tools. Every failure mode (no credential, timeout, refusal, bad request, network)
raises `LlmUnavailable` and the caller falls back to its template. Secrets and prompts are never logged.
"""

from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

import anthropic

from guardian.core.config import Settings

log = logging.getLogger("guardian.llm")

Effort = Literal["low", "medium", "high"]
FALLBACK_BETA = (
    "server-side-fallback-2026-07-01"  # pairs with fallbacks="default" (the scalar form)
)
CREDENTIAL_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")


class LlmUnavailable(Exception):
    """The LLM could not give a usable answer; the caller must use its template. Message is safe to log."""


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class LlmTurn:
    stop_reason: str
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    assistant_content: Any = None  # opaque: echoed back as the assistant turn in a tool loop


class LlmClient(Protocol):
    """`complete(system, messages, tools, schema)`: one model turn. Tests plug in a scripted fake."""

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        schema: dict[str, Any] | None,
        effort: Effort,
        max_tokens: int,
        timeout: float,
    ) -> LlmTurn: ...


def has_credential(settings: Settings) -> bool:
    return settings.anthropic_api_key is not None or any(os.environ.get(k) for k in CREDENTIAL_ENV)


def llm_enabled(settings: Settings) -> bool:
    """`LLM_ENABLED` wins; unset means on only when a credential is present."""
    return settings.llm_enabled if settings.llm_enabled is not None else has_credential(settings)


def _echo(content: list[Any]) -> list[Any]:
    """Assistant content to send back. After a server-side fallback, thinking/tool_use before the last
    `fallback` marker must be omitted (the fallback model cannot read them); the marker is dropped."""
    last = max((i for i, b in enumerate(content) if b.type == "fallback"), default=-1)
    if last < 0:
        return list(content)
    return [
        b
        for i, b in enumerate(content)
        if b.type != "fallback"
        and not (i < last and b.type in ("thinking", "redacted_thinking", "tool_use"))
    ]


def _is_haiku(model: str) -> bool:
    return model.startswith("claude-haiku")


class AnthropicClient:
    def __init__(self, settings: Settings) -> None:
        key = settings.anthropic_api_key
        self._client = anthropic.Anthropic(
            api_key=key.get_secret_value() if key else None, max_retries=0
        )
        self._model = settings.llm_model

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        schema: dict[str, Any] | None,
        effort: Effort,
        max_tokens: int,
        timeout: float,
    ) -> LlmTurn:
        # Never send `thinking` disabled / budget_tokens, no prefill, no forced tool_choice. Haiku 4.5 (the default,
        # chosen for cost) rejects `effort` and has no server-side fallback; Opus/Sonnet/Fable get both.
        output_config: dict[str, Any] = {} if _is_haiku(self._model) else {"effort": effort}
        if schema is not None:
            output_config["format"] = {"type": "json_schema", "schema": schema}
        extra: dict[str, Any] = {"tools": tools} if tools else {}
        if output_config:
            extra["output_config"] = output_config
        if not _is_haiku(self._model):
            extra |= {"betas": [FALLBACK_BETA], "fallbacks": "default"}
        try:
            resp = self._client.with_options(
                timeout=anthropic.Timeout(timeout, connect=min(2.0, timeout))
            ).beta.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,  # type: ignore[arg-type]
                **extra,
            )
        except anthropic.APITimeoutError as e:  # before APIConnectionError (its parent)
            raise LlmUnavailable("timeout") from e
        except anthropic.AuthenticationError as e:
            raise LlmUnavailable("authentication failed") from e
        except anthropic.PermissionDeniedError as e:
            raise LlmUnavailable("permission denied") from e
        except anthropic.RateLimitError as e:
            raise LlmUnavailable("rate limited") from e
        except anthropic.BadRequestError as e:
            raise LlmUnavailable("bad request") from e
        except anthropic.APIStatusError as e:
            raise LlmUnavailable(f"api error {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            raise LlmUnavailable("network error") from e
        # stop_reason before content: a refusal (even after the server-side fallback) is never an answer
        if resp.stop_reason == "refusal":
            raise LlmUnavailable("refusal")
        if resp.stop_reason not in ("end_turn", "tool_use"):
            raise LlmUnavailable(f"unusable stop_reason {resp.stop_reason}")
        text = "".join(b.text for b in resp.content if b.type == "text")
        calls = [
            ToolCall(b.id, b.name, dict(b.input)) for b in resp.content if b.type == "tool_use"
        ]
        return LlmTurn(resp.stop_reason, text, calls, _echo(resp.content))


class LlmSession:
    """One request's LLM budget: a single hard deadline shared by every call (and a bounded tool-call count)."""

    _pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="llm")

    def __init__(
        self, client: LlmClient, settings: Settings, budget_s: float | None = None
    ) -> None:
        self._client = client
        self._deadline = time.monotonic() + (
            settings.llm_timeout_seconds if budget_s is None else budget_s
        )
        self.max_tool_calls = settings.llm_max_tool_calls

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        schema: dict[str, Any] | None = None,
        effort: Effort = "low",
        max_tokens: int = 2048,
    ) -> LlmTurn:
        remaining = self._deadline - time.monotonic()
        if remaining <= 0:
            raise LlmUnavailable("timeout")
        fut = self._pool.submit(
            self._client.complete,
            system=system,
            messages=messages,
            tools=tools,
            schema=schema,
            effort=effort,
            max_tokens=max_tokens,
            timeout=remaining,
        )
        try:
            return fut.result(timeout=remaining)
        except (
            FutureTimeout
        ) as e:  # the worker may linger until its own HTTP timeout; the caller does not wait
            fut.cancel()
            raise LlmUnavailable("timeout") from e
        except LlmUnavailable:
            raise
        except Exception as e:
            log.warning("llm adapter error: %s", type(e).__name__)
            raise LlmUnavailable(f"adapter error {type(e).__name__}") from e


def open_session(rt: Any, budget_s: float | None = None) -> LlmSession:
    """A session on the runtime's LLM client, or `LlmUnavailable` when the LLM is off (callers use templates)."""
    settings: Settings = rt.settings
    if not llm_enabled(settings):
        raise LlmUnavailable("disabled")
    client = getattr(rt, "llm_client", None)
    if client is None:
        try:
            client = AnthropicClient(settings)
        except Exception as e:
            raise LlmUnavailable(f"client init {type(e).__name__}") from e
        rt.llm_client = client
    return LlmSession(client, settings, budget_s)
