"""Worker entrypoint (`uv run guardian-worker`)."""

from __future__ import annotations

import logging
import signal
import threading
from typing import Any

from guardian.chain.base import ChainEvent
from guardian.core.config import get_settings
from guardian.core.logging import event_extra, setup_logging
from guardian.workers.graph_worker import GraphWorker

log = logging.getLogger("guardian.worker")


def main() -> None:
    """Run the graph worker (and, with CHAIN_MODE=l1, the indexer feeding it) until SIGTERM/SIGINT.

    There is no cross-process bus yet, so "publishing" a graph_updated message only logs it; a
    shared bus arrives later. In sim mode there is no event source and the worker idles.
    """
    setup_logging()
    settings = get_settings()
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())

    def publish(event_type: str, data: dict[str, Any]) -> None:
        log.info("sse %s %s", event_type, data)

    indexer = None
    bridge: Any = None
    if settings.chain_mode == "l1":
        from guardian.chain.l1.startup import build_l1_chain
        from guardian.workers.indexer import Indexer, InMemoryEventSink, L1ChainSource

        chain = build_l1_chain(settings)
        sink: Any = InMemoryEventSink()
        if settings.database_url:
            from guardian.db.bridge import DbBridge
            from guardian.repositories.pg import PgEventSink

            bridge = DbBridge(settings.database_url)
            sink = PgEventSink(bridge)
        graph = GraphWorker(chain.snapshot, publish)

        def on_event(ev: ChainEvent) -> None:
            log.info("indexed event", extra=event_extra(ev))
            graph.handle(ev)

        indexer = Indexer(
            L1ChainSource(chain),
            sink,
            publish=on_event,
            poll_interval=settings.l1_poll_interval_seconds,
            reorg_window=settings.indexer_reorg_window,
            confirmations=settings.indexer_confirmations,
        )
        indexer.start()
    log.info("worker started (chain_mode=%s)", settings.chain_mode)
    stop.wait()
    if indexer is not None:
        indexer.stop()
    if bridge is not None:
        bridge.close()
    log.info("worker stopped")


if __name__ == "__main__":
    main()
