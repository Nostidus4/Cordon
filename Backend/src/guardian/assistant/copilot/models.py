"""In-memory Copilot draft record (lives in `Stores.copilot_drafts`, cleared by `POST /demo/reset`)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

STATUSES = ("pending", "confirmed", "rejected", "sent", "blocked")


@dataclass
class CopilotDraftRec:
    id: int
    created_at: int
    intent: str  # pay | swap
    message: str
    prepared: dict[str, Any]  # PreparedTx field names (B05 contract), source="copilot"
    internal: dict[str, Any]  # seed ids + spend params: never leave the server
    details: dict[str, Any]
    summary_vi: str
    status: str = "pending"
    tx_check_id: str | None = None
    tx_check_level: str | None = None
    result: dict[str, Any] | None = field(default=None)


def draft_out(d: CopilotDraftRec) -> dict[str, Any]:
    return {
        "id": d.id,
        "createdAt": d.created_at,
        "intent": d.intent,
        "prepared": d.prepared,
        "details": d.details,
        "summaryVi": d.summary_vi,
        "status": d.status,
        "txCheckId": d.tx_check_id,
        "txCheckLevel": d.tx_check_level,
        "result": d.result,
    }
