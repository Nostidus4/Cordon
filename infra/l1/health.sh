#!/usr/bin/env bash
# Health check for the Guardian L1 RPC (used by `make l1-status`, cron or a monitor).
# env: L1_RPC_URL (required), L1_CHAIN_ID (optional, asserted when set).
# Exit 0 = healthy. Subnet-EVM produces blocks on demand, so liveness is chain id + block number answering.
set -euo pipefail
RPC="${L1_RPC_URL:?set L1_RPC_URL}"

rpc() {
  curl -fsS --max-time 10 -X POST -H 'content-type: application/json' "$RPC" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":[]}" |
    python3 -c 'import json,sys;print(int(json.load(sys.stdin)["result"],16))'
}

chain_id="$(rpc eth_chainId)"
block="$(rpc eth_blockNumber)"
if [[ -n "${L1_CHAIN_ID:-}" && "$chain_id" != "$L1_CHAIN_ID" ]]; then
  echo "UNHEALTHY: chain id $chain_id != expected $L1_CHAIN_ID" >&2
  exit 1
fi
echo "OK chain_id=$chain_id block=$block rpc=$RPC"
