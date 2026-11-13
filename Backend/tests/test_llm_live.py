"""Live reliability run against the real API: skipped unless a credential is present (never in CI)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from guardian.core.config import Settings
from guardian.core.llm import llm_enabled

pytestmark = pytest.mark.llm_live


@pytest.mark.skipif(
    not llm_enabled(Settings(_env_file=None)),  # type: ignore[call-arg]
    reason="no LLM credential",
)
async def test_live_reliability_10_runs() -> None:
    path = Path(__file__).resolve().parents[1] / "scripts" / "llm_reliability.py"
    spec = importlib.util.spec_from_file_location("llm_reliability", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert await mod.run(10)


def test_harness_script_is_a_noop_without_credentials(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("LLM_ENABLED", "false")
    path = Path(__file__).resolve().parents[1] / "scripts" / "llm_reliability.py"
    spec = importlib.util.spec_from_file_location("llm_reliability", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr("sys.argv", ["llm_reliability.py"])
    assert mod.main() == 0
    assert "skipped" in capsys.readouterr().out
