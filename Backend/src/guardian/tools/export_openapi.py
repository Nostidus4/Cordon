"""Write Backend/openapi.json from the FastAPI app (`make openapi`; CI fails if it is stale)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from guardian.main import create_app

DEFAULT_PATH = Path(__file__).resolve().parents[3] / "openapi.json"


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    spec = create_app().openapi()
    path.write_text(json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
