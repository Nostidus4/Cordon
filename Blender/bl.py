#!/usr/bin/env python3
"""Usage: python3 Blender/bl.py <script.py>   (or --info). Sends code to Blender MCP addon on :9876."""
import socket, json, sys
def send(msg, timeout=300):
    s = socket.create_connection(("localhost", 9876), timeout=10)
    s.settimeout(timeout)
    s.sendall(json.dumps(msg).encode())
    buf = b""
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
        try:
            return json.loads(buf.decode())
        except ValueError:
            continue
    return {"status": "error", "message": "connection closed: " + buf.decode(errors="replace")[:500]}
if __name__ == "__main__":
    if sys.argv[1] == "--info":
        r = send({"type": "get_scene_info", "params": {}})
    else:
        r = send({"type": "execute_code", "params": {"code": open(sys.argv[1]).read()}})
    print(json.dumps(r, indent=1, ensure_ascii=False)[:6000])
