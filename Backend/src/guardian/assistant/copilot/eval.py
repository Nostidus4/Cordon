"""Copilot eval: a fixed set of VI/EN cases run on the sim chain from a fresh demo reset, no LLM, no network.

Same command -> same numbers: the runtime is built with a fixed clock, the cases run in file order, and the report
holds no timestamps or hashes. A case that produces a draft is CONFIRMED by the harness (as a person would), without
`acknowledgeRisk`: a `danger` checkpoint therefore stops it (counted as blocked by checkpoint); otherwise the chain
decides. `wrongTx` marks the cases that must never move money; the headline number is how many of them were stopped.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from guardian.assistant.copilot import executor, service
from guardian.chain.sim import SimChain
from guardian.core.config import Settings
from guardian.core.errors import ApiError
from guardian.services import action_service, demo_reset
from guardian.services.runtime import Runtime

REPORT_VERSION = 1
# 01:00 UTC on a fixed day (same as tests/conftest.py), so the daily caps never roll over mid-run
T0 = 1_800_000_000 - 1_800_000_000 % 86400 + 3600
REPO_ROOT = Path(__file__).resolve().parents[5]
FIXTURE = REPO_ROOT / "Backend" / "tests" / "fixtures" / "copilot_eval.json"
REPORT_NAME = "copilot_eval"
STOPPING = ("refused", "blocked_by_chain", "blocked_by_checkpoint")


def report_dir() -> Path:
    return Path(os.environ.get("COPILOT_EVAL_REPORT_DIR") or REPO_ROOT / "docs" / "reports")


def load_cases(path: Path | None = None) -> list[dict[str, Any]]:
    data = json.loads((path or FIXTURE).read_text(encoding="utf-8"))
    return list(data["cases"])


def fresh_runtime() -> Runtime:
    settings = Settings(
        demo_mode=True,
        chain_mode="sim",
        llm_enabled=False,
        responder_enabled=False,
        rate_limit_per_minute=10**9,
    )
    rt = Runtime(settings, chain=SimChain(clock=lambda: T0))
    asyncio.run(demo_reset.reset(rt))
    return rt


def _run_case(rt: Runtime, case: dict[str, Any]) -> dict[str, Any]:
    for step in case.get("setup", []):
        if "lock" in step:
            action_service.lock(rt, step.get("by", "trang"), step["lock"])
    out = service.handle(rt, case["message"], use_llm=False)
    intent = out["intent"]
    outcome, reason, verified = "unmatched", None, None
    if out["draft"] is not None:
        try:
            done = executor.confirm(rt, out["draft"]["id"], acknowledge_risk=False)
        except ApiError as e:
            if e.code != "RISK_ACK_REQUIRED":
                raise
            outcome = "blocked_by_checkpoint"
        else:
            res = done["result"]
            outcome = "sent" if res["ok"] else "blocked_by_chain"
            reason = res["reasonCode"]
    elif intent in ("forecast_refused", "injection_refused"):
        outcome = "refused"
    elif intent == "read":
        outcome, verified = "answered", bool(out["numbersVerified"])
    wrong = bool(case.get("wrongTx", False))
    return {
        "id": case["id"],
        "message": case["message"],
        "expectedIntent": case["expectedIntent"],
        "intent": intent,
        "intentOk": intent == case["expectedIntent"],
        "wrongTx": wrong,
        "outcome": outcome,
        "stoppedWrongTx": wrong and outcome in STOPPING,
        "reasonCode": reason,
        "numbersVerified": verified,
    }


def summarize(cases: list[dict[str, Any]]) -> dict[str, Any]:
    """Every headline number is recomputed from the per-case rows (the test does the same independently)."""
    wrong = [c for c in cases if c["wrongTx"]]
    valid = [c for c in cases if c["expectedIntent"] in ("pay", "swap") and not c["wrongTx"]]
    reads = [c for c in cases if c["expectedIntent"] == "read"]
    return {
        "total": len(cases),
        "intentAccuracy": {"correct": sum(c["intentOk"] for c in cases), "total": len(cases)},
        "wrongTxBlocked": {
            "blocked": sum(c["stoppedWrongTx"] for c in wrong),
            "total": len(wrong),
            "byRefusal": sum(c["outcome"] == "refused" for c in wrong),
            "byChain": sum(c["outcome"] == "blocked_by_chain" for c in wrong),
            "byCheckpoint": sum(c["outcome"] == "blocked_by_checkpoint" for c in wrong),
        },
        "validSent": {"correct": sum(c["outcome"] == "sent" for c in valid), "total": len(valid)},
        "readsVerified": {
            "correct": sum(bool(c["numbersVerified"]) for c in reads),
            "total": len(reads),
        },
    }


def run_eval(cases: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = cases if cases is not None else load_cases()
    rt = fresh_runtime()
    results = [_run_case(rt, c) for c in rows]
    return {"version": REPORT_VERSION, "chainMode": "sim", **summarize(results), "cases": results}


def render_md(r: dict[str, Any]) -> str:
    a, w, v, rd = r["intentAccuracy"], r["wrongTxBlocked"], r["validSent"], r["readsVerified"]
    lines = [
        "# Copilot eval (B02, CITY-004)",
        "",
        f"Chain: {r['chainMode']} · {r['total']} cases · fresh demo reset · no LLM",
        "",
        f"- Intent accuracy: **{a['correct']}/{a['total']}**",
        (
            f"- Wrong transactions blocked: **{w['blocked']}/{w['total']}** "
            f"(refusal {w['byRefusal']}, chain rule {w['byChain']}, checkpoint {w['byCheckpoint']})"
        ),
        f"- Valid orders sent: {v['correct']}/{v['total']}",
        f"- Read answers with verified numbers: {rd['correct']}/{rd['total']}",
        "",
        "| id | expected | got | outcome | reason |",
        "|---|---|---|---|---|",
    ]
    for c in r["cases"]:
        lines.append(
            f"| {c['id']} | {c['expectedIntent']} | {c['intent']} | {c['outcome']} | {c['reasonCode'] or ''} |"
        )
    return "\n".join(lines) + "\n"


def write_report(r: dict[str, Any], directory: Path | None = None) -> Path:
    d = directory or report_dir()
    d.mkdir(parents=True, exist_ok=True)
    jp = d / f"{REPORT_NAME}.json"
    jp.write_text(
        json.dumps(r, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
    )
    (d / f"{REPORT_NAME}.md").write_text(render_md(r), encoding="utf-8")
    return jp


def read_report(directory: Path | None = None) -> dict[str, Any] | None:
    p = (directory or report_dir()) / f"{REPORT_NAME}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
