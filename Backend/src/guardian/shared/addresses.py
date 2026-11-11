"""Deterministic simulated addresses derived from seed ids (sim chain + seed JSON)."""

from __future__ import annotations

from eth_utils import keccak, to_checksum_address


def derive_address(seed_id: str) -> str:
    """checksum(keccak("guardian:" + seed_id)[-20:])."""
    return to_checksum_address(keccak(text="guardian:" + seed_id)[-20:])
