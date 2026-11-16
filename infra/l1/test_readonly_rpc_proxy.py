"""Tests for readonly_rpc_proxy.py with a fake upstream node. Run: python3 -m unittest infra/l1/test_readonly_rpc_proxy.py -v"""

from __future__ import annotations

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import readonly_rpc_proxy as p  # noqa: E402

SEEN: list[dict] = []  # every payload the fake node received
HOSTS: list[str] = []


class FakeNode(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        HOSTS.append(self.headers.get("Host", ""))
        items = body if isinstance(body, list) else [body]
        SEEN.extend(items)
        out = [{"jsonrpc": "2.0", "id": i["id"], "result": {"eth_chainId": "0xce62d", "eth_blockNumber": "0x1000"}.get(i["method"], "0x0")} for i in items]
        data = json.dumps(out if isinstance(body, list) else out[0]).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def post(url: str, payload, raw: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(url, data=raw if raw is not None else json.dumps(payload).encode(), headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read()), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null"), dict(e.headers)


class ProxyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = HTTPServer(("127.0.0.1", 0), FakeNode)
        threading.Thread(target=cls.node.serve_forever, daemon=True).start()
        cls.proxy = p.build_server("127.0.0.1", 0, f"http://127.0.0.1:{cls.node.server_port}/rpc", rate=1000)
        threading.Thread(target=cls.proxy.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.proxy.server_port}/"

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.node.shutdown()

    def setUp(self):
        SEEN.clear()
        HOSTS.clear()

    def test_allowed_method_forwarded_with_cors_and_host_rewrite(self):
        st, body, hdr = post(self.url, {"jsonrpc": "2.0", "id": 7, "method": "eth_chainId", "params": []})
        self.assertEqual((st, body["result"], body["id"]), (200, "0xce62d", 7))
        self.assertEqual(hdr["Access-Control-Allow-Origin"], "*")
        self.assertEqual(HOSTS, ["localhost"])

    def test_write_and_admin_methods_denied_and_never_forwarded(self):
        for m in ("eth_sendRawTransaction", "eth_sendTransaction", "personal_unlockAccount", "debug_traceTransaction", "admin_peers", "eth_accounts"):
            st, body, _ = post(self.url, {"jsonrpc": "2.0", "id": 1, "method": m, "params": []})
            self.assertEqual(body["error"]["code"], -32601, m)
        self.assertEqual(SEEN, [])

    def test_batch_is_filtered_per_item(self):
        batch = [
            {"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []},
            {"jsonrpc": "2.0", "id": 2, "method": "eth_sendRawTransaction", "params": ["0x00"]},
            {"jsonrpc": "2.0", "id": 3, "method": "eth_chainId", "params": []},
        ]
        st, body, _ = post(self.url, batch)
        self.assertEqual([r["id"] for r in body], [1, 2, 3])
        self.assertEqual(body[0]["result"], "0x1000")
        self.assertEqual(body[1]["error"]["code"], -32601)
        self.assertEqual(body[2]["result"], "0xce62d")
        self.assertEqual([i["method"] for i in SEEN], ["eth_blockNumber", "eth_chainId"])

    def test_oversized_body_rejected(self):
        st, body, _ = post(self.url, None, raw=b" " * (p.MAX_BODY + 1))
        self.assertEqual(st, 413)
        self.assertEqual(SEEN, [])

    def test_oversized_batch_rejected(self):
        batch = [{"jsonrpc": "2.0", "id": i, "method": "eth_chainId", "params": []} for i in range(p.MAX_BATCH + 1)]
        _, body, _ = post(self.url, batch)
        self.assertEqual(body["error"]["code"], -32600)
        self.assertEqual(SEEN, [])

    def test_invalid_json(self):
        _, body, _ = post(self.url, None, raw=b"{nope")
        self.assertEqual(body["error"]["code"], -32700)

    def test_get_logs_range_cap(self):
        def logs(frm, to):
            return post(self.url, {"jsonrpc": "2.0", "id": 1, "method": "eth_getLogs", "params": [{"fromBlock": frm, "toBlock": to}]})[1]

        self.assertNotIn("error", logs("0x0", hex(p.MAX_LOG_RANGE)))
        self.assertEqual(logs("0x0", hex(p.MAX_LOG_RANGE + 1))["error"]["code"], -32602)
        self.assertEqual(logs("0x0", "latest")["error"]["code"], -32602)  # head 0x1000 = 4096 > 2000
        self.assertNotIn("error", logs("0xf00", "latest"))  # 4096-3840 = 256
        self.assertEqual(logs("zzz", "0x1")["error"]["code"], -32602)

    def test_options_preflight(self):
        req = urllib.request.Request(self.url, method="OPTIONS")
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.status, 204)
            self.assertIn("POST", r.headers["Access-Control-Allow-Methods"])

    def test_upstream_down_returns_error_not_crash(self):
        srv = p.build_server("127.0.0.1", 0, "http://127.0.0.1:1/rpc")
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            _, body, _ = post(f"http://127.0.0.1:{srv.server_port}/", {"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []})
            self.assertEqual(body["error"]["code"], -32603)
        finally:
            srv.shutdown()


class RateLimitTest(unittest.TestCase):
    def test_window(self):
        now = [0.0]
        rl = p.RateLimiter(3, 60, clock=lambda: now[0])
        self.assertTrue(rl.allow("a", 2))
        self.assertTrue(rl.allow("a"))
        self.assertFalse(rl.allow("a"))
        self.assertTrue(rl.allow("b"))  # per IP
        now[0] = 61
        self.assertTrue(rl.allow("a"))

    def test_http_429(self):
        node = HTTPServer(("127.0.0.1", 0), FakeNode)
        threading.Thread(target=node.serve_forever, daemon=True).start()
        srv = p.build_server("127.0.0.1", 0, f"http://127.0.0.1:{node.server_port}/", rate=2)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            url = f"http://127.0.0.1:{srv.server_port}/"
            req = {"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []}
            self.assertEqual(post(url, req)[0], 200)
            self.assertEqual(post(url, req)[0], 200)
            self.assertEqual(post(url, req)[0], 429)
        finally:
            srv.shutdown()
            node.shutdown()


if __name__ == "__main__":
    unittest.main()
