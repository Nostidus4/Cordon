"""Run the Copilot eval (CITY-004): `make copilot-eval` or `cd Backend && uv run python scripts/copilot_eval.py`.

Sim chain, fresh demo reset, deterministic parser (no LLM, no network). Writes docs/reports/copilot_eval.json and .md
(override the directory with COPILOT_EVAL_REPORT_DIR) and prints the two headline numbers.
"""

from __future__ import annotations

import sys

from guardian.assistant.copilot import eval as ev


def main() -> int:
    report = ev.run_eval()
    path = ev.write_report(report)
    a, w = report["intentAccuracy"], report["wrongTxBlocked"]
    print(f"intent accuracy: {a['correct']}/{a['total']}")
    print(
        f"wrong transactions blocked: {w['blocked']}/{w['total']} "
        f"(refusal {w['byRefusal']}, chain {w['byChain']}, checkpoint {w['byCheckpoint']})"
    )
    print(f"valid orders sent: {report['validSent']['correct']}/{report['validSent']['total']}")
    print(
        f"read answers verified: {report['readsVerified']['correct']}/{report['readsVerified']['total']}"
    )
    print(f"report: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
