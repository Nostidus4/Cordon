"""Local Fuji endpoint for the Avalanche CLI: /ext/bc/P goes to publicnode (still serves platform.getBalance),
everything else to the official api.avax-test.network. Logs each request path and upstream status."""

import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OFFICIAL = "https://api.avax-test.network"
PCHAIN = "https://avalanche-fuji-p-chain-rpc.publicnode.com"


class H(BaseHTTPRequestHandler):
    def _go(self) -> None:
        body = self.rfile.read(int(self.headers.get("content-length") or 0)) if self.command == "POST" else None
        path = self.path
        if path == "/ext/P" or path.startswith("/ext/P/"):  # the CLI also uses the short P-Chain alias
            path = "/ext/bc/P" + path[len("/ext/P") :]
        base = PCHAIN if path.startswith("/ext/bc/P") else OFFICIAL
        req = urllib.request.Request(base + path, data=body, method=self.command)
        req.add_header("content-type", self.headers.get("content-type", "application/json"))
        req.add_header("user-agent", "curl/8.7.1")  # publicnode's CDN rejects Python's default agent with 403
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                code, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, data = e.code, e.read()
        method = ""
        if body and b'"method"' in body:
            method = body.split(b'"method"', 1)[1][:60].decode(errors="replace")
        print(f"{self.command} {self.path} -> {base.split('//')[1]} {code} {method}", file=sys.stderr, flush=True)
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = do_POST = _go

    def log_message(self, *a: object) -> None:
        pass


ThreadingHTTPServer(("127.0.0.1", 9655), H).serve_forever()
