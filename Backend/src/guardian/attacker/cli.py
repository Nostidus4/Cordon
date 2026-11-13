"""`uv run guardian-attacker scene4 --step all|N|7 [--dry-run] [--delay S]` (spec §4.3, §7.2).

Testnet keys only. Keys are read from `.env.attacker` (git-ignored, see `.env.attacker.example`)
and are never printed. The CLI talks to a `ChainPort` only: today the in-memory SimChain, later the
L1 adapter. Each executed step is reported to `POST /api/attempts` (or recorded locally).

Exit codes: 0 every step matched the §4.3 table | 1 a step differed from the table (or the lock
never came) | 2 usage/config error | 3 attempts could not be reported to the API.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, TextIO

import httpx

from guardian.attacker.steps import (
    ATTACK_STEPS,
    STEP7,
    STEP_BY_NUMBER,
    StepReport,
    address_resolver,
    execute_step,
)
from guardian.chain.base import ChainPort
from guardian.shared.money import fmt_display
from guardian.shared.scenario4 import SCENARIO4_DISTRICT, SCENARIO4_STEPS, Scenario4Step

EXIT_OK, EXIT_MISMATCH, EXIT_USAGE, EXIT_REPORT = 0, 1, 2, 3
DEFAULT_DELAY = 3.0
KEY_ENV = {
    "key_minh": "KEY_MINH_PK",
    "key_agent_data": "KEY_AGENT_DATA_PK",
    "key_agent_intl_pay": "KEY_AGENT_INTL_PAY_PK",
    "key_agent_rebalance": "KEY_AGENT_REBALANCE_PK",
    "key_svc_payment": "KEY_SVC_PAYMENT_PK",
}
_STEP6 = SCENARIO4_STEPS[6]


class UsageError(Exception):
    pass


def load_keys(path: Path) -> dict[str, str]:
    """seed id -> private key for the 5 attacker keys. Missing file = no keys (sim needs none)."""
    env: dict[str, str] = {}
    if path.is_file():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip("'\"")
    return {sid: env[name] for sid, name in KEY_ENV.items() if env.get(name)}


def missing_keys(keys: dict[str, str]) -> list[str]:
    return [name for sid, name in KEY_ENV.items() if sid not in keys]  # names, never values


def build_sim_chain(prepare: bool = True) -> ChainPort:
    """Fresh SimChain. `prepare` = policy v2 + the morning agent swap (step 0), the state scene 4
    starts from (spec §4.3)."""
    from guardian.chain.sim import SimChain

    chain = SimChain()
    if prepare:
        chain.apply_policy_v2()
        # agent step: primes the 5.000 already spent
        execute_step(chain, SCENARIO4_STEPS[0], address_resolver(chain))
    return chain


def _fmt_amount(r: StepReport) -> str:
    if not r.amount:
        return "-"
    return fmt_display(r.amount, 18 if r.token in ("tTKB", "tSCAM") else 6)


def render_table(reports: Sequence[StepReport], out: TextIO) -> None:
    rows = [("#", "time", "signer", "action", "amount", "to", "result", "tx", "ok?")]
    for r in reports:
        if r.sent:
            res = "ok" if r.outcome == "ok" else (r.reason_code or str(r.outcome))
        else:
            res = f"dry-run: {r.sim_reason or ('n/a' if r.step == STEP7.step else 'would pass')}"
        rows.append(
            (
                str(r.step),
                r.display_time,
                r.signer,
                r.action,
                _fmt_amount(r),
                r.to or "-",
                res,
                (r.tx_hash or "-")[:14],
                "yes" if r.matches_expected else "NO",
            )
        )
    widths = [max(len(row[i]) for row in rows) for i in range(len(rows[0]))]
    for row in rows:
        print("  ".join(c.ljust(w) for c, w in zip(row, widths, strict=True)).rstrip(), file=out)


def attacker_total(reports: Sequence[StepReport]) -> int:
    """tUSDC the attacker actually moved (steps 1-5 that went through)."""
    return sum(
        r.amount or 0
        for r in reports
        if r.sent and r.outcome == "ok" and r.token == "tUSDC" and 1 <= r.step <= 5
    )


def wait_for_lock(
    chain: ChainPort,
    principal: str,
    timeout: float,
    poll: float = 1.0,
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    waited = 0.0
    while True:
        p = chain.snapshot().principals.get(principal)
        if p is not None and p.locked:
            return True
        if waited >= timeout:
            return False
        sleep(poll)
        waited += poll


class Reporter:
    """POST /api/attempts, or append to a local JSONL when no API is configured."""

    def __init__(
        self,
        api_url: str | None,
        local_path: Path | None,
        run_id: str | None,
        client: httpx.Client | None = None,
    ) -> None:
        self.client = client or httpx.Client(timeout=10)
        self.api_url = api_url.rstrip("/") if api_url else None
        self.local_path = local_path
        self.run_id = run_id
        self.recorded: list[dict[str, Any]] = []
        self.failures = 0

    def report(self, r: StepReport) -> None:
        body = r.attempt_body(self.run_id)
        self.recorded.append(body)
        if self.api_url:
            try:
                self.client.post(f"{self.api_url}/api/attempts", json=body).raise_for_status()
                return
            except httpx.HTTPError as e:
                self.failures += 1
                print(f"warning: could not report step {r.step} to API: {e}", file=sys.stderr)
        if self.local_path:
            with self.local_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(body) + "\n")


def parse_steps(step: str) -> list[Scenario4Step]:
    if step == "all":
        return list(ATTACK_STEPS)
    try:
        n = int(step)
    except ValueError:
        raise UsageError(f"--step must be 'all' or a step number 1-5/7, got {step!r}") from None
    if n not in STEP_BY_NUMBER:
        raise UsageError(f"--step {n}: attacker steps are 1-5 and 7 (0 = agent, 6 = council lock)")
    return [STEP_BY_NUMBER[n]]


def run_scene4(
    chain: ChainPort,
    steps: Sequence[Scenario4Step],
    *,
    dry_run: bool,
    delay: float,
    reporter: Reporter | None,
    wait_lock: bool,
    lock_timeout: float,
    simulate_lock: bool,
    out: TextIO,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[list[StepReport], bool]:
    """Returns (reports, lock_seen). Prints each step as it happens, then the table."""
    reports: list[StepReport] = []
    addr = address_resolver(chain)
    if simulate_lock and not dry_run and steps and steps[0].step == STEP7.step:
        chain.emergency_lock(addr(_STEP6.signer), _STEP6.params["principal_id"])  # step 6 stand-in
    for i, s in enumerate(steps):
        if i and delay > 0:
            sleep(delay)
        r = execute_step(chain, s, addr, dry_run=dry_run)
        reports.append(r)
        if r.sent and reporter:
            reporter.report(r)
        what = (r.reason_code or r.outcome) if r.sent else "dry-run"
        print(f"step {r.step}: {r.signer} {r.action} -> {what}", file=out, flush=True)
    lock_seen = True
    if not dry_run and steps and steps[-1].step == 5:
        if simulate_lock:  # sim only: stand in for the council member (step 6)
            chain.emergency_lock(addr(_STEP6.signer), _STEP6.params["principal_id"])
        elif wait_lock:
            print(
                f"waiting for the council to lock '{SCENARIO4_DISTRICT}'...", file=out, flush=True
            )
            lock_seen = wait_for_lock(chain, SCENARIO4_DISTRICT, lock_timeout, sleep=sleep)
            print("lock seen." if lock_seen else "lock not seen before timeout.", file=out)
    print(file=out)
    render_table(reports, out)
    if any(r.sent for r in reports):
        print(f"\nattacker total moved: {fmt_display(attacker_total(reports))} tUSDC", file=out)
    return reports, lock_seen


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="guardian-attacker", description="Scene 4 attacker (testnet).")
    sub = p.add_subparsers(dest="cmd", required=True)
    s4 = sub.add_parser("scene4", help="run the compromised-keys scenario (spec §4.3)")
    s4.add_argument("--step", default="all", help="all | 1..5 | 7 (default all = 1-5 then lock)")
    s4.add_argument("--dry-run", action="store_true", help="simulate only, send nothing")
    s4.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="seconds between steps (3)")
    s4.add_argument("--env-file", default=".env.attacker", help="file with the 5 test keys")
    s4.add_argument("--chain", choices=["sim", "l1"], default=os.getenv("CHAIN_MODE", "sim"))
    s4.add_argument(
        "--no-prepare",
        action="store_true",
        help="sim only: skip policy v2 + agent step 0 before running",
    )
    s4.add_argument(
        "--api-url",
        default=os.getenv("GUARDIAN_API_URL"),
        help="report attempts to POST {url}/api/attempts",
    )
    s4.add_argument(
        "--run-id", default=os.getenv("SCENARIO_RUN_ID"), help="scenarioRunId to attach"
    )
    s4.add_argument("--record", default=None, help="append attempts to this JSONL (no API)")
    s4.add_argument(
        "--wait-lock",
        action=argparse.BooleanOptionalAction,
        default=None,
        help="after step 5 wait for the council lock (default: on for --step all)",
    )
    s4.add_argument("--lock-timeout", type=float, default=120.0, help="seconds to wait for lock")
    s4.add_argument(
        "--simulate-lock",
        action="store_true",
        help="sim only: council member 'lan' locks the district right after step 5 (step 6)",
    )
    return p


def main(
    argv: Sequence[str] | None = None,
    *,
    chain: ChainPort | None = None,
    out: TextIO | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    out = out or sys.stdout
    args = _parser().parse_args(argv)
    try:
        steps = parse_steps(args.step)
        if args.delay < 0:
            raise UsageError("--delay must be >= 0")
        keys = load_keys(Path(args.env_file))
        if chain is None:
            if args.chain == "l1":
                raise UsageError("--chain l1: the L1 adapter is not available yet (OPS-004)")
            chain = build_sim_chain(prepare=not args.no_prepare)  # sim signs by seed id: no keys
        elif args.chain == "l1" and missing_keys(keys):
            raise UsageError("missing keys in env file: " + ", ".join(missing_keys(keys)))
    except UsageError as e:
        print(f"error: {e}", file=sys.stderr)
        return EXIT_USAGE
    wait_lock = args.wait_lock if args.wait_lock is not None else args.step == "all"
    reporter = None
    if not args.dry_run and (args.api_url or args.record):
        reporter = Reporter(args.api_url, Path(args.record) if args.record else None, args.run_id)
    reports, lock_seen = run_scene4(
        chain,
        steps,
        dry_run=args.dry_run,
        delay=args.delay,
        reporter=reporter,
        wait_lock=wait_lock,
        lock_timeout=args.lock_timeout,
        simulate_lock=args.simulate_lock,
        out=out,
        sleep=sleep,
    )
    if reporter and reporter.failures:
        return EXIT_REPORT
    if not all(r.matches_expected for r in reports) or not lock_seen:
        return EXIT_MISMATCH
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
