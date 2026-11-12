"""API-001: API_CONTRACT.md, SSE types and the OpenAPI stay in step."""

import re
from pathlib import Path

from guardian.main import create_app
from guardian.schemas.stream import SSE_EVENT_TYPES

ROOT = Path(__file__).resolve().parents[2]
DOC = (ROOT / "docs/spec/API_CONTRACT.md").read_text()


def _section(n: int) -> str:
    return re.search(rf"^## {n}\. .*?(?=^## |\Z)", DOC, re.DOTALL | re.MULTILINE).group(0)  # type: ignore[union-attr]


def test_sse_types_match_doc_backend_and_frontend():
    doc = re.findall(r"^\| `(\w+)` \|", _section(5), re.MULTILINE)
    ts = (ROOT / "Frontend/src/types/stream.ts").read_text()
    body = re.search(r"STREAM_TYPES[^=]*=\s*\[(.*?)\]", ts, re.DOTALL).group(1)  # type: ignore[union-attr]
    assert doc and doc == list(SSE_EVENT_TYPES) == re.findall(r'"(\w+)"', body)


def test_every_documented_endpoint_is_in_openapi_or_marked_missing():
    paths = set(create_app().openapi()["paths"])
    checked = 0
    for row in re.findall(r"^\| (?:GET|POST)[^\n]*", _section(4), re.MULTILINE):
        cols = row.split("|")
        if "missing (API-003 (#7))" in row:
            continue
        for p in re.findall(r"`(/[^`]*)`", cols[2]):
            assert "/api" + p.split("?")[0] in paths, p
            checked += 1
    assert checked >= 20
