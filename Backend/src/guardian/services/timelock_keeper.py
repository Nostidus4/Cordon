"""Timelock keeper (#77): executes Council proposals whose timelock has passed.

Only with DEMO_MODE (it signs with a Council member's demo key). Without it nothing is signed: B01.queued
says a member has to execute. `tick` is idempotent and safe to call on any cadence; the API process runs it
every second (`Runtime.start_keeper`). An execute that reverts (not ready yet on the chain's clock, already
executed, vetoed meanwhile) is simply retried or dropped on the next tick.
"""

from __future__ import annotations

import logging
import weakref
from typing import TYPE_CHECKING, Any

from guardian.chain.errors import ChainRevert
from guardian.core.errors import ApiError
from guardian.services import proposal_service as ps

if TYPE_CHECKING:
    from guardian.services.runtime import Runtime

log = logging.getLogger("guardian.keeper")

# (id, created_at) of proposals that are executed or cancelled on the chain, per chain object (final: never read again).
_terminal: weakref.WeakKeyDictionary[Any, set[tuple[int, int]]] = weakref.WeakKeyDictionary()


def tick(rt: Runtime) -> list[int]:
    """Execute every queued proposal whose eta has passed on `rt.now()`; returns the ids executed."""
    if not rt.settings.demo_enabled:
        return []
    chain = rt.chain
    seen = _terminal.get(chain)
    if seen is None:  # a new chain (reload_deployment) starts its proposal ids over
        _terminal.clear()
        seen = _terminal[chain] = set()
    signer: str | None = None
    done: list[int] = []
    for rec in rt.stores.proposals.all():
        if rec.executed_at is not None or (rec.id, rec.created_at) in seen:
            continue  # nothing left to do: do not re-read it from the chain every second (#109)
        try:
            cp = chain.proposal_state(rec.id)
        except KeyError:
            continue
        if cp.executed or cp.cancelled:
            seen.add((rec.id, rec.created_at))
            continue
        if not cp.queued or cp.eta is None or rt.now() < cp.eta:
            continue
        if signer is None:
            council = rt.snapshot().council
            if not council:
                return done
            signer = council[0].id
        try:
            ps.execute(rt, rec.id, signer)
        except (ChainRevert, ApiError) as e:
            log.info("keeper could not execute proposal %s yet: %s", rec.id, e)
            continue
        done.append(rec.id)
    return done
