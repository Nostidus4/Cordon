"""Assistant tools (spec §9.2): read-only, return API-shaped JSON (money as {raw, display}).

No tool signs, sends a transaction, writes the DB or touches the internet. Numbers the assistant
quotes must come from these results and are re-read by `verifier.verify` through their `path`.
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from typing import Any

from guardian.graph import changes as chg
from guardian.graph.findings import (
    R4_SUGGESTED_COUNCIL_CAP,
    R4_SUGGESTED_DISTRICT_ID,
    change_findings,
)
from guardian.graph.simulate import simulate_compromise
from guardian.services import district_service, graph_service, views
from guardian.services import proposal_service as ps
from guardian.services.runtime import Runtime


def _recorded[F: Callable[..., Any]](fn: F) -> F:
    """Append `{name, args}` to `self.calls` (shown in the assistant log, spec §9.4)."""
    params = list(inspect.signature(fn).parameters)[1:]

    @functools.wraps(fn)
    def wrapper(self: AssistantTools, *args: Any, **kwargs: Any) -> Any:
        self.calls.append({"name": fn.__name__, "args": {**dict(zip(params, args)), **kwargs}})
        return fn(self, *args, **kwargs)

    return wrapper  # type: ignore[return-value]


class AssistantTools:
    def __init__(self, rt: Runtime) -> None:
        self._rt = rt
        self.calls: list[dict[str, Any]] = []

    def snapshot_key_address(self, seed_id: str) -> str:
        return self._rt.key_by_seed(seed_id).address

    @_recorded
    def get_graph(self) -> dict[str, Any]:
        """Condensed snapshot: districts + balances (no node/edge lists)."""
        g = graph_service.graph(self._rt)
        findings = self._rt.findings()
        return {
            "policyVersion": g["policyVersion"],
            "policyLabel": g["policyLabel"],
            "districts": [
                {
                    **d,
                    "keyCount": len(d["keys"]),
                    "hasHighFinding": any(
                        f["principal_id"] == d["principalId"] and f["severity"] == "HIGH"
                        for f in findings
                    ),
                }
                for d in g["districts"]
            ],
        }

    @_recorded
    def simulate_compromise(
        self, principals: list[str], change: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return graph_service.simulate(self._rt, principals, change)

    @_recorded
    def get_district(self, principal_id: str) -> dict[str, Any]:
        return district_service.district(self._rt, principal_id)

    @_recorded
    def get_proposal(self, proposal_id: int) -> dict[str, Any]:
        return ps.proposal_out(self._rt, proposal_id)

    @_recorded
    def list_findings(self) -> list[dict[str, Any]]:
        return graph_service.findings(self._rt)

    @_recorded
    def evaluate_change(self, change_raw: dict[str, Any]) -> dict[str, Any]:
        """Read-only what-if for a ProposedChange that is not (yet) a proposal."""
        snap = self._rt.snapshot()
        change = views.change_in(change_raw)
        subject = chg.subject_principal(change, snap)
        if subject is None:
            return {"subjectPrincipal": None}
        sim = simulate_compromise(snap, [subject], change)
        r4 = change_findings(snap, change)
        bound = ps.conflicted_members(snap, subject)
        if r4:
            suggestion = r4[0]["proposal"]
        else:  # structural conflict even if the live numbers do not trip R4 (e.g. key not live)
            moved = (
                [change["key"]] if change["kind"] == "move_key" else list(change.get("keys", []))
            )  # type: ignore[attr-defined]
            suggestion = {
                "kind": "create_district",
                "principal_id": R4_SUGGESTED_DISTRICT_ID,
                "label": "Khu do Hội đồng sở hữu",
                "owner": "council",
                "keys": moved,
                "district_cap": R4_SUGGESTED_COUNCIL_CAP,
                "protocol_only": True,
            }
        return {
            "subjectPrincipal": subject,
            "change": views.change_out(change),
            "before": views.api_totals(sim["before"]["totals"]),
            "after": views.api_totals(sim["after"]["totals"]),
            "highlights": sim["after"]["highlights"],
            "conflictedMembers": bound,
            "concentration": bool(r4),
            "suggestion": views.change_out(suggestion),
        }
