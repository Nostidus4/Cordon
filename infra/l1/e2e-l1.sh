#!/usr/bin/env bash
# `make e2e-l1`: scenes 1-5 end to end on the REAL local Guardian L1 (OPS-004, spec §13.4, §14.3).
#
#   1 chain     reuse the running local L1 (infra/l1/.env.l1-local + deployments file) or bootstrap one (~3 min)
#   2 api       start uvicorn (CHAIN_MODE=l1, Backend/.env.l1-local) on E2E_PORT (default 8100)
#   3 pass 1    make demo-reset -> Backend/tests/e2e/scene_all.py (the same body that runs on the sim in CI)
#   4 pass 2    make demo-reset again -> scene_all again (repeatability)
# Prints the pass/fail table of every pass and the duration of each step; exits non-zero on any mismatch.
#
# Env: E2E_PORT (8100) · E2E_TEARDOWN=1 also stops the local network at the end. By default only the API is stopped
# and the network is left running (run `make l1-local-down` when done).
# Local network only, public test keys only. Never point it at Fuji.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.foundry/bin:$HOME/bin:$HOME/.local/bin:$PATH"
PORT="${E2E_PORT:-8100}"
API="http://127.0.0.1:$PORT"
STATE="$ROOT/infra/l1/.env.l1-local"
DEP="$ROOT/Backend/deployments/local-l1.json"
MNEMONIC="${LOCAL_MNEMONIC:-test test test test test test test test test test test junk}"
T0=$SECONDS
LOG="$(mktemp -d "${TMPDIR:-/tmp}/e2e-l1.XXXXXX")"
API_PID=""
declare -a TIMES=()

log() { printf '[e2e-l1 +%4ss] %s\n' "$((SECONDS - T0))" "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
lap() { TIMES+=("$(printf '%-22s %4ss' "$1" "$((SECONDS - $2))")"); }

cleanup() {
  [[ -z "$API_PID" ]] || kill "$API_PID" 2>/dev/null || true
  if [[ "${E2E_TEARDOWN:-0}" == "1" ]]; then make -C "$ROOT" l1-local-down || true; fi
}
trap cleanup EXIT

rpc_alive() {
  [[ -f "$STATE" ]] || return 1
  local rpc
  rpc="$(grep '^RPC_URL=' "$STATE" | cut -d= -f2-)"
  cast chain-id --rpc-url "$rpc" >/dev/null 2>&1
}

# --- 1 chain
t=$SECONDS
if rpc_alive && [[ -f "$DEP" ]]; then
  log "reusing the running local L1 ($(grep '^RPC_URL=' "$STATE" | cut -d= -f2-))"
else
  log "no running local L1: bootstrapping (cold boot may retry the P-Chain gas capacity error, see docs/DEVELOPMENT.md)"
  make -C "$ROOT" l1-local-bootstrap
fi
python3 "$ROOT/infra/l1/local_env.py" >/dev/null
RPC_URL="$(grep '^RPC_URL=' "$STATE" | cut -d= -f2-)"
lap "1 chain" "$t"

# --- 2 api
t=$SECONDS
if curl -fsS -m 2 "$API/api/health" >/dev/null 2>&1; then fail "something already listens on port $PORT (set E2E_PORT)"; fi
(cd "$ROOT/Backend" && exec uv run --env-file .env.l1-local uvicorn guardian.main:app --port "$PORT" >"$LOG/api.log" 2>&1) &
API_PID=$!
for _ in $(seq 1 60); do
  curl -fsS -m 2 "$API/api/health" >/dev/null 2>&1 && break
  kill -0 "$API_PID" 2>/dev/null || { tail -30 "$LOG/api.log" >&2; fail "API exited (log $LOG/api.log)"; }
  sleep 1
done
curl -fsS -m 2 "$API/api/health" >/dev/null 2>&1 || fail "API did not come up (log $LOG/api.log)"
log "API up on $API (pid $API_PID, log $LOG/api.log)"
lap "2 api start" "$t"

HUY="$(cast wallet address --mnemonic "$MNEMONIC" --mnemonic-index 2)"
STATUS=0
for pass in 1 2; do
  t=$SECONDS
  log "pass $pass: demo-reset"
  NETWORK=local API_URL="$API" bash "$ROOT/infra/l1/demo-reset.sh" | tee "$LOG/reset-$pass.log" | sed -n '/RESET COMPLETE/p;/done in/p'
  lap "pass $pass demo-reset" "$t"
  t=$SECONDS
  council="$(python3 -c "import json;print(json.load(open('$DEP'))['contracts']['council'])")"
  log "pass $pass: scenes 1-5 (council $council)"
  if ! (cd "$ROOT/Backend" && uv run python -m tests.e2e.scene_all "$API" --real --rpc "$RPC_URL" --council "$council" --huy "$HUY") | tee "$LOG/scenes-$pass.log"; then
    STATUS=1
  fi
  lap "pass $pass scenes" "$t"
  [[ "$STATUS" == 0 ]] || break
done

printf '\n== durations\n'
printf '%s\n' "${TIMES[@]}"
log "total ${SECONDS}s, logs in $LOG"
if [[ "$STATUS" == 0 ]]; then echo "E2E-L1: ALL PASSES OK"; else echo "E2E-L1: MISMATCH (see the table above)"; fi
exit "$STATUS"
