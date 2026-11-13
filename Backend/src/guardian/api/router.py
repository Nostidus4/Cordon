"""Aggregate all route modules."""

from fastapi import APIRouter

from guardian.api.routes import (
    actions,
    agent,
    assistant,
    attempts,
    buildings,
    demo,
    districts,
    events,
    faults,
    findings,
    graph,
    health,
    incidents,
    org,
    payroll,
    proposals,
    scenario,
    simulate,
    stream,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(org.router)
api_router.include_router(graph.router)
api_router.include_router(simulate.router)
api_router.include_router(findings.router)
api_router.include_router(districts.router)
api_router.include_router(events.router)
api_router.include_router(stream.router)
api_router.include_router(attempts.router)
api_router.include_router(proposals.router)
api_router.include_router(actions.router)
api_router.include_router(assistant.router)
api_router.include_router(agent.router)
api_router.include_router(scenario.router)
api_router.include_router(demo.router)
api_router.include_router(buildings.router)
api_router.include_router(faults.router)
api_router.include_router(incidents.router)
api_router.include_router(payroll.router)
