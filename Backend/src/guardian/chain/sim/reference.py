"""Pure helper on a throwaway SimChain: the reference state the seeded request #12 is evaluated on."""

from __future__ import annotations

from guardian.chain.sim.engine import SimChain
from guardian.domain.snapshot import PolicySnapshot


def reference_v2_snapshot() -> PolicySnapshot:
    """Clean policy-v2 state (no spend)."""
    ref = SimChain()
    ref.apply_policy_v2()
    return ref.snapshot()
