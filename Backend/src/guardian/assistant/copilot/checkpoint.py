"""Checkpoint hook to B05 Tx Guardian (CITY-003 / #62), built so the Copilot works before and after it exists.

The Copilot hands every prepared transaction to a `Checkpoint` before it is shown for confirmation. The default one
looks up `guardian.txguard.service` with `importlib` and calls `check(rt, prepared)`; when that module is absent (or
fails) it returns None and the draft simply has no check. The input uses EXACTLY the B05 `PreparedTx` field names:

    kind ("pay"|"swap"|"approve"|"raw"), signer (key hex), token, to, amount (raw int as decimal string),
    tokenOut, minOut, data, memo, source ("paste"|"city"|"copilot"|"attacker")   -- here always source="copilot"

The output needs `id` and `level` ("safe"|"caution"|"danger"); anything else on it is ignored.
"""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from typing import Any, Protocol

log = logging.getLogger("guardian.copilot")

LEVELS = ("safe", "caution", "danger")
SERVICE_MODULE = "guardian.txguard.service"
# where B05 may define the PreparedTx model; the first one that imports is used to build the argument, else a plain dict
SCHEMA_MODULES = ("guardian.schemas.txguard", "guardian.txguard.schemas")


@dataclass(frozen=True)
class CheckpointResult:
    id: str
    level: str  # safe | caution | danger


class Checkpoint(Protocol):
    def check(self, rt: Any, prepared: dict[str, Any]) -> CheckpointResult | None: ...


def _field(obj: Any, name: str) -> Any:
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


def _as_prepared(prepared: dict[str, Any]) -> Any:
    for mod_name in SCHEMA_MODULES:
        try:
            model = getattr(importlib.import_module(mod_name), "PreparedTx", None)
        except ImportError:
            continue
        if model is not None:
            return model.model_validate(
                prepared
            )  # a mismatch raises: caught in check(), logged, no check
    return prepared


class TxGuardCheckpoint:
    """Default: B05 `guardian.txguard.service.check` when it exists, else no check."""

    def check(self, rt: Any, prepared: dict[str, Any]) -> CheckpointResult | None:
        try:
            service = importlib.import_module(SERVICE_MODULE)
        except ImportError:
            return None
        fn = getattr(service, "check", None)
        if fn is None:
            return None
        try:
            out = fn(rt, _as_prepared(prepared))
        except Exception:
            log.warning("txguard check failed for a copilot draft", exc_info=True)
            return None
        level, cid = _field(out, "level"), _field(out, "id")
        if level not in LEVELS or cid is None:
            return None
        return CheckpointResult(str(cid), str(level))


def default_checkpoint() -> Checkpoint:
    return TxGuardCheckpoint()
