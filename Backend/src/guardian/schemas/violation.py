from __future__ import annotations

from typing import Literal

from guardian.schemas.common import CamelModel


class ViolationOut(CamelModel):
    """One call the vault policy refused (docs/spec/CITY_OPS.md §9). Derived from the recorded attempts."""

    id: int  # the attempt id
    ts: int
    source: Literal["agent", "attacker", "fault", "copilot", "other"]
    key: str  # signer seed id
    key_label: str
    principal_id: str | None = None
    district: str | None = None  # the district's display label
    action: str  # pay | swap | raw | lock | ...
    reason_code: str  # exactly what the chain (or the simulate before it) returned
    tx_hash: str | None = None
    simulated: bool
    ref: str  # "attempt:<id>"
