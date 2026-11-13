"""The ONLY place a Copilot draft is sent: `confirm`, called by `POST /api/assistant/copilot/drafts/{id}/confirm`.

It goes through `attempt_service.run_spend` (simulate for the reason -> `ChainPort.pay`/`swap` with the demo signer ->
record + publish the attempt, source="copilot"), so the vault caps and whitelist on chain are the only allowance. A
refusal by the chain is recorded with its reason code on the draft (status `blocked`): that is the system working.
The route requires DEMO_MODE (`demo_signing`), like `services/faults.py`.
"""

from __future__ import annotations

import logging
from typing import Any

from guardian.assistant.copilot.models import draft_out
from guardian.assistant.copilot.service import _not_pending_vi, get_draft
from guardian.core.errors import ApiError
from guardian.services import attempt_service as att
from guardian.services.runtime import Runtime

log = logging.getLogger("guardian.copilot")


def confirm(rt: Runtime, draft_id: int, acknowledge_risk: bool = False) -> dict[str, Any]:
    d = get_draft(rt, draft_id)
    if d.status != "pending":
        raise ApiError(409, "DRAFT_NOT_PENDING", _not_pending_vi(d.status))
    if d.tx_check_level == "danger" and not acknowledge_risk:
        raise ApiError(
            409,
            "RISK_ACK_REQUIRED",
            "Trạm soi báo mức nguy hiểm cho lệnh này. Hãy xác nhận rủi ro rõ ràng nếu vẫn muốn gửi.",
        )
    d.status = (
        "confirmed"  # claimed before sending, so a second confirm sees 409 and cannot double-send
    )
    spend = d.internal
    try:
        a = att.run_spend(
            rt, spend["signer"], spend["action"], dict(spend["params"]), source="copilot"
        )
    except Exception as e:
        log.warning("copilot confirm failed before the chain answered: %s", type(e).__name__)
        d.status = "blocked"
        d.result = {"txHash": None, "simulated": True, "ok": False, "reasonCode": None}
        raise ApiError(502, "COPILOT_SEND_FAILED", "Không gửi được lệnh này tới chain.") from e
    ok = a.outcome == "ok"
    d.status = "sent" if ok else "blocked"
    d.result = {
        "txHash": a.tx_hash,
        "simulated": a.simulated,
        "ok": ok,
        "reasonCode": None if ok else a.reason_code,
    }
    rt.notify_state_changed()
    return draft_out(d)
