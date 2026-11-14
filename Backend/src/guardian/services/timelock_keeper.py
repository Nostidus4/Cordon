"""Timelock keeper (#77): executes Council proposals whose timelock has passed.

Only with DEMO_MODE (it signs with a Council member's demo key). Without it nothing is signed: B01.queued
says a member has to execute. `tick` is idempotent and safe to call on any cadence; the API process runs it
every second (`Runtime.start_keeper`). An execute that reverts (not ready yet on the chain's clock, already
executed, vetoed meanwhile) is simply retried or dropped on the next tick.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from guardian.chain.errors import ChainRevert
from guardian.core.errors import ApiError
from guardian.services import proposal_service as ps

if TYPE_CHECKING:
    from guardian.services.runtime import Runtime

log = logging.getLogger("guardian.keeper")


def tick(rt: Runtime) -> list[int]:
    """Execute every queued proposal whose eta has passed on `rt.now()`; returns the ids executed."""
    if not rt.settings.demo_enabled:
        return []
    snap = rt.snapshot()
    if not snap.council:
        return []
    signer = snap.council[0].id
    done: list[int] = []
    for rec in rt.stores.proposals.all():
        try:
            cp = rt.chain.proposal_state(rec.id)
        except KeyError:
            continue
        if not cp.queued or cp.eta is None or rt.now() < cp.eta:
            continue
        try:
            ps.execute(rt, rec.id, signer)
        except (ChainRevert, ApiError) as e:
            log.info("keeper could not execute proposal %s yet: %s", rec.id, e)
            continue
        done.append(rec.id)
    return done
