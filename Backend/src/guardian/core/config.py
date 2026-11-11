"""Settings (env / .env): CHAIN_MODE, DEMO_MODE, CORS, scenario delay, rate limit."""

from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    chain_mode: Literal["sim", "l1"] = "sim"
    # None = "decide from chain_mode": on in sim, off otherwise (spec §8.6: never on a real network).
    demo_mode: bool | None = None
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    scenario_delay_seconds: float = 3.0
    rate_limit_per_minute: int = 120

    @property
    def demo_enabled(self) -> bool:
        return self.chain_mode == "sim" if self.demo_mode is None else self.demo_mode


def get_settings() -> Settings:
    return Settings()
