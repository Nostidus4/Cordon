"""SSE event types on GET /api/stream (payload = JSON in `data:`).

event          -> EventOut            (a chain event: Paid, Swapped, PrincipalLocked, ...)
attempt        -> AttemptOut
graph_updated  -> {graphVersion, policyVersion, policyLabel, block}
proposal_updated -> ProposalOut
agent_run      -> AgentRunOut
city_updated   -> CityStates
incident_updated -> IncidentOut  (CITY_OPS §4.4)
reset          -> {at, policyVersion, policyLabel, graphVersion, block}
payroll_updated -> PayrollStateOut
payroll_event   -> ChainEvent-like {name, block, txHash, logIndex, ts, payload, simulated}
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
    "incident_updated",
    "payroll_updated",
    "payroll_event",
)
