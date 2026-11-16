"""Council votes signed outside the backend (member's own wallet) leave the same proposal fields as `approve`."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from guardian.services import proposal_service as ps
from guardian.services.runtime import Runtime
from tests.test_api import R1_MINH, post


async def _open_proposal(c: httpx.AsyncClient) -> int:
    p = await post(c, "/api/proposals", {"member": "lan", "findingId": R1_MINH}, 201)
    return int(p["id"])


async def test_external_votes_are_recorded(client: httpx.AsyncClient, rt: Runtime) -> None:
    pid = await _open_proposal(client)
    rec = rt.stores.proposals.get(pid)
    assert rec is not None and rec.approved_at == {} and rec.executed_at is None
    ids: set[int] = set()
    for member in ("lan", "trang"):  # signed straight on the chain, not through ps.approve
        res = rt.chain.approve(rt.addr(member), pid)
        assert res.status == "ok"
        for ev in res.events:
            got, graph = ps.sync_council_event(rt, ev)
            ids.update(got)
            assert graph == (ev.name == "Executed")
    assert ids == {pid}
    rec = rt.stores.proposals.get(pid)
    assert rec is not None
    assert set(rec.approved_at) == {"lan", "trang"}
    assert rec.executed_at is not None and rec.executed_tx_hash
    assert rec.resulting_policy_version == 2


async def test_sync_is_idempotent_after_backend_approve(
    client: httpx.AsyncClient, rt: Runtime
) -> None:
    pid = await _open_proposal(client)
    await post(client, f"/api/proposals/{pid}/approve", {"member": "lan"})
    await post(client, f"/api/proposals/{pid}/approve", {"member": "trang"})
    rec = rt.stores.proposals.get(pid)
    assert rec is not None
    before = (
        dict(rec.approved_at),
        rec.executed_at,
        rec.executed_tx_hash,
        rec.resulting_policy_version,
    )
    assert rec.executed_at is not None and rec.resulting_policy_version == 2
    for ev in list(rt.event_log):  # the indexer later sees the very same events
        ps.sync_council_event(rt, ev)
    rec = rt.stores.proposals.get(pid)
    assert rec is not None
    assert (
        dict(rec.approved_at),
        rec.executed_at,
        rec.executed_tx_hash,
        rec.resulting_policy_version,
    ) == before


async def test_unknown_proposal_is_ignored(client: httpx.AsyncClient, rt: Runtime) -> None:
    pid = await _open_proposal(client)
    res = rt.chain.approve(rt.addr("lan"), pid)
    ev = next(e for e in res.events if e.name == "Approved")
    ev.payload["id"] = 9999
    assert ps.sync_council_event(rt, ev) == ((), False)


async def test_l1_hook_follows_and_announces(
    client: httpx.AsyncClient, rt: Runtime, monkeypatch: pytest.MonkeyPatch
) -> None:
    pid = await _open_proposal(client)
    res = rt.chain.approve(rt.addr("lan"), pid)
    ev = next(e for e in res.events if e.name == "Approved")
    rec = rt.stores.proposals.get(pid)
    assert rec is not None
    rec.approved_at.clear()
    announced: list[tuple[int, ...]] = []

    def fake_notify(ids: tuple[int, ...] = (), **_: Any) -> None:
        announced.append(tuple(ids))

    monkeypatch.setattr(rt.settings, "chain_mode", "l1")
    monkeypatch.setattr(rt, "notify_state_changed", fake_notify)
    rt._follow_council_event(ev)
    assert "lan" in rec.approved_at
    assert announced and announced[-1] == (pid,)
