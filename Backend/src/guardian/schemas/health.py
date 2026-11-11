from __future__ import annotations

from guardian.schemas.common import CamelModel


class AgentStatus(CamelModel):
    status: str
    last_run_at: int | None = None
    last_outcome: str | None = None


class HealthOut(CamelModel):
    status: str
    chain_mode: str
    demo_mode: bool
    simulated: bool
    l1_block: int
    c_chain_block: int | None = None
    indexer_lag_blocks: int
    policy_version: int
    graph_version: int
    agent: AgentStatus
