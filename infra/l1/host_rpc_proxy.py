#!/usr/bin/env python3
"""Host RPC proxy for the Guardian L1 validator (L1-003): lets docker containers reach a validator that only
answers to `Host: localhost`.

The validator (Avalanche CLI, avalanchego) listens on 127.0.0.1:9650 with httpAllowedHosts ["localhost"], and its
admin API is on, so it must NOT be bound to 0.0.0.0. A container calls this proxy instead:

    containers --> http://host.docker.internal:9660/ext/bc/<id>/rpc  (and ws://.../ws)
    proxy (127.0.0.1:9660) --> 127.0.0.1:9650, Host header rewritten to "localhost"

Docker Desktop for Mac routes host.docker.internal to the Mac's loopback, so the proxy can stay on 127.0.0.1.
(Linux: host.docker.internal is the docker bridge gateway, not loopback; pass --host <that address>.)

Only the chain's own RPC and WebSocket paths are forwarded (default `^/ext/bc/<id>/(rpc|ws)$`); every other path,
the admin API included, gets 403. HTTP and WebSocket both work: the proxy rewrites the head of every request (Host) on a
keep-alive connection, copies the body by Content-Length, and pipes a WebSocket upgrade as raw bytes.

    python3 infra/l1/host_rpc_proxy.py [--listen-port 9660] [--upstream 127.0.0.1:9650] [--host 127.0.0.1]
                                       [--allow REGEX] [--rewrite-host localhost]

Standard library only. Never point --upstream at a public host.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys

DEFAULT_ALLOW = r"^/ext/bc/[A-Za-z0-9]+/(rpc|ws)$"
MAX_HEAD = 64 * 1024


class Proxy:
    def __init__(self, upstream: tuple[str, int], allow: str, rewrite_host: str) -> None:
        self.upstream = upstream
        self.allow = re.compile(allow)
        self.rewrite_host = rewrite_host

    def rewrite(self, head: bytes) -> tuple[bytes | None, str, int, bool]:
        """(new head without the final blank line | None if the path is not allowed, path, body length, raw).

        `raw` = after this head just pipe bytes: a WebSocket upgrade, or a body we cannot frame (chunked)."""
        lines = head.decode("latin-1").split("\r\n")
        try:
            _method, target, _version = lines[0].split(" ", 2)
        except ValueError:
            return None, "", 0, False
        path = target.split("?", 1)[0]
        if not self.allow.match(path):
            return None, path, 0, False
        hdrs = {ln.split(":", 1)[0].strip().lower(): ln.split(":", 1)[1].strip() for ln in lines[1:] if ":" in ln}
        upgrade = "upgrade" in hdrs
        chunked = "chunked" in hdrs.get("transfer-encoding", "").lower()
        try:
            length = int(hdrs.get("content-length", "0"))
        except ValueError:
            return None, path, 0, False
        out = [lines[0], f"Host: {self.rewrite_host}"]
        if chunked and not upgrade:
            out.append("Connection: close")  # one request per connection, then raw
        for ln in lines[1:]:
            name = ln.split(":", 1)[0].strip().lower()
            if name == "host" or (name == "connection" and chunked and not upgrade):
                continue
            out.append(ln)
        return "\r\n".join(out).encode("latin-1"), path, length, upgrade or chunked

    async def forward_requests(self, reader: asyncio.StreamReader, up: asyncio.StreamWriter, client: asyncio.StreamWriter) -> None:
        """Client -> upstream: rewrite the head of every request (keep-alive safe), copy the body, then pipe raw."""
        try:
            while True:
                try:
                    raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=None)
                except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError):
                    return
                head, path, length, raw_after = self.rewrite(raw[:-4])
                if head is None:
                    body = b"forbidden path\n"
                    client.write(
                        b"HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\n"
                        + f"Content-Length: {len(body)}\r\n\r\n".encode()
                        + body
                    )
                    await client.drain()
                    print(f"403 {path}", file=sys.stderr, flush=True)
                    return
                up.write(head + b"\r\n\r\n")
                if raw_after:
                    await up.drain()
                    while chunk := await reader.read(65536):
                        up.write(chunk)
                        await up.drain()
                    return
                remaining = length
                while remaining:
                    chunk = await reader.read(min(remaining, 65536))
                    if not chunk:
                        return
                    up.write(chunk)
                    remaining -= len(chunk)
                await up.drain()
        except (ConnectionError, OSError):
            return
        finally:
            try:
                up.close()
            except OSError:
                pass

    async def handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        up_writer: asyncio.StreamWriter | None = None
        try:
            try:
                up_reader, up_writer = await asyncio.open_connection(*self.upstream)
            except OSError as e:
                writer.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                await writer.drain()
                print(f"502: upstream {self.upstream[0]}:{self.upstream[1]} {e}", file=sys.stderr, flush=True)
                return

            async def responses() -> None:  # upstream -> client, bytes as they come (one upstream conn per client conn)
                try:
                    while chunk := await up_reader.read(65536):
                        writer.write(chunk)
                        await writer.drain()
                except (ConnectionError, OSError):
                    pass
                finally:
                    try:
                        writer.close()
                    except OSError:
                        pass

            await asyncio.gather(self.forward_requests(reader, up_writer, writer), responses())
        finally:
            for w in (writer, up_writer):
                if w is not None:
                    try:
                        w.close()
                    except OSError:
                        pass


async def serve(host: str, port: int, proxy: Proxy) -> None:
    server = await asyncio.start_server(proxy.handle, host, port, limit=MAX_HEAD, backlog=1024)
    print(
        f"host-rpc-proxy {host}:{port} -> {proxy.upstream[0]}:{proxy.upstream[1]} "
        f"(Host: {proxy.rewrite_host}, allow {proxy.allow.pattern})",
        flush=True,
    )
    async with server:
        await server.serve_forever()


def main() -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "").split("\n\n")[0])
    ap.add_argument("--host", default="127.0.0.1", help="listen address (default loopback; never 0.0.0.0)")
    ap.add_argument("--listen-port", type=int, default=9660)
    ap.add_argument("--upstream", default="127.0.0.1:9650", help="host:port of the validator HTTP API")
    ap.add_argument("--allow", default=DEFAULT_ALLOW, help="regex a request path must match")
    ap.add_argument("--rewrite-host", default="localhost")
    a = ap.parse_args()
    uh, _, up = a.upstream.rpartition(":")
    try:
        asyncio.run(serve(a.host, a.listen_port, Proxy((uh or "127.0.0.1", int(up)), a.allow, a.rewrite_host)))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
