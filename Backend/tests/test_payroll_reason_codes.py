"""Payroll reasons: custom error <-> code <-> ABI <-> PAYROLL.md section 5 <-> Frontend payrollReasons.ts (CITY-006)."""

from __future__ import annotations

import json
import re
from pathlib import Path

from guardian.chain.sim.payroll import SimPayroll
from guardian.shared.payroll_reasons import (
    PAYROLL_ERROR_TO_REASON,
    PAYROLL_OTHER_ERRORS,
    PAYROLL_REASON_TABLE,
    PayrollReason,
    payroll_reason_text,
)
from guardian.shared.reason_codes import REASON_TABLE, ReasonCode

REPO = Path(__file__).resolve().parents[2]
ABI_DIR = REPO / "Backend" / "src" / "guardian" / "chain" / "abis" / "payroll"
DOC = (REPO / "docs" / "spec" / "PAYROLL.md").read_text(encoding="utf-8")
TS = (REPO / "Frontend" / "src" / "shared" / "payrollReasons.ts").read_text(encoding="utf-8")


def _abi_errors() -> set[str]:
    out: set[str] = set()
    for p in ABI_DIR.glob("*.json"):
        out |= {
            i["name"] for i in json.loads(p.read_text(encoding="utf-8")) if i["type"] == "error"
        }
    return out


def test_table_complete_and_separate_from_reason_code():
    assert set(PAYROLL_REASON_TABLE) == set(PayrollReason)
    assert len(PayrollReason) == 14  # 13 from section 5 + BLOCKED_AT_PROTOCOL
    assert (set(PayrollReason) - {PayrollReason.BLOCKED_AT_PROTOCOL}).isdisjoint(
        {PayrollReason(c.value) for c in ReasonCode if c.value in PayrollReason.__members__}
    )
    assert len(REASON_TABLE) == 10  # the frozen set is untouched


def test_section_5_table_is_the_source():
    section = DOC.split("## 5.", 1)[1].split("\n## 6.", 1)[0]
    rows = re.findall(
        r"^\| `(\w+)\([^`]*\)`(?: / `\w+\(\)`)? \| `(\w+)` \| ([^|]+) \| ([^|]+) \|",
        section,
        flags=re.MULTILINE,
    )
    assert len(rows) == 13
    for err, code, vi, en in rows:
        info = PAYROLL_REASON_TABLE[PayrollReason(code)]
        assert (info.error, info.vi, info.en) == (err, vi.strip(), en.strip()), code
    assert PAYROLL_ERROR_TO_REASON["AlreadyPaid"] == PayrollReason.PAYROLL_ALREADY_PAID


def test_every_mapped_and_unmapped_error_exists_in_abi():
    errors = _abi_errors()
    mapped = set(PAYROLL_ERROR_TO_REASON)
    assert mapped <= errors, mapped - errors
    assert PAYROLL_OTHER_ERRORS <= errors, PAYROLL_OTHER_ERRORS - errors
    assert not (mapped & PAYROLL_OTHER_ERRORS)
    # every ABI error is either coded or documented as code-less (VenueImpairedError etc. included)
    assert errors <= mapped | PAYROLL_OTHER_ERRORS, errors - (mapped | PAYROLL_OTHER_ERRORS)


def test_texts():
    assert payroll_reason_text("VENUE_CAP_EXCEEDED") == "Đã chạm 40% cho một nơi"
    assert payroll_reason_text(PayrollReason.KILL_SWITCH_ACTIVE, "en") == "Kill switch active"


def test_frontend_mirror_has_same_table():
    body = TS.split("PAYROLL_REASONS", 1)[1]
    ts_rows = {
        m[0]: (None if m[1] == "null" else m[1].strip('"'), m[2], m[3])
        for m in re.findall(r'(\w+): \{ error: ("?\w+"?), vi: "([^"]+)", en: "([^"]+)" \}', body)
    }
    py_rows = {c.value: (i.error, i.vi, i.en) for c, i in PAYROLL_REASON_TABLE.items()}
    assert ts_rows == py_rows
    union = re.search(r"export type PayrollReason =(.*?);", TS, flags=re.DOTALL)
    assert union
    assert set(re.findall(r'"(\w+)"', union.group(1))) == set(py_rows)


def test_sim_reverts_map_to_the_declared_codes():
    from guardian.chain.sim.payroll import PAYROLL_AGENT, PAYROLL_KEEPER, VENUE_A

    sim = SimPayroll.demo(clock=lambda: 1_800_000_000)
    assert (
        sim.allocate(PAYROLL_KEEPER, VENUE_A, 1).reason_code == PayrollReason.AGENT_NOT_AUTHORIZED
    )
    assert sim.execute_payroll(PAYROLL_KEEPER).reason_code == PayrollReason.PAYDAY_NOT_REACHED
    assert sim.unwind(PAYROLL_AGENT, VENUE_A, 1).error_raw == "ExceedsDeployed"
    assert sim.unwind(PAYROLL_AGENT, VENUE_A, 1).reason_code is None
