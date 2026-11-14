#!/usr/bin/env bash
# Deploy the Guardian L1 to Fuji with avalanchego + Subnet-EVM v1.15.3 (#30).
#
# Why this script exists (2026-11-14):
#  - Fuji activated the Helicon upgrade; avalanchego v1.14.x (what Avalanche CLI 1.9.7 pulls) cannot follow it.
#    Since v1.15, Subnet-EVM ships inside the avalanchego release (protocol 47); the CLI only knows the old
#    standalone Subnet-EVM v0.8.0. We keep the CLI's v0.8.0 genesis/validator-manager setup and run the node with
#    the v1.15.3 binaries.
#  - The public Fuji API dropped `platform.getBalance`, which the CLI still calls. A local proxy
#    (infra/l1/fuji_proxy.py on 127.0.0.1:9655) sends P-Chain calls to publicnode and the rest to the official API.
#
# Spends Fuji AVAX on the P-Chain (deployer key `fuji_deployer`). Requires I_UNDERSTAND=fuji.
# The validator runs on THIS machine: keep it on and online during the demo.
set -euo pipefail
[[ "${I_UNDERSTAND:-}" == "fuji" ]] || { echo "Refusing: set I_UNDERSTAND=fuji" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="${AVALANCHE:-$HOME/bin/avalanche}"
NEW="$HOME/.avalanche-cli/bin/v1153"
AGO="$NEW/ago/build/avalanchego"
SEVM_NEW="$NEW/sevm/build/subnet-evm"
SEVM_CLI="$HOME/.avalanche-cli/bin/subnet-evm/subnet-evm-v0.8.0/subnet-evm"
ENDPOINT="${FUJI_ENDPOINT:-http://127.0.0.1:9655}"
BALANCE="${VALIDATOR_BALANCE:-0.1}"

echo "== versions"
"$AGO" --version
"$SEVM_NEW" --version

echo "== proxy"
curl -sf -m 5 -X POST -H 'content-type:application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"info.getNetworkID","params":{}}' "$ENDPOINT/ext/info" >/dev/null \
  || { echo "proxy not running: python3 $ROOT/infra/l1/fuji_proxy.py &" >&2; exit 1; }

echo "== use Subnet-EVM v1.15.3 as the plugin the CLI installs (backup kept as .v0.8.0)"
[[ -f "$SEVM_CLI.v0.8.0" ]] || cp "$SEVM_CLI" "$SEVM_CLI.v0.8.0"
cp "$SEVM_NEW" "$SEVM_CLI"

echo "== remove the stale local node from the v1.14 attempt (no chain state, it never bootstrapped)"
"$CLI" node local destroy guardianl1-local-node-fuji 2>/dev/null || rm -rf "$HOME/.avalanche-cli/local/guardianl1-local-node-fuji"

echo "== deploy"
"$CLI" blockchain deploy guardianl1 --fuji --endpoint "$ENDPOINT" --key fuji_deployer \
  --use-local-machine --avalanchego-path "$AGO" --num-bootstrap-validators 1 --balance "$BALANCE" --partial-sync

echo "== done. Next: record chainId, RPC and ws URLs (avalanche blockchain describe guardianl1) in Backend/deployments/fuji-l1.json and Backend/.env"
