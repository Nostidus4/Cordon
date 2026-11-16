#!/usr/bin/env bash
# Health check of the l1 compose stack (L1-003, issue #35 acceptance): `make stack-l1 && scripts/smoke-l1.sh`.
# Asserts /api/health: chainMode=l1, simulated=false, indexer lag <= 2 blocks, worker heartbeat, a block seen
# recently, and the same through the web container's /api proxy. Read-only: sends nothing to the chain.
# Needs curl + jq. API_URL / WEB_URL override the default localhost ports of the root .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
API="${API_URL:-http://localhost:${API_PORT:-8000}}"
WEB="${WEB_URL:-http://localhost:${WEB_PORT:-8080}}"
fails=0

check() { # label got want
  if [ "$2" == "$3" ]; then echo "PASS $1: $2"; else echo "FAIL $1: got $2, want $3"; fails=$((fails + 1)); fi
}
for _ in $(seq 1 60); do curl -fsS -o /dev/null "$API/api/health" 2>/dev/null && break; sleep 2; done

h=$(curl -fsS "$API/api/health")
echo "$h" | jq -c '{status, chainMode, simulated, demoMode, l1Block, indexerLagBlocks, worker: .worker.status, warnings}'
check "health status" "$(jq -r .status <<<"$h")" ok
check "health chainMode" "$(jq -r .chainMode <<<"$h")" l1
check "health simulated" "$(jq -r .simulated <<<"$h")" false
lag=$(jq -r '.indexerLagBlocks // 999' <<<"$h")
check "indexer lag <= 2 blocks" "$([ "$lag" -le 2 ] && echo yes || echo "no ($lag)")" yes
check "worker heartbeat" "$(jq -r '.worker.status' <<<"$h")" running
check "block stalled" "$(jq -r .blockStalled <<<"$h")" false
check "graph districts" "$(curl -fsS "$API/api/graph" | jq '.districts | length')" 7
check "web /api/health (proxy) chainMode" "$(curl -fsS "$WEB/api/health" | jq -r .chainMode)" l1

[ "$fails" -eq 0 ] && echo "SMOKE-L1 OK" || { echo "SMOKE-L1 FAILED ($fails)"; exit 1; }
