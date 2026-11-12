"""SSE event types on GET /api/stream (payload = JSON in `data:`).

event          -> EventOut            (a chain event: Paid, Swapped, PrincipalLocked, ...)
attempt        -> AttemptOut
graph_updated  -> {graphVersion, policyVersion, policyLabel, block}
proposal_updated -> ProposalOut
agent_run      -> AgentRunOut
city_updated   -> CityStates
reset          -> {at, policyVersion, policyLabel, graphVersion, block}
"""

from __future__ import annotations

from typing import Final

SSE_EVENT_TYPES: Final = (
    "event",
    "attempt",
    "graph_updated",
    "proposal_updated",
    "agent_run",
    "city_updated",
    "reset",
)
