"""Write Frontend/src/shared/backendTables.json from the Python shared tables (`make shared-tables`).

Vitest compares it with the TS mirrors; test_shared_tables_export.py fails when the committed file is stale.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

from guardian.schemas.stream import SSE_EVENT_TYPES
from guardian.shared.reason_codes import REASON_TABLE
from guardian.shared.scenario4 import SCENARIO4_DAILY_CAP, SCENARIO4_DISTRICT, SCENARIO4_STEPS

DEFAULT_PATH = (
    Path(__file__).resolve().parents[4] / "Frontend" / "src" / "shared" / "backendTables.json"
)


def tables() -> dict[str, Any]:
    return {
        "reasons": {str(c): i._asdict() for c, i in REASON_TABLE.items()},
        "scenario4": {
            "district": SCENARIO4_DISTRICT,
            "dailyCap": SCENARIO4_DAILY_CAP,
            "steps": [asdict(s) for s in SCENARIO4_STEPS],
        },
        "sseEventTypes": sorted(SSE_EVENT_TYPES),
    }


def render() -> str:
    return json.dumps(tables(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    path.write_text(render())


if __name__ == "__main__":
    main()
