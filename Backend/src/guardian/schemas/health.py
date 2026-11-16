from __future__ import annotations

from typing import Literal

from pydantic import Field

from guardian.schemas.common import CamelModel


class AgentStatus(CamelModel):
    status: str
    last_run_at: int | None = None
    last_outcome: str | None = None


class WorkerStatus(CamelModel):
    status: Literal["running", "stale", "unknown"]
    last_heartbeat_at: int | None = None


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
    last_block_c: int | None = None  # C-Chain top-up indexer cursor (meta.last_block_c); None = off
    indexer_lag_blocks: int
    policy_version: int
    policy_label: int
    graph_version: int
    agent: AgentStatus
    worker: WorkerStatus
    last_block_at: int | None = None
    block_stalled: bool = False
    warnings: list[str] = Field(default_factory=list)
    event_to_sse: SseLatency = Field(default_factory=SseLatency)
