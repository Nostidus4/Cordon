from __future__ import annotations

from pydantic import Field

from guardian.schemas.common import CamelModel


class AgentStatus(CamelModel):
    status: str
    last_run_at: int | None = None
    last_outcome: str | None = None


class SseLatency(CamelModel):
    last_ms: float | None = None
    max_ms: float | None = None
    samples: int = 0


class HealthOut(CamelModel):
    status: str
    chain_mode: str
    demo_mode: bool
    simulated: bool
    l1_block: int
    c_chain_block: int | None = None
    indexer_lag_blocks: int
    policy_version: int
    policy_label: int
    graph_version: int
    agent: AgentStatus
    last_block_at: int | None = None
    block_stalled: bool = False
    warnings: list[str] = Field(default_factory=list)
    event_to_sse: SseLatency = Field(default_factory=SseLatency)
