#!/usr/bin/env python3
"""Read-only JSON-RPC proxy for the Guardian L1, safe to expose publicly so judges can verify on-chain claims.

    browser / curl --> http://<host>:9670  (POST JSON-RPC)  -->  L1 RPC (L1_RPC_URL, Host header rewritten to "localhost")

Only an allowlist of read methods is forwarded (eth_chainId, eth_blockNumber, eth_getCode, eth_call, ...). Everything
else (eth_sendRawTransaction, eth_sendTransaction, personal_*, debug_*, admin_*, ...) gets JSON-RPC error -32601 and
never reaches the node. Batches are filtered item by item. eth_getLogs ranges are capped, bodies are size-limited,
requests are rate-limited per client IP, and CORS is open (any origin) so the in-app page /bang-chung can call it.

    L1_RPC_URL=http://127.0.0.1:9650/ext/bc/<id>/rpc python3 infra/l1/readonly_rpc_proxy.py [--host 127.0.0.1] [--port 9670]

Binds to loopback by default; `--host 0.0.0.0` is an explicit opt-in. Standard library only. Read-only: it never signs
or sends a transaction.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ALLOWED_METHODS = frozenset(
    {
        "eth_chainId",
        "net_version",
        "eth_blockNumber",
        "eth_getBlockByNumber",
        "eth_getBlockByHash",
        "eth_getTransactionByHash",
        "eth_getTransactionReceipt",
        "eth_getCode",
        "eth_call",
        "eth_getBalance",
        "eth_getLogs",
        "eth_getStorageAt",
        "web3_clientVersion",
    }
)
DEFAULT_UPSTREAM = "http://127.0.0.1:9650/ext/bc/4hnXBqtkcq2uj8e3rcfGKh3NDBn3CgrWPe4tk71WQFfP4rTTb/rpc"
MAX_BODY = 64 * 1024
MAX_BATCH = 20
MAX_LOG_RANGE = 2000
UPSTREAM_TIMEOUT = 15.0
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
}
LATEST_TAGS = (None, "latest", "pending", "safe", "finalized")


def err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


class RateLimiter:
    """Sliding window: at most `limit` JSON-RPC calls per client per `window` seconds."""

    def __init__(self, limit: int, window: float = 60.0, clock=time.monotonic) -> None:
        self.limit, self.window, self.clock = limit, window, clock
        self.hits: dict[str, deque[float]] = {}
        self.lock = threading.Lock()

    def allow(self, ip: str, cost: int = 1) -> bool:
        now = self.clock()
        with self.lock:
            q = self.hits.setdefault(ip, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) + cost > self.limit:
                return False
            q.extend([now] * cost)
            if len(self.hits) > 10000:  # bound memory: drop idle clients
                for k in [k for k, v in self.hits.items() if not v]:
                    del self.hits[k]
            return True


class Upstream:
    def __init__(self, url: str, rewrite_host: str) -> None:
        self.url, self.rewrite_host = url, rewrite_host

    def call(self, payload: object) -> object:
        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Host": self.rewrite_host},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as r:
            return json.loads(r.read())


def _block_number(tag, head: int | None) -> int | None:
    if isinstance(tag, str) and tag.startswith("0x"):
        try:
            return int(tag, 16)
        except ValueError:
            return None
    if tag in LATEST_TAGS:
        return head
    if tag == "earliest":
        return 0
    return None


class Filter:
    """Decides per request; `upstream` is only used to resolve "latest" for eth_getLogs range checks."""

    def __init__(self, upstream: Upstream, max_log_range: int = MAX_LOG_RANGE) -> None:
        self.upstream, self.max_log_range = upstream, max_log_range

    def check(self, item: object) -> dict | None:
        """None = forward as is, else the JSON-RPC error response to return instead."""
        if not isinstance(item, dict) or not isinstance(item.get("method"), str):
            rid = item.get("id") if isinstance(item, dict) else None
            return err(rid, -32600, "Invalid Request")
        rid, method = item.get("id"), item["method"]
        if method not in ALLOWED_METHODS:
            return err(rid, -32601, f"the method {method} does not exist/is not available (read-only proxy)")
        if method == "eth_getLogs":
            return self._check_logs(rid, item.get("params"))
        return None

    def _check_logs(self, rid, params) -> dict | None:
        flt = params[0] if isinstance(params, list) and params and isinstance(params[0], dict) else None
        if flt is None:
            return err(rid, -32602, "invalid params")
        if flt.get("blockHash"):
            return None
        frm, to = flt.get("fromBlock"), flt.get("toBlock")
        head = None
        if frm in LATEST_TAGS or to in LATEST_TAGS:
            try:
                resp = self.upstream.call({"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []})
                head = int(resp["result"], 16)  # type: ignore[index]
            except Exception:
                return err(rid, -32603, "upstream unavailable")
        a, b = _block_number(frm, head), _block_number(to, head)
        if a is None or b is None:
            return err(rid, -32602, "invalid block number")
        if b - a > self.max_log_range:
            return err(rid, -32602, f"eth_getLogs block range too large (max {self.max_log_range} blocks)")
        return None


def handle_body(body: bytes, flt: Filter, upstream: Upstream, limiter: RateLimiter, ip: str) -> tuple[int, object]:
    """(http status, JSON-able response)."""
    try:
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return 200, err(None, -32700, "Parse error")
    is_batch = isinstance(payload, list)
    items = payload if is_batch else [payload]
    if not items:
        return 200, err(None, -32600, "Invalid Request")
    if len(items) > MAX_BATCH:
        return 200, err(None, -32600, f"batch too large (max {MAX_BATCH})")
    if not limiter.allow(ip, len(items)):
        return 429, err(None, -32005, "rate limit exceeded")
    results: list[object] = [None] * len(items)
    forward: list[tuple[int, dict]] = []
    for i, it in enumerate(items):
        e = flt.check(it)
        if e is not None:
            results[i] = e
        else:
            forward.append((i, it))
    if forward:
        try:
            up = upstream.call([it for _, it in forward] if is_batch else forward[0][1])
            ups = up if isinstance(up, list) else [up]
            by_id = {r.get("id"): r for r in ups if isinstance(r, dict)}
            for n, (i, it) in enumerate(forward):
                fallback = ups[n] if n < len(ups) and isinstance(ups[n], dict) else err(it.get("id"), -32603, "no upstream response")
                results[i] = by_id.get(it.get("id")) or fallback
        except (urllib.error.URLError, OSError, ValueError, TimeoutError) as e:
            print(f"upstream error: {e}", file=sys.stderr, flush=True)
            for i, it in forward:
                results[i] = err(it.get("id"), -32603, "upstream unavailable")
    return 200, results if is_batch else results[0]


def make_handler(flt: Filter, upstream: Upstream, limiter: RateLimiter, trust_forwarded: bool):
    class H(BaseHTTPRequestHandler):
        server_version = "guardian-readonly-rpc"

        def log_message(self, fmt, *args):  # quiet, one line to stderr
            print(f"{self.client_address[0]} {fmt % args}", file=sys.stderr, flush=True)

        def _send(self, status: int, obj: object | None = None, text: str | None = None) -> None:
            data = json.dumps(obj).encode() if obj is not None else (text or "").encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json" if obj is not None else "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            for k, v in CORS.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def _ip(self) -> str:
            if trust_forwarded:
                fwd = self.headers.get("X-Forwarded-For", "")
                if fwd:
                    return fwd.split(",")[0].strip()
            return self.client_address[0]

        def do_OPTIONS(self):
            self._send(204, text="")

        def do_GET(self):
            self._send(200, text="Guardian L1 read-only JSON-RPC proxy. POST JSON-RPC here. Allowed: " + ", ".join(sorted(ALLOWED_METHODS)) + "\n")

        def do_POST(self):
            try:
                n = int(self.headers.get("Content-Length", ""))
            except ValueError:
                self.close_connection = True
                return self._send(411, text="Content-Length required\n")
            if n < 0 or n > MAX_BODY:
                self.close_connection = True  # do not read the oversized body
                return self._send(413, err(None, -32600, f"request too large (max {MAX_BODY} bytes)"))
            status, resp = handle_body(self.rfile.read(n), flt, upstream, limiter, self._ip())
            self._send(status, resp)

        def _no(self):
            self._send(405, text="method not allowed\n")

        do_PUT = do_DELETE = do_PATCH = _no

    return H


def build_server(
    host: str,
    port: int,
    upstream_url: str,
    rewrite_host: str = "localhost",
    rate: int = 120,
    trust_forwarded: bool = False,
    max_log_range: int = MAX_LOG_RANGE,
) -> ThreadingHTTPServer:
    up = Upstream(upstream_url, rewrite_host)
    return ThreadingHTTPServer((host, port), make_handler(Filter(up, max_log_range), up, RateLimiter(rate), trust_forwarded))


def main() -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    ap.add_argument("--host", default=os.environ.get("RO_RPC_HOST", "127.0.0.1"), help="listen address (default loopback; 0.0.0.0 opt-in)")
    ap.add_argument("--port", type=int, default=int(os.environ.get("RO_RPC_PORT", "9670")))
    ap.add_argument("--upstream", default=os.environ.get("L1_RPC_URL", DEFAULT_UPSTREAM), help="L1 RPC URL (env L1_RPC_URL)")
    ap.add_argument("--rewrite-host", default="localhost", help="Host header sent upstream (validator allows only localhost)")
    ap.add_argument("--rate", type=int, default=int(os.environ.get("RO_RPC_RATE", "120")), help="JSON-RPC calls per minute per IP")
    ap.add_argument("--trust-forwarded", action="store_true", help="use X-Forwarded-For for the rate limit (only behind your own reverse proxy)")
    a = ap.parse_args()
    srv = build_server(a.host, a.port, a.upstream, a.rewrite_host, a.rate, a.trust_forwarded)
    print(f"readonly-rpc-proxy {a.host}:{a.port} -> {a.upstream} ({a.rate}/min/IP, {len(ALLOWED_METHODS)} read methods)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
