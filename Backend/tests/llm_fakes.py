"""Scripted fake LLM client + app builder for the LLM track tests (no network, ever)."""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI

from guardian.chain.sim import SimChain
from guardian.core.llm import LlmTurn, ToolCall
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings

Step = LlmTurn | Exception | Callable[[dict[str, Any]], LlmTurn]


class ScriptedLlm:
    """Pops one scripted step per `complete` call; records every request it received."""

    def __init__(self, *steps: Step, delay: float = 0.0) -> None:
        self.steps = list(steps)
        self.requests: list[dict[str, Any]] = []
        self.delay = delay

    def complete(self, **kw: Any) -> LlmTurn:
        self.requests.append({**kw, "messages": list(kw["messages"])})
        if self.delay:
            time.sleep(self.delay)
        step = self.steps.pop(0) if len(self.steps) > 1 else self.steps[0]
        if isinstance(step, Exception):
            raise step
        return step(kw) if callable(step) else step


def tool_turn(name: str, args: dict[str, Any], call_id: str = "tu_1") -> LlmTurn:
    return LlmTurn(
        "tool_use",
        tool_calls=[ToolCall(call_id, name, args)],
        assistant_content=[{"type": "tool_use", "id": call_id, "name": name, "input": args}],
    )


def final_turn(answer: str, numbers: list[dict[str, str]] | None = None) -> LlmTurn:
    text = json.dumps({"answer": answer, "numbers": numbers or []}, ensure_ascii=False)
    return LlmTurn("end_turn", text=text, assistant_content=[{"type": "text", "text": text}])


def reason_turn(sentence: str) -> LlmTurn:
    text = json.dumps({"reason": sentence}, ensure_ascii=False)
    return LlmTurn("end_turn", text=text, assistant_content=[{"type": "text", "text": text}])


def num(label: str, value: str, source: str, path: str) -> dict[str, str]:
    return {"label": label, "value": value, "source": source, "path": path}


HUY_NUMBERS = [num("Ước tính", "140.000", "simulate", "simulate.totals.estimated.display")]


@asynccontextmanager
async def llm_app(
    llm: Any, **settings: Any
) -> AsyncIterator[tuple[FastAPI, Runtime, httpx.AsyncClient]]:
    cfg = make_settings(**{"llm_enabled": True, **settings})
    rt = Runtime(cfg, chain=SimChain(clock=lambda: T0))
    rt.llm_client = llm
    app = create_app(cfg, rt)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c,
    ):
        await c.post("/api/demo/reset")
        yield app, rt, c
