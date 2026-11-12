"""`policyLabel` = policyVersion - policyBaseline + 1 (OPS-003): scene 1 is always "policy v1"."""

from __future__ import annotations

from typing import Any

from guardian.chain.l1.deployments import parse_deployments
from guardian.chain.sim import SimChain

ADDR = "0x" + "11" * 20


def test_baseline_is_read_from_the_deployments_file() -> None:
    base = {"contracts": {"registry": ADDR, "vault": ADDR}}
    assert parse_deployments(base).policy_baseline == 1  # files written before OPS-003
    assert parse_deployments({**base, "policyBaseline": 4}).policy_baseline == 4


def test_label_counts_from_the_baseline() -> None:
    snap = SimChain().snapshot()
    assert (snap.policy_version, snap.policy_baseline, snap.policy_label) == (1, 1, 1)
    snap.policy_version, snap.policy_baseline = 4, 4  # real L1 after seed + handover
    assert snap.policy_label == 1
    snap.policy_version = 5  # after the merge proposal
    assert snap.policy_label == 2


async def test_api_exposes_raw_version_and_label(client: Any) -> None:
    g = (await client.get("/api/graph")).json()
    assert g["policyVersion"] == 1 and g["policyLabel"] == 1
    h = (await client.get("/api/health")).json()
    assert h["policyVersion"] == 1 and h["policyLabel"] == 1
