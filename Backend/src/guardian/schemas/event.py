from __future__ import annotations

from typing import Any

from guardian.schemas.common import CamelModel


class EventOut(CamelModel):
    name: str
    block: int
    tx_hash: str
    log_index: int
    payload: dict[str, Any]
    ts: int
    simulated: bool
