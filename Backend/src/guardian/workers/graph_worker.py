"""Bump the graph version and announce `graph_updated` when a registry/policy event arrives."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from guardian.chain.base import ChainEvent
from guardian.core.logging import event_extra
from guardian.domain.snapshot import PolicySnapshot

log = logging.getLogger(__name__)

# Events that change the graph. Spend events (Paid, Swapped, TopUpRecorded) and council votes
# (Approved, Cancelled) do not.
GRAPH_EVENTS = frozenset(
    {
        "PrincipalCreated",
        "PrincipalLocked",
        "PrincipalUnlocked",
        "KeyAdded",
        "KeyMoved",
        "KeyDeactivated",
        "CapChanged",
        "AllowChanged",
        "AllowListRoleSet",
        "TopUpOperatorChanged",
        "PolicyVersionBumped",
        "Paused",
        "Unpaused",
        "Executed",
        "EmergencyAction",
    }
)


class GraphWorker:
    def __init__(
        self,
        snapshot: Callable[[], PolicySnapshot],
        publish: Callable[[str, dict[str, Any]], None],
        version: int = 1,
    ) -> None:
        self.snapshot, self.publish, self.version = snapshot, publish, version

    def handle(self, ev: ChainEvent) -> bool:
        if ev.name not in GRAPH_EVENTS:
            return False
        self.version += 1
        snap = self.snapshot()
        log.info("graph updated", extra=event_extra(ev))
        self.publish(
            "graph_updated",
            {
                "graphVersion": self.version,
                "policyVersion": snap.policy_version,
                "policyLabel": snap.policy_label,
                "block": snap.block,
            },
        )
        return True
