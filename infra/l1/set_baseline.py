#!/usr/bin/env python3
"""Record `policyBaseline` in a deployments file: the vault's `policyVersion()` right now.

Every executed Council proposal bumps the vault's version, so a freshly seeded and handed-over set reads
a number above 1 (4 on the bootstrap). The baseline is that number: the API shows `policyLabel =
policyVersion - policyBaseline + 1`, so the start of scene 1 is always "policy v1" and the merge is "v2".

Usage: set_baseline.py <deployments.json> <rpc-url>     (needs `cast`; writes the file atomically)
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> int:
    path, rpc = Path(sys.argv[1]), sys.argv[2]
    data = json.loads(path.read_text())
    cast = shutil.which("cast") or str(Path.home() / ".foundry" / "bin" / "cast")
    out = subprocess.run(
        [cast, "call", "--rpc-url", rpc, data["contracts"]["vault"], "policyVersion()(uint256)"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.split()[0]
    data["policyBaseline"] = int(out)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    print(f"policyBaseline = {data['policyBaseline']} -> {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
