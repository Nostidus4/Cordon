#!/usr/bin/env bash
# `make demo-reset`: back to the start of scene 1 (spec 14.2, OPS-003).
#
#   sim API  (CHAIN_MODE=sim)  -> POST /api/demo/reset, nothing else.
#   l1  API  (CHAIN_MODE=l1)   -> redeploy the contract set on the RUNNING Guardian L1 (the vault keeps its counters per
#                                 UTC day, so an old deployment cannot be reset), then tell the API to reload.
#
# Steps of the L1 reset (each timed):
#   1 open     old Council enables the deployer (the deployer has no role after the handover)        [ResetOpen]
#   2 deploy   fresh tokens, DEXes, Registry, Vault, Council                                         [Deploy]
#   3 seed     policy v1 through real Council proposals + 200.000 tUSDC in the vault                  [Seed]
#   4 switch   re-enable locked keys, old Council hands the precompiles to the new one and drops its
#              role, minters move to the new Council                                                  [ResetSwitch]
#   4b finish  new Council: top-up operator moves, deployer loses its roles, counter -> 11          [ResetFinish]
#              With a Council timelock (COUNCIL_TIMELOCK_S > 0, set when the Council was deployed) every step that
#              passes proposals waits for the chain clock to reach the eta, then runs `Execute` (contracts.sh does it),
#              so a reset takes about one timelock per step 1, 3, 4 and 4b (60 s each when COUNCIL_TIMELOCK_S=60).
#   5 verify   VerifySeed + VerifyHandover on the new set, old Council has no role left
#   6 publish  policyBaseline into the file, atomic rename, POST /api/demo/reset (API reloads)
#
# NETWORK=local (default): public test keys only. NETWORK=fuji needs I_UNDERSTAND=fuji and the variables listed in
# infra/l1/contracts.sh (RPC_URL, DEPLOYER_PK, SEED_FILE, TOP_UP_OPERATOR, L1_KEY_COUNCIL_*); not run in CI.
# API_URL (default http://localhost:8000) is the backend to notify. A failed step leaves the live deployments file
# untouched; once step 4 has passed the new file is kept as <file>.next and a re-run resumes at step 4b/5.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.foundry/bin:$HOME/bin:$PATH"
export NETWORK="${NETWORK:-local}"
API_URL="${API_URL:-http://localhost:8000}"
CONTRACTS="$ROOT/infra/l1/contracts.sh"
T0=$SECONDS
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/demo-reset.XXXXXX")"

log() { printf '[demo-reset +%3ss] %s\n' "$((SECONDS - T0))" "$*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
jget() { python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(eval('d'+sys.argv[2]))" "$1" "$2"; }

api_mode() { curl -fsS -m 5 "$API_URL/api/health" 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["chainMode"])' 2>/dev/null || true; }
notify_api() { curl -fsS -X POST "$API_URL/api/demo/reset"; echo; }

MODE="$(api_mode)"
if [[ "$MODE" == "sim" ]]; then
  notify_api
  exit 0
fi
[[ "$MODE" == "l1" ]] || log "API at $API_URL did not answer: the chain is reset anyway, restart the API (or re-run) afterwards"

if [[ "$NETWORK" == "fuji" ]]; then
  [[ "${I_UNDERSTAND:-}" == "fuji" ]] || fail "NETWORK=fuji needs I_UNDERSTAND=fuji"
else
  [[ "$NETWORK" == "local" ]] || fail "NETWORK must be local or fuji"
  [[ -f "$ROOT/infra/l1/.env.l1-local" ]] || fail "no local L1 running: make l1-local-bootstrap"
  RPC_URL="$(grep '^RPC_URL=' "$ROOT/infra/l1/.env.l1-local" | cut -d= -f2-)"
fi
: "${RPC_URL:?RPC_URL is not set}"

DEP="$ROOT/Backend/deployments/$NETWORK-l1.json"
NEXT="$DEP.next"
REL_NEXT="../Backend/deployments/$NETWORK-l1.json.next" # forge resolves it from contracts/
TX_ALLOWLIST="0x0200000000000000000000000000000000000002"
DEPLOYER_ALLOWLIST="0x0200000000000000000000000000000000000000"
role() { cast call --rpc-url "$RPC_URL" "$1" "readAllowList(address)(uint256)" "$2" | awk '{print $1}'; }

step() { # step <label> <contracts.sh step> [env assignments are inherited]
  local label="$1" t=$SECONDS
  shift
  log "$label ..."
  if ! "$@" >"$LOGDIR/${label// /-}.log" 2>&1; then
    tail -25 "$LOGDIR/${label// /-}.log" >&2
    fail "$label failed (full log: $LOGDIR/${label// /-}.log)"
  fi
  log "$label done in $((SECONDS - t))s"
}

finalize() {
  export DEPLOYMENTS_OUT="$REL_NEXT"
  step "5a verify-seed" bash "$CONTRACTS" verify-seed
  step "5b verify-handover" bash "$CONTRACTS" verify-handover
  local old_council new_council
  new_council="$(jget "$NEXT" "['contracts']['council']")"
  for list in "$TX_ALLOWLIST" "$DEPLOYER_ALLOWLIST"; do
    [[ "$(role "$list" "$new_council")" == "2" ]] || fail "new Council is not admin of $list"
  done
  if [[ -f "$DEP" ]]; then
    old_council="$(jget "$DEP" "['contracts']['council']")"
    if [[ "$old_council" != "$new_council" ]]; then
      for list in "$TX_ALLOWLIST" "$DEPLOYER_ALLOWLIST"; do
        [[ "$(role "$list" "$old_council")" == "0" ]] || fail "old Council still has a role on $list"
      done
      log "old Council $old_council has no role on either AllowList"
    fi
  fi
  step "5c baseline" bash "$CONTRACTS" baseline
  mv -f "$NEXT" "$DEP" # atomic: the API and the scripts never see a half-written file
  log "6 deployments file replaced: $DEP"
  if [[ "$MODE" == "l1" ]]; then
    log "6 telling the API to reload ..."
    notify_api
  else
    log "6 API not reachable: restart it to pick up the new deployment"
  fi
  log "RESET COMPLETE in $((SECONDS - T0))s (new Council $new_council)"
}

# --- resume: a previous run died after the switch, the new set is complete but not yet published
if [[ -f "$NEXT" ]]; then
  nc="$(jget "$NEXT" "['contracts']['council']")"
  if [[ "$(role "$TX_ALLOWLIST" "$nc")" == "2" ]]; then
    log "resuming: $NEXT holds a set whose Council $nc is admin"
    export NETWORK
    export DEPLOYMENTS_OUT="$REL_NEXT"
    # step 4b is not idempotent: run it only when VerifyHandover says the new set is not finished yet
    if ! bash "$CONTRACTS" verify-handover >/dev/null 2>&1; then
      step "4b finish" bash "$CONTRACTS" reset-finish
    fi
    finalize
    exit 0
  fi
  rm -f "$NEXT"
fi

[[ -f "$DEP" ]] || fail "no deployment to reset ($DEP): run make l1-local-bootstrap"
OLD_COUNCIL="$(jget "$DEP" "['contracts']['council']")"
[[ "$(role "$TX_ALLOWLIST" "$OLD_COUNCIL")" == "2" ]] ||
  fail "the Council $OLD_COUNCIL is not admin of the Tx AllowList: nothing can deploy a new set (bootstrap a fresh L1)"
log "reset on $NETWORK: replacing Council $OLD_COUNCIL (logs in $LOGDIR)"

export OLD_DEPLOYMENTS="../Backend/deployments/$NETWORK-l1.json"
export DEPLOYMENTS_OUT="$REL_NEXT"
KEEP_NEXT=0
trap '[[ "$KEEP_NEXT" == 1 ]] || rm -f "$NEXT"' EXIT # before the switch the new set is useless: drop it
step "1 open" bash "$CONTRACTS" reset-open
step "2 deploy" bash "$CONTRACTS" deploy
step "3 seed" bash "$CONTRACTS" seed
KEEP_NEXT=1 # the switch may already have moved the precompile admin: a re-run resumes from the file
step "4 switch" bash "$CONTRACTS" reset-switch
step "4b finish" bash "$CONTRACTS" reset-finish
finalize
