"""CHN-004: app code hands ChainPort hex addresses only (ids stay in stores/API), and SimChain rejects ids."""

from __future__ import annotations

import inspect
import re
from typing import Any

import pytest
from fastapi.testclient import TestClient

from guardian.chain.sim import SimChain
from guardian.domain.address_book import ADDR_ARGS
from guardian.main import create_app
from guardian.services.runtime import Runtime
from tests.conftest import T0, make_settings

HEX = re.compile(r"^0x[0-9a-fA-F]{40}$")
ADDR_PARAMS = {"signer", "member", "key", "to", "token", "dex", "token_in", "token_out"} | {
    "target",
    "holder",
    "subject",
}


class Spy:
    """Wraps a SimChain and records every ChainPort call."""

    def __init__(self, chain: SimChain) -> None:
        self._chain = chain
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __getattr__(self, name: str) -> Any:
        attr = getattr(self._chain, name)
        if not callable(attr) or name.startswith("_"):
            return attr
        sig = inspect.signature(attr)

        def call(*a: Any, **kw: Any) -> Any:
            self.calls.append((name, dict(sig.bind(*a, **kw).arguments)))
            return attr(*a, **kw)

        return call

    def assert_hex(self) -> set[str]:
        seen = set()
        for name, args in self.calls:
            for k, v in args.items():
                if k in ADDR_PARAMS:
                    assert HEX.match(v), f"{name}({k}={v!r})"
            for c in args.get("calls", []):
                for k, v in c["args"].items():
                    if k in ADDR_ARGS:
                        assert HEX.match(v), f"{name}.calls {c['fn']}({k}={v!r})"
            seen.add(name)
        return seen


@pytest.fixture
def spied() -> tuple[TestClient, Spy]:
    settings = make_settings()
    spy = Spy(SimChain(clock=lambda: T0))
    with TestClient(create_app(settings, Runtime(settings, chain=spy))) as c:
        c.post("/api/demo/reset")
        spy.calls.clear()
        yield c, spy  # type: ignore[misc]


def test_scene4_run_passes_hex(spied: tuple[TestClient, Spy]) -> None:
    c, spy = spied
    assert c.post("/api/demo/policy-v2").status_code == 200
    assert c.post("/api/scenario/scene4/run?delay=0&wait=true").status_code == 200
    assert c.post("/api/scenario/scene4/run", json={"step": 7}).status_code == 200  # raw_call
    seen = spy.assert_hex()
    assert {"pay", "swap", "simulate_pay", "simulate_swap", "raw_call"} <= seen


def test_lock_passes_hex(spied: tuple[TestClient, Spy]) -> None:
    c, spy = spied
    assert (
        c.post("/api/actions/lock", json={"member": "lan", "principalId": "minh"}).status_code
        == 200
    )
    assert "emergency_lock" in spy.assert_hex()


def test_propose_and_approvals_pass_hex(spied: tuple[TestClient, Spy]) -> None:
    c, spy = spied
    change = {"kind": "set_district_cap", "principalId": "minh", "cap": 150_000_000_000}
    p = c.post("/api/proposals", json={"member": "lan", "change": change})
    assert p.status_code == 201, p.text
    for m in ("trang", "huy"):
        assert (
            c.post(f"/api/proposals/{p.json()['id']}/approve", json={"member": m}).status_code
            == 200
        )
    assert {"propose", "approve"} <= spy.assert_hex()
    calls = next(a["calls"] for n, a in spy.calls if n == "propose")
    assert any(x["fn"] == "setPrincipalDailyCap" for x in calls)  # `principal_id` stays an id


def test_agent_run_once_passes_hex(spied: tuple[TestClient, Spy]) -> None:
    c, spy = spied
    assert c.post("/api/agent/run-once").json()["outcome"] == "swapped"
    assert {"balance", "simulate_swap", "swap"} <= spy.assert_hex()


def test_sim_rejects_seed_ids() -> None:
    chain = SimChain(clock=lambda: T0)
    k, v = chain._addr("key_minh"), chain._addr("vendor_cloud")
    t = chain._addr("tUSDC")
    with pytest.raises(ValueError, match="expected hex address, got 'key_minh'"):
        chain.pay("key_minh", t, v, 1)
    with pytest.raises(ValueError, match="expected hex address"):
        chain.pay(k, "tUSDC", v, 1)
    with pytest.raises(ValueError, match="expected hex address"):
        chain.emergency_lock("lan", "minh")
    with pytest.raises(ValueError, match="expected hex address"):
        chain.balance("vault", t)
    with pytest.raises(ValueError, match="expected hex address"):
        chain.propose(chain._addr("council_lan"), "t", "minh", [_call("key_minh")], "0x01")


def _call(key: str) -> dict[str, Any]:
    return {"target": "registry", "fn": "deactivateKey", "args": {"key": key}}
