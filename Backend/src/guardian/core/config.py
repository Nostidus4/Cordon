"""Settings (env / .env): CHAIN_MODE, DEMO_MODE, CORS, scenario delay, rate limit."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    chain_mode: Literal["sim", "l1"] = "sim"
    # CHAIN_MODE=l1: JSON-RPC endpoint and the file with the deployed addresses (relative paths
    # resolve against Backend/).
    l1_rpc_url: str = "http://127.0.0.1:9650/ext/bc/guardian/rpc"
    deployments_file: str = "deployments/fuji-l1.json"
    l1_poll_interval_seconds: float = 2.0
    indexer_reorg_window: int = 5  # blocks re-read each cycle (shallow reorg repair)
    indexer_confirmations: int = 0  # blocks behind head to wait before indexing
    # CHAIN_MODE=l1 + DEMO_MODE (signing with test keys) is accepted only on these chain ids:
    # 31337 = anvil, 424242 = the local Guardian L1 genesis. Add the test L1's id to enable it there.
    demo_chain_ids: list[int] = Field(default_factory=lambda: [31337, 424242])
    # None = "decide from chain_mode": on in sim, off otherwise (spec §8.6: never on a real network).
    demo_mode: bool | None = None
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    scenario_delay_seconds: float = 3.0
    rate_limit_per_minute: int = 120

    # LLM (assistant free text + agent reason). Credentials come from the SDK chain (ANTHROPIC_API_KEY, ...).
    # None = "decide from credentials": on when an API key is present, off otherwise (templates only).
    llm_enabled: bool | None = None
    llm_model: str = (
        "claude-haiku-4-5"  # cheapest current model; set LLM_MODEL=claude-opus-5-5 for top quality
    )
    llm_timeout_seconds: float = 15.0  # hard budget for ALL LLM calls of one request
    # the agent reason is written on the event loop (it sits between chain writes), so it gets a short budget:
    # past it the template sentence is used and the SSE stream is never held for long
    llm_reason_timeout_seconds: float = (
        5.0  # live p50 ~3.2 s measured on claude-opus-5-5; Haiku is faster
    )
    llm_max_tool_calls: int = 4
    anthropic_api_key: SecretStr | None = None  # also read from the process env by the SDK

    # CITY_OPS responder (docs/spec/CITY_OPS.md §4): detection always on when enabled; signing containment
    # needs DEMO_MODE. None = "decide from demo mode".
    responder_enabled: bool = True
    responder_auto_contain: bool | None = None

    @property
    def auto_contain_enabled(self) -> bool:
        """Containment signs with a Council member's demo key, so it also needs DEMO_MODE."""
        on = (
            self.demo_enabled
            if self.responder_auto_contain is None
            else self.responder_auto_contain
        )
        return on and self.demo_enabled

    @property
    def demo_enabled(self) -> bool:
        return self.chain_mode == "sim" if self.demo_mode is None else self.demo_mode


def get_settings() -> Settings:
    return Settings()
