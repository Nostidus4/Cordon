"""Parity between docs/spec/PAYROLL.md, contracts/src/payroll/interfaces/*.sol and the backend ABI copies (CITY-006).

Separate from test_contract_abi.py (the CONTRACTS.md set is frozen and untouched). Fails when a function,
event, error or its argument count drifts between the doc, the interfaces and abis/payroll/*.json.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from eth_utils import keccak

REPO = Path(__file__).resolve().parents[2]
ABI_DIR = REPO / "Backend" / "src" / "guardian" / "chain" / "abis" / "payroll"
IFACE_DIR = REPO / "contracts" / "src" / "payroll" / "interfaces"
DOC = (REPO / "docs" / "spec" / "PAYROLL.md").read_text(encoding="utf-8")

# interface file -> interfaces it declares (doc code blocks 2.1 .. 2.6, in document order)
FILES = {
    "IVenue": ["IVenue", "IMockVenue"],
    "IPayrollVault": ["IPayrollVault"],
    "IFloatPolicy": ["IFloatPolicy"],
    "ILadderScheduler": ["ILadderScheduler"],
    "IPayrollExecutor": ["IPayrollExecutor"],
    "IPayrollGovernor": ["IPayrollGovernor"],
}
DOC_BLOCKS = re.findall(r"```solidity\n(.*?)```", DOC, flags=re.DOTALL)


def _abi(name: str) -> list[dict[str, Any]]:
    return json.loads((ABI_DIR / f"{name}.json").read_text(encoding="utf-8"))


def _norm(src: str) -> str:
    """`forge fmt` moves whitespace and trailing comments; compare code tokens only."""
    return re.sub(r"\s+", "", re.sub(r"//[^\n]*", "", src))


def _iface_body(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    return text.split("\n", 4)[4]  # drop SPDX, pragma, blank, header comment


def _declared(src: str, iface: str) -> dict[str, dict[str, int]]:
    """name -> arg count, for functions/events/errors declared directly inside `interface iface`."""
    body = re.search(rf"interface {iface}\b[^{{]*\{{(.*?)\n\}}", src, flags=re.DOTALL)
    assert body, iface
    out: dict[str, dict[str, int]] = {"function": {}, "event": {}, "error": {}}
    for kind, name, args in re.findall(
        r"\b(function|event|error)\s+(\w+)\s*\(([^)]*)\)", body.group(1)
    ):
        out[kind][name] = len([a for a in args.split(",") if a.strip()])
    return out


def _abi_shape(abi: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {"function": {}, "event": {}, "error": {}}
    for item in abi:
        if item["type"] in out:
            out[item["type"]][item["name"]] = len(item["inputs"])
    return out


def test_doc_has_one_block_per_interface_file():
    assert len(DOC_BLOCKS) == len(FILES)


def test_interface_files_match_doc_blocks_exactly():
    for block, name in zip(DOC_BLOCKS, FILES, strict=True):
        assert _norm(_iface_body(IFACE_DIR / f"{name}.sol")) == _norm(block), name


def test_abi_files_one_per_interface():
    expected = sorted(i for ifs in FILES.values() for i in ifs)
    assert sorted(p.stem for p in ABI_DIR.glob("*.json")) == expected


def test_abi_matches_interface_declarations():
    for fname, ifaces in FILES.items():
        src = (IFACE_DIR / f"{fname}.sol").read_text(encoding="utf-8")
        for iface in ifaces:
            declared = _declared(src, iface)
            shape = _abi_shape(_abi(iface))
            if iface == "IMockVenue":  # inherits IVenue's functions
                declared["function"].update(_declared(src, "IVenue")["function"])
            assert shape == declared, iface


def test_doc_section_5_errors_exist_in_abi():
    section = DOC.split("## 5.", 1)[1].split("\n## 6.", 1)[0]
    names = set(re.findall(r"^\| `(\w+)\(", section, flags=re.MULTILINE))
    all_errors = {
        i["name"]
        for ifc in (a for fs in FILES.values() for a in fs)
        for i in _abi(ifc)
        if i["type"] == "error"
    }
    assert names <= all_errors, names - all_errors
    assert (
        len(names) == 13
    )  # one per table row (AlreadyPaid shares the last row with AlreadyExecuted)


def test_error_selectors_are_unique_per_signature():
    sigs: dict[str, str] = {}
    for fs in FILES.values():
        for iface in fs:
            for i in _abi(iface):
                if i["type"] == "error":
                    sig = f"{i['name']}({','.join(x['type'] for x in i['inputs'])})"
                    sigs[sig] = "0x" + keccak(text=sig)[:4].hex()
    assert len(set(sigs.values())) == len(sigs)
    assert sigs["InsufficientFunds(uint256,uint256)"].startswith("0x")


def test_hard_floors_present_in_policy_abi():
    names = {i["name"] for i in _abi("IFloatPolicy") if i["type"] == "function"}
    assert {"MAX_VENUE_BPS", "MIN_BUFFER_BPS", "MIN_DEADLINE_LEAD", "MAX_VENUES"} <= names


def test_agent_surface_has_no_recipient_argument():
    """AC2 at ABI level: the agent-callable functions take only (venue, amount)."""
    funcs = {i["name"]: i for i in _abi("ILadderScheduler") if i["type"] == "function"}
    assert [x["name"] for x in funcs["allocate"]["inputs"]] == ["venue", "amount"]
    assert [x["name"] for x in funcs["unwind"]["inputs"]] == ["venue", "amount"]
    assert funcs["unwindDue"]["inputs"][0]["name"] == "venue"
    assert funcs["finalize"]["inputs"] == []
    assert next(i for i in _abi("IPayrollExecutor") if i["name"] == "execute")["inputs"] == []
