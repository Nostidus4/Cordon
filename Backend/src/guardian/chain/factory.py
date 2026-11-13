"""What services may use of the sim package: default chain and seed data (services never touch SimChain internals)."""

from __future__ import annotations

from guardian.chain.sim.engine import SimChain, load_seed
from guardian.chain.sim.reference import reference_v2_snapshot

__all__ = ["load_seed", "new_sim_chain", "reference_v2_snapshot"]


def new_sim_chain() -> SimChain:
    return SimChain()
