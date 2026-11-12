"""Worker entrypoint (`uv run guardian-worker`)."""

from __future__ import annotations

import logging

from guardian.core.config import get_settings


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    settings = get_settings()
    if settings.chain_mode != "l1":
        raise SystemExit(
            "guardian-worker: CHAIN_MODE=sim has nothing to index (sim emits in-process)"
        )
    from guardian.workers.indexer import run_indexer

    run_indexer(settings)  # API-004 (#8) composes graph_worker alongside this


if __name__ == "__main__":
    main()
