"""Parity between contracts/ interfaces (ABI copies), docs/spec/CONTRACTS.md, reason codes and ChainEvent.

Fails when a custom-error selector, an event topic, a function name or an event payload field
drifts between the frozen ABI, the doc and the backend (CTR-001).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
from eth_utils import keccak

from guardian.chain.errors import ERROR_TO_REASON, OTHER_ERRORS, REASON_TO_ERROR
from guardian.chain.sim import SimChain
from guardian.shared.money import to_base
from guardian.shared.reason_codes import REASON_TABLE, ReasonCode

REPO = Path(__file__).resolve().parents[2]
ABI_DIR = REPO / "Backend" / "src" / "guardian" / "chain" / "abis"
CONTRACTS_DOC = (REPO / "docs" / "spec" / "CONTRACTS.md").read_text(encoding="utf-8")
API_DOC = (REPO / "docs" / "spec" / "API_CONTRACT.md").read_text(encoding="utf-8")
INTERFACES = ["IPrincipalRegistry", "IPolicyVault", "IGuardianCouncil", "IMockDEX"]
# Off-chain: log of the Tx AllowList precompile, normalised by the indexer (CONTRACTS.md section 7).
OFF_CHAIN_EVENTS = {"AllowListRoleSet"}
# Raised by the Python sim only; no on-chain equivalent.
SIM_ONLY_ERRORS = {"InsufficientBalance", "InsufficientTreasury"}


def _abi(name: str) -> list[dict[str, Any]]:
    return json.loads((ABI_DIR / f"{name}.json").read_text(encoding="utf-8"))


ABIS = {n: _abi(n) for n in INTERFACES}


def _sig(item: dict[str, Any]) -> str:
    return f"{item['name']}({','.join(i['type'] for i in item['inputs'])})"


def _entries(kind: str) -> dict[str, dict[str, Any]]:
    """signature -> abi item, across all interfaces (same signature in two files must be identical)."""
    out: dict[str, dict[str, Any]] = {}
    for abi in ABIS.values():
        for item in abi:
            if item["type"] == kind:
                out[_sig(item)] = item
    return out


ERRORS = _entries("error")
EVENTS = _entries("event")


def _doc_table(heading: str) -> dict[str, str]:
    """`signature` -> hex from a `| `sig` | `0x..` | ... |` table under `heading`."""
    section = CONTRACTS_DOC.split(heading, 1)[1].split("\n###", 1)[0].split("\n## ", 1)[0]
    return dict(re.findall(r"^\| `([^`]+)` \| `(0x[0-9a-f]+)` \|", section, flags=re.MULTILINE))


def test_abi_files_exist_one_per_interface():
    on_disk = sorted(p.stem for p in ABI_DIR.glob("*.json"))
    assert on_disk == sorted(INTERFACES)


def test_doc_error_selectors_match_abi():
    doc = _doc_table("### 9.1")
    computed = {s: "0x" + keccak(text=s)[:4].hex() for s in ERRORS}
    assert doc == computed


def test_doc_event_topics_match_abi():
    doc = _doc_table("### 9.2")
    computed = {s: "0x" + keccak(text=s).hex() for s in EVENTS}
    assert doc == computed


def test_doc_solidity_blocks_declare_same_names_as_abi():
    """Function / event / error names in the doc's ```solidity blocks == the ABI per interface."""
    blocks = re.findall(r"```solidity\n(.*?)```", CONTRACTS_DOC, flags=re.DOTALL)
    doc_names: dict[str, set[tuple[str, str]]] = {}
    for block in blocks:
        m = re.search(r"interface (\w+)", block)
        assert m, "solidity block without an interface"
        names = {("function", n) for n in re.findall(r"function (\w+)\(", block)}
        names |= {("event", n) for n in re.findall(r"\bevent (\w+)\(", block)}
        names |= {("error", n) for n in re.findall(r"\berror (\w+)\(", block)}
        doc_names[m.group(1)] = names
    assert sorted(doc_names) == sorted(INTERFACES)
    for iface, abi in ABIS.items():
        abi_names = {
            (i["type"], i["name"]) for i in abi if i["type"] in {"function", "event", "error"}
        }
        assert doc_names[iface] == abi_names, iface


def test_nine_reason_errors_map_to_nine_contract_reason_codes():
    vault = {e["name"] for e in ABIS["IPolicyVault"] if e["type"] == "error"}
    contract_codes = [c for c in ReasonCode if c is not ReasonCode.BLOCKED_AT_PROTOCOL]
    assert len(contract_codes) == 9
    for code in contract_codes:
        err = REASON_TO_ERROR[code]
        assert err in vault, code
        assert ERROR_TO_REASON[err] is code
    # BLOCKED_AT_PROTOCOL is RPC-only: no custom error anywhere
    assert REASON_TABLE[ReasonCode.BLOCKED_AT_PROTOCOL].error is None
    assert ReasonCode.BLOCKED_AT_PROTOCOL not in ERROR_TO_REASON.values()


def test_doc_section5_table_matches_reason_codes():
    section = CONTRACTS_DOC.split("## 5.", 1)[1].split("\n## ", 1)[0]
    rows = re.findall(r"^\| `(\w+)\(\)` \| `(\w+)` \|", section, flags=re.MULTILINE)
    doc = dict(rows)
    assert doc == {e: c.value for e, c in ERROR_TO_REASON.items()}
    assert "DISTRICT_DAILY_CAP" in doc.values() and "PRINCIPAL_DAILY_CAP" not in doc.values()


def test_every_abi_error_is_a_reason_code_or_a_declared_other_error():
    names = {e["name"] for e in ERRORS.values()}
    assert names <= set(ERROR_TO_REASON) | OTHER_ERRORS
    # and every declared "other" error (except sim-only) really exists in an interface
    assert OTHER_ERRORS - SIM_ONLY_ERRORS <= names


def test_selectors_are_unique_across_error_names():
    sels = [keccak(text=s)[:4] for s in ERRORS]
    assert len(set(sels)) == len(sels)


def _chain_event_names_from_api_doc() -> set[str]:
    section = API_DOC.split("## 2. ChainEvent", 1)[1].split("\n## ", 1)[0]
    names: set[str] = set()
    for row in re.findall(r"^\| ([^|]+) \|", section, flags=re.MULTILINE):
        names |= set(re.findall(r"`([A-Z]\w+)`", row))
    return names - {"name"}


def test_every_chain_event_has_a_contract_event_or_is_off_chain():
    api = _chain_event_names_from_api_doc()
    abi_events = {e["name"] for e in EVENTS.values()}
    assert api, "no event names parsed from API_CONTRACT.md section 2"
    assert api - OFF_CHAIN_EVENTS <= abi_events
    # reverse: no contract event is missing from the ChainEvent table
    assert abi_events <= api


def _sim_events() -> list[Any]:
    c = SimChain(clock=lambda: 1_800_000_000 - 1_800_000_000 % 86400 + 3600)
    c.apply_policy_v2()
    sel = c._meta[c._addr("mock_dex")]["selector"]
    c.pay("key_minh", "tUSDC", "vendor_cloud", to_base(1))
    c.swap("key_agent_rebalance", "mock_dex", sel, "tUSDC", "tTKB", to_base(5_000), 0)
    c.lower_key_cap("huy", c._addr("key_minh"), to_base(10_000))
    c.lower_district_cap("trang", "minh", to_base(5_000))
    c.revoke_allow("lan", "recipient", "vendor_cloud")
    c.deactivate_key("huy", "key_huy_2")
    c.emergency_pause("trang")
    c.emergency_lock("trang", "minh")
    pid = c.propose(
        "trang", "unpause", None, [{"target": "vault", "fn": "unpauseAll", "args": {}}], "0x00"
    ).proposal_id
    c.approve("trang", pid)
    c.approve("huy", pid)
    pid2 = c.propose(
        "lan",
        "x",
        "minh",  # the declared subject must be among the principals the calls touch
        [{"target": "vault", "fn": "unlockPrincipal", "args": {"principal_id": "minh"}}],
        "0x00",
    ).proposal_id
    c.cancel("lan", pid2)
    c.topup(to_base(1_000))
    return list(c.events)


@pytest.mark.parametrize("ev", _sim_events(), ids=lambda e: f"{e.name}@{e.block}")
def test_sim_event_payload_fields_match_abi_inputs(ev):
    """What the sim emits (and the API/indexer consume) uses exactly the ABI parameter names."""
    if ev.name in OFF_CHAIN_EVENTS:  # precompile log, normalised (CONTRACTS.md section 7)
        assert set(ev.payload) == {"key", "role", "by"}
        return
    abi_by_name = {e["name"]: e for e in EVENTS.values()}
    assert ev.name in abi_by_name, ev.name
    assert set(ev.payload) == {i["name"] for i in abi_by_name[ev.name]["inputs"]}, ev.name


def test_sim_run_covers_most_events():
    emitted = {e.name for e in _sim_events()}
    expected = {e["name"] for e in EVENTS.values()}
    # Not emitted by this scenario but present in the ABI; fine, just keep the gap visible.
    assert emitted <= expected | OFF_CHAIN_EVENTS
    assert {
        "Paid",
        "Swapped",
        "Proposed",
        "Approved",
        "Executed",
        "Cancelled",
        "TopUpRecorded",
    } <= emitted


def test_top_up_operator_is_in_the_frozen_interface():
    vault = {(i["type"], i["name"]) for i in ABIS["IPolicyVault"]}
    assert {
        ("function", "topUpOperator"),
        ("function", "setTopUpOperator"),
        ("function", "recordTopUp"),
        ("event", "TopUpOperatorChanged"),
    } <= vault


def test_deployer_is_not_a_permanent_role_in_the_doc():
    """No privilege may be tied to the deployer after handover (spec 6.1, T15)."""
    for line in CONTRACTS_DOC.splitlines():
        if "deployer" in line.lower() and "Contract Deployer AllowList" not in line:
            ok = any(w in line.lower() for w in ("bàn giao", "handover"))
            assert ok, f"deployer mentioned without handover qualifier: {line[:120]}"
        assert "hoặc deployer" not in line.lower()
    sec = CONTRACTS_DOC.split("### 3.1", 1)[1].split("\n## ", 1)[0]
    assert "VerifyHandover" in sec and "topUpOperator() != deployer" in sec
