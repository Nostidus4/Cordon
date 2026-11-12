#!/usr/bin/env bash
# Export the ABI of every interface in contracts/src/interfaces/ to Backend/src/guardian/chain/abis/.
# One <Interface>.json per file, deterministic (sorted keys, 2-space indent, trailing newline).
# Usage: contracts/scripts/export-abis.sh   (or `make abis`). Set FORGE=/path/to/forge if not on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/Backend/src/guardian/chain/abis"
FORGE="${FORGE:-forge}"

cd "$ROOT/contracts"
"$FORGE" build >/dev/null
mkdir -p "$OUT"
for src in src/interfaces/I*.sol; do
  name="$(basename "$src" .sol)"
  "$FORGE" inspect "$src:$name" abi --json | python3 -c \
    'import json,sys; print(json.dumps(json.load(sys.stdin), indent=2, sort_keys=True))' \
    > "$OUT/$name.json"
  echo "exported Backend/src/guardian/chain/abis/$name.json"
done
