"""infra/l1/host_rpc_proxy.py (L1-003): Host rewrite on every keep-alive request, path allow-list, WebSocket-style
upgrade piping, against a local fake upstream that, like avalanchego, refuses any Host other than localhost."""

from __future__ import annotations

import asyncio
import importlib.util
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest_asyncio

REPO = Path(__file__).resolve().parents[2]


def load() -> Any:
    spec = importlib.util.spec_from_file_location(
        "host_rpc_proxy", REPO / "infra" / "l1" / "host_rpc_proxy.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def fake_upstream(seen: list[str]) -> asyncio.Server:
    async def handle(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        while True:  # keep-alive: several requests per connection
            try:
                head = (await r.readuntil(b"\r\n\r\n")).decode()
            except asyncio.IncompleteReadError:
                break
            seen.append(head)
            lines = head.split("\r\n")
            hdr = {
                ln.split(":", 1)[0].lower(): ln.split(":", 1)[1].strip()
                for ln in lines[1:]
                if ":" in ln
            }
            if hdr.get("host") != "localhost":
                w.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
            elif "upgrade" in hdr:  # WebSocket-like: 101, then echo with a prefix
                w.write(
                    b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                    b"Connection: Upgrade\r\n\r\n"
                )
                await w.drain()
                while data := await r.read(1024):
                    w.write(b"echo:" + data)
                    await w.drain()
                break
            else:
                body = await r.readexactly(int(hdr.get("content-length", "0")))
                out = b'{"jsonrpc":"2.0","result":"' + body + b'","id":1}'
                w.write(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                    + f"Content-Length: {len(out)}\r\n\r\n".encode()
                    + out
                )
            await w.drain()
        w.close()

    return await asyncio.start_server(handle, "127.0.0.1", 0)


async def http(port: int, request: bytes) -> bytes:
    r, w = await asyncio.open_connection("127.0.0.1", port)
    w.write(request)
    await w.drain()
    data = await asyncio.wait_for(r.readuntil(b"\r\n\r\n"), 5)
    if data.startswith(b"HTTP/1.1 200"):
        n = int(data.lower().split(b"content-length: ")[1].split(b"\r\n")[0])
        data += await asyncio.wait_for(r.readexactly(n), 5)
    else:
        data += await asyncio.wait_for(r.read(), 5)
    w.close()
    return data


@pytest_asyncio.fixture
async def stack() -> AsyncIterator[tuple[int, list[str]]]:
    mod = load()
    seen: list[str] = []
    up = await fake_upstream(seen)
    up_port = up.sockets[0].getsockname()[1]
    proxy = mod.Proxy(("127.0.0.1", up_port), mod.DEFAULT_ALLOW, "localhost")
    srv = await asyncio.start_server(proxy.handle, "127.0.0.1", 0)
    yield srv.sockets[0].getsockname()[1], seen
    for s in (srv, up):
        s.close()


async def test_http_post_gets_host_rewritten(stack: tuple[int, list[str]]) -> None:
    port, seen = stack
    resp = await http(
        port,
        b"POST /ext/bc/abc123/rpc HTTP/1.1\r\nHost: host.docker.internal:9660\r\n"
        b"Connection: keep-alive\r\nContent-Type: application/json\r\nContent-Length: 4\r\n\r\nping",
    )
    assert resp.startswith(b"HTTP/1.1 200") and b'"result":"ping"' in resp
    assert "Host: localhost" in seen[0] and "host.docker.internal" not in seen[0]


async def test_keep_alive_rewrites_every_request(stack: tuple[int, list[str]]) -> None:
    port, seen = stack
    r, w = await asyncio.open_connection("127.0.0.1", port)
    for body in (b"one", b"two", b"three"):
        w.write(
            b"POST /ext/bc/abc123/rpc HTTP/1.1\r\nHost: host.docker.internal:9660\r\n"
            b"Content-Length: %d\r\n\r\n%s" % (len(body), body)
        )
        await w.drain()
        head = await asyncio.wait_for(r.readuntil(b"\r\n\r\n"), 5)
        assert head.startswith(b"HTTP/1.1 200")
        n = int(head.lower().split(b"content-length: ")[1].split(b"\r\n")[0])
        assert body in await asyncio.wait_for(r.readexactly(n), 5)
    w.close()
    assert len(seen) == 3 and all("Host: localhost" in h for h in seen)


async def test_websocket_upgrade_is_piped(stack: tuple[int, list[str]]) -> None:
    port, seen = stack
    r, w = await asyncio.open_connection("127.0.0.1", port)
    w.write(
        b"GET /ext/bc/abc123/ws HTTP/1.1\r\nHost: host.docker.internal:9660\r\n"
        b"Upgrade: websocket\r\nConnection: Upgrade\r\n"
        b"Sec-WebSocket-Key: x\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    await w.drain()
    head = await asyncio.wait_for(r.readuntil(b"\r\n\r\n"), 5)
    assert head.startswith(b"HTTP/1.1 101")
    w.write(b"hello")
    await w.drain()
    assert await asyncio.wait_for(r.readexactly(10), 5) == b"echo:hello"
    w.close()
    assert "Host: localhost" in seen[0] and "Upgrade: websocket" in seen[0]


async def test_other_paths_are_refused_and_never_reach_the_upstream(
    stack: tuple[int, list[str]],
) -> None:
    port, seen = stack
    for path in ("/ext/admin", "/ext/bc/abc123/rpc/../../admin", "/ext/info", "/"):
        resp = await http(
            port, f"POST {path} HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n".encode()
        )
        assert resp.startswith(b"HTTP/1.1 403"), path
    assert seen == []


async def test_upstream_down_is_a_502() -> None:
    mod = load()
    proxy = mod.Proxy(("127.0.0.1", 1), mod.DEFAULT_ALLOW, "localhost")
    srv = await asyncio.start_server(proxy.handle, "127.0.0.1", 0)
    port = srv.sockets[0].getsockname()[1]
    resp = await http(port, b"POST /ext/bc/a/rpc HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n")
    srv.close()
    assert resp.startswith(b"HTTP/1.1 502")
