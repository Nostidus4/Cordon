#!/usr/bin/env bash
# Deploy the Guardian L1 to Fuji (testnet) with the Avalanche CLI. PREPARED BUT NOT YET RUN:
# it needs a funded Fuji key and a host for the validator node (see contracts/genesis/README.md).
#
# Required env:
#   FUJI_KEY        name of an Avalanche CLI stored key funded with Fuji AVAX (`avalanche key create/import`)
#   ROSTER          path to the Fuji roster JSON (addresses only), e.g. contracts/genesis/roster.fuji.json
#   I_UNDERSTAND    must be "fuji" to proceed (this spends testnet AVAX and creates a real Fuji L1)
# Optional env: CHAIN_NAME (default guardianl1), VM_VERSION (default v0.8.0)
#
# Fuji L1s are validator-managed (ACP-77); this script uses the Proof-of-Authority validator manager
# owned by the deployer address. Re-check `avalanche blockchain deploy --help` for the installed CLI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEN="$ROOT/contracts/genesis"
export PATH="$HOME/bin:$PATH"

AVALANCHE="${AVALANCHE:-avalanche}"
CHAIN_NAME="${CHAIN_NAME:-guardianl1}"
VM_VERSION="${VM_VERSION:-v0.8.0}"
FUJI_KEY="${FUJI_KEY:?set FUJI_KEY (CLI stored key name, funded on Fuji)}"
ROSTER="${ROSTER:?set ROSTER (e.g. contracts/genesis/roster.fuji.json)}"
[[ "${I_UNDERSTAND:-}" == "fuji" ]] || { echo "Refusing: set I_UNDERSTAND=fuji to deploy to Fuji" >&2; exit 1; }

OUT="$(mktemp -d)/genesis.fuji.json"
python3 "$GEN/build_genesis.py" "$ROSTER" >"$OUT"
OWNER="$(python3 -c "import json;print(json.load(open('$ROSTER'))['deployer'])")"
SYMBOL="$(python3 -c "import json;print(json.load(open('$ROSTER'))['tokenSymbol'])")"

"$AVALANCHE" --version
"$AVALANCHE" blockchain create "$CHAIN_NAME" --evm --genesis "$OUT" --evm-token "$SYMBOL" \
  --vm-version "$VM_VERSION" --proof-of-authority --validator-manager-owner "$OWNER" --icm=false --force
"$AVALANCHE" blockchain deploy "$CHAIN_NAME" --fuji --key "$FUJI_KEY" --use-local-machine

echo "Next: record chainId, RPC and ws URLs in Backend/deployments/fuji-l1.json and Backend/.env (see contracts/genesis/README.md)."
