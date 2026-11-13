"""Scheduler entrypoint (`uv run guardian-agent`): one round every interval, same logic as run-once."""

from __future__ import annotations

import argparse
import asyncio
import fcntl
import logging
import os
import signal
import sys
import tempfile
import threading
from pathlib import Path

from guardian.agent_rebalance.config import DEFAULT_CONFIG
from guardian.agent_rebalance.runner import run_once
from guardian.core.config import get_settings
from guardian.services.demo_reset import reset as demo_reset
from guardian.services.runtime import Runtime

log = logging.getLogger("guardian.agent")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="guardian-agent")
    ap.add_argument("--interval-seconds", type=float, default=DEFAULT_CONFIG.interval_minutes * 60)
    ap.add_argument("--cycles", type=int, default=0, help="stop after N rounds (0 = run forever)")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

    lock_path = os.environ.get("GUARDIAN_AGENT_LOCK") or str(
        Path(tempfile.gettempdir()) / "guardian-agent.lock"
    )
    lock = open(lock_path, "w")  # noqa: SIM115 - held for the whole process life
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print(f"guardian-agent already running (lock {lock_path})", file=sys.stderr)
        return 1

    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())

    # On CHAIN_MODE=sim this process has its own in-memory chain (not shared with the API process); on l1 both hit the same chain.
    rt = Runtime(get_settings())
    asyncio.run(
        demo_reset(rt, startup=True)
    )  # seed like the API, so the first sim round swaps 5.000
    done = 0
    while not stop.is_set():
        try:
            out = run_once(rt)
            amount = (out["decision"] or {}).get("amountIn", {}).get("display", "-")
            log.info(
                "cycle outcome=%s amount=%s reason=%s", out["outcome"], amount, out["reasonCode"]
            )
        except Exception:
            log.exception("cycle failed")
        done += 1
        if args.cycles and done >= args.cycles:
            break
        stop.wait(args.interval_seconds)
    return 0


if __name__ == "__main__":
    sys.exit(main())
