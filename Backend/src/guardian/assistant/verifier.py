"""Number verifier (spec §9.4).

1. every `numbers[].value` must equal the value re-read from the tool result at `path`
   (and `source` must be the first path segment);
2. every number written in `answer` must be one of the `numbers[].value`.
Failure -> the caller returns the fallback answer with numbers_verified=false.
"""

from __future__ import annotations

import re
from typing import Any

NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)*")


def resolve(ctx: dict[str, Any], path: str) -> Any:
    """Dotted path; integer segments index lists; `length` on a list gives len()."""
    cur: Any = ctx
    for seg in path.split("."):
        if isinstance(cur, list):
            cur = len(cur) if seg == "length" else cur[int(seg)]
        elif isinstance(cur, dict):
            cur = cur[seg]
        else:
            raise KeyError(path)
    return cur


def norm(v: Any) -> str:
    if isinstance(v, dict) and "display" in v:
        return str(v["display"])
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else str(v).replace(".", ",")
    return str(v)


def verify(answer: str, numbers: list[dict[str, Any]], ctx: dict[str, Any]) -> bool:
    allowed: set[str] = set()
    for n in numbers:
        try:
            if n["source"] != n["path"].split(".")[0]:
                return False
            if norm(resolve(ctx, n["path"])) != n["value"]:
                return False
        except (KeyError, IndexError, ValueError):
            return False
        allowed.add(n["value"])
    return all(tok in allowed for tok in NUMBER_RE.findall(answer))
