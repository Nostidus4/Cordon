"""Read models over graph/: graph snapshot, simulate (± change), findings."""

from __future__ import annotations

from typing import Any

from guardian.core.errors import ApiError
from guardian.graph import changes as chg
from guardian.graph.builder import build_graph
from guardian.graph.findings import compute_findings
from guardian.graph.simulate import simulate_compromise
from guardian.services import views
from guardian.services.runtime import Runtime


def graph(rt: Runtime) -> dict[str, Any]:
    snap = rt.snapshot()
    return views.api_graph(build_graph(snap, compute_findings(snap)), rt.graph_version)


def findings(rt: Runtime) -> list[dict[str, Any]]:
    return [views.api_finding(f) for f in rt.findings()]


def simulate(
    rt: Runtime, compromised: list[str], change_raw: dict[str, Any] | None = None
) -> dict[str, Any]:
    snap = rt.snapshot()
    unknown = [p for p in compromised if p not in snap.principals]
    if unknown:
        raise ApiError(404, "DISTRICT_NOT_FOUND", f"Không có khu: {', '.join(unknown)}.")
    change: chg.ProposedChange | None = views.change_in(change_raw) if change_raw else None
    try:
        res = simulate_compromise(snap, compromised, change)
    except (ValueError, KeyError) as e:
        raise ApiError(422, "INVALID_CHANGE", f"Thay đổi không hợp lệ: {e}") from e
    if change is not None:
        return {"before": views.api_sim(res["before"]), "after": views.api_sim(res["after"])}
    return views.api_sim(res)
