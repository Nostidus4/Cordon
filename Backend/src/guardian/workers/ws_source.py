"""Websocket wake-up for the indexer (IDX-002): `eth_subscribe("logs")` with polling as the safety net.

The watcher never carries data. A matching log (or a (re)connect) only sets the indexer's wake event, and
the indexer then reads from its own stored cursor over HTTP exactly as it does when polling. So nothing
is lost on a dropped connection (the next cycle starts at the cursor) and nothing is duplicated (the sink
dedupes on (tx_hash, log_index)). While the socket is down `connected` is False and the indexer polls at
its normal interval; while it is up the poll interval stretches to a slow safety net.
"""

from __future__ import annotations

import json
import logging
import threading
from typing import Any

from websockets.sync.client import connect

log = logging.getLogger(__name__)


class LogWatcher:
    def __init__(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        *,
        retry_initial: float = 0.5,
        retry_max: float = 10.0,
        open_timeout: float = 5.0,
    ) -> None:
        self.url = url
        self.params = params or {}
        self.wake: threading.Event = threading.Event()  # replaced by the indexer's own event
        self._retry_initial = retry_initial
        self._retry_max = retry_max
        self._open_timeout = open_timeout
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._connected = False
        self.connects = 0

    @property
    def connected(self) -> bool:
        return self._connected

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="log-watcher", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout)

    def _subscribe_message(self) -> str:
        return json.dumps(
            {"jsonrpc": "2.0", "id": 1, "method": "eth_subscribe", "params": ["logs", self.params]}
        )

    def _run(self) -> None:
        delay = self._retry_initial
        while not self._stop.is_set():
            try:
                with connect(self.url, open_timeout=self._open_timeout, max_size=None) as ws:
                    ws.send(self._subscribe_message())
                    reply = json.loads(ws.recv(timeout=self._open_timeout))
                    if "error" in reply:
                        raise RuntimeError(f"eth_subscribe refused: {reply['error']}")
                    self._connected = True
                    delay = self._retry_initial
                    self.connects += 1
                    self.wake.set()  # catch up on anything that happened while we were not listening
                    while not self._stop.is_set():
                        try:
                            raw = ws.recv(timeout=1.0)
                        except TimeoutError:
                            continue
                        if json.loads(raw).get("method") == "eth_subscription":
                            self.wake.set()
            except Exception as exc:  # noqa: BLE001 (any socket/protocol error: fall back to polling)
                log.warning("log watcher %s lost: %s: %s", self.url, type(exc).__name__, exc)
            finally:
                if self._connected:
                    self._connected = False
                    self.wake.set()  # let the indexer notice and switch to its fast poll
            self._stop.wait(delay)
            delay = min(delay * 2, self._retry_max)
