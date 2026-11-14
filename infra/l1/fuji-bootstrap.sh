#!/usr/bin/env bash
# One-shot, resumable bring-up of the Guardian L1 contracts + the C-Chain treasury on Fuji (L1-002 / OPS-002).
#
#   NETWORK=fuji I_UNDERSTAND=fuji bash infra/l1/fuji-bootstrap.sh [--dry-run]
#
# --dry-run : sends NOTHING. Verifies keys, prints the plan, what is already done and the C-Chain AVAX each key needs.
# Real run  : every step first checks whether it is already done (deployments files, chain state) and skips it, and the
#             script stops at the first error, so re-running after a failure continues where it stopped.
# Order     : deploy L1 -> seed -> baseline -> deploy C-Chain treasury -> SIMULATED top-up -> handover -> baseline ->
#             verify-seed -> verify-handover. The top-up sits before the handover because the L1 tUSDC minter and the
#             vault topUpOperator are the deployer until then (contracts/cchain/README.md).
#
# Env (fuji): keys come from Backend/.env.fuji and ~/.avalanche-cli/key/fuji_deployer.pk (checked against the roster by
#   infra/l1/fuji_env.py, never printed). RPC_URL (the L1 validator, required), CCHAIN_RPC_URL (default Fuji public RPC),
#   COUNCIL_TIMELOCK_S (default 60), TOPUP_AMOUNT (whole tUSDC, default 200000), FUJI_ROSTER, FUJI_ENV_FILE,
#   FUJI_DEPLOYER_KEY_FILE.
# NETWORK=local is the TEST mode (Backend/tests/chain_l1/test_fuji_bootstrap.py): the caller provides RPC_URL,
#   CCHAIN_RPC_URL, DEPLOYMENTS_OUT (relative to contracts/), CCHAIN_DEPLOYMENTS(_OUT), L1_LOCAL_* and FAST_FORWARD=1,
#   all keys are anvil's/the public test ones. Never touches Fuji.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.foundry/bin:$HOME/bin:$PATH"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1
export NETWORK="${NETWORK:-fuji}"
AMOUNT="${TOPUP_AMOUNT:-200000}"
export COUNCIL_TIMELOCK_S="${COUNCIL_TIMELOCK_S:-60}"
CONTRACTS="$ROOT/infra/l1/contracts.sh"
CCHAIN="$ROOT/infra/cchain/cchain.sh"
PY="$ROOT/Backend/.venv/bin/python"
[[ -x "$PY" ]] || PY="python3"

step() { printf '\n[%s] %s\n' "$1" "$2"; }
status() { printf '    -> %s\n' "$1"; }
die() { echo "STOP: $*" >&2; exit 1; }
num() { awk '{print $1}'; }
jget() { python3 -c "
import json,sys
try:
    d=json.load(open(sys.argv[1]))
    for k in sys.argv[2].split('.'): d=d[k]
    print(d)
except Exception:
    print('')" "$1" "$2"; }

case "$NETWORK" in
  fuji)
    [[ "${I_UNDERSTAND:-}" == "fuji" ]] || { echo "Refusing: NETWORK=fuji needs I_UNDERSTAND=fuji" >&2; exit 1; }
    : "${RPC_URL:?set RPC_URL (the Guardian L1 validator RPC)}"
    export ROSTER="${FUJI_ROSTER:-$ROOT/contracts/genesis/roster.fuji.json}"
    export FUJI_ROSTER="$ROSTER"
    ENVF="${FUJI_ENV_FILE:-$ROOT/Backend/.env.fuji}"
    DKF="${FUJI_DEPLOYER_KEY_FILE:-$HOME/.avalanche-cli/key/fuji_deployer.pk}"
    [[ -f "$ROSTER" && -f "$ENVF" && -f "$DKF" ]] || die "missing roster, Backend/.env.fuji or deployer key file"
    step env "verify keys against the roster, write infra/l1/seed.l1-fuji.json"
    FUJI_ENV_FILE="$ENVF" FUJI_DEPLOYER_KEY_FILE="$DKF" "$PY" "$ROOT/infra/l1/fuji_env.py" --cchain-keys | grep -v "C-Chain owner" || die "fuji_env.py refused"
    set -a
    # shellcheck disable=SC1090
    source "$ENVF"
    set +a
    DEPLOYER_PK="$(tr -d ' \n\r' <"$DKF")"
    [[ "$DEPLOYER_PK" == 0x* ]] || DEPLOYER_PK="0x$DEPLOYER_PK"
    export DEPLOYER_PK
    export SEED_FILE="$ROOT/infra/l1/seed.l1-fuji.json"
    # The initial topUpOperator is the deployer (Deploy.s.sol); Handover moves it to this ops key (must differ from the deployer).
    TOP_UP_OPERATOR="$(jget "$ROSTER" enabled.backend_demo_signer)"
    export TOP_UP_OPERATOR
    export CCHAIN_RPC_URL="${CCHAIN_RPC_URL:-https://api.avax-test.network/ext/bc/C/rpc}"
    export L1_RPC_URL="$RPC_URL"
    export L1_TOPUP_KEY="$DEPLOYER_PK"
    [[ "$(cast chain-id --rpc-url "$RPC_URL")" == "$(jget "$ROSTER" chainId)" ]] || die "L1 RPC chain id is not the roster's"
    [[ "$(cast chain-id --rpc-url "$CCHAIN_RPC_URL")" == "43113" ]] || die "C-Chain RPC is not Fuji (43113)"
    DEP_REL="Backend/deployments/fuji-l1.json"
    C_FILE="$ROOT/Backend/deployments/fuji-c.json"
    ;;
  local)
    : "${RPC_URL:?test mode: set RPC_URL}"
    : "${CCHAIN_RPC_URL:?test mode: set CCHAIN_RPC_URL}"
    DEPLOYER_PK="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027" # gitleaks:allow
    export L1_RPC_URL="$RPC_URL" L1_TOPUP_KEY="$DEPLOYER_PK"
    DEP_REL="${DEPLOYMENTS_OUT:+${DEPLOYMENTS_OUT#../}}"
    DEP_REL="${DEP_REL:-Backend/deployments/local-l1.json}"
    C_FILE="${CCHAIN_DEPLOYMENTS:-$ROOT/Backend/deployments/local-c.json}"
    export L1_DEPLOYMENTS="$ROOT/$DEP_REL"
    ;;
  *) echo "NETWORK must be fuji or local" >&2; exit 2 ;;
esac
DEP="$ROOT/$DEP_REL"
export L1_DEPLOYMENTS="$DEP"
export CCHAIN_DEPLOYMENTS="$C_FILE"
CCHAIN_DEPLOYMENTS_OUT="../${C_FILE#"$ROOT"/}"
export CCHAIN_DEPLOYMENTS_OUT
DEPLOYER_ADDR="$(cast wallet address "$DEPLOYER_PK")"

l1_deployed() { [[ -n "$(jget "$DEP" contracts.vault)" ]]; }
c_deployed() { [[ -n "$(jget "$C_FILE" token)" ]]; }
proposals() { cast call --rpc-url "$RPC_URL" "$(jget "$DEP" contracts.council)" "proposalCount()(uint256)" | num; }
verify_seed_ok() { bash "$CONTRACTS" verify-seed >/dev/null 2>&1; }
verify_handover_ok() { bash "$CONTRACTS" verify-handover >/dev/null 2>&1; }
topup_done() {
  l1_deployed || return 1
  local n
  n="$(cast logs --rpc-url "$RPC_URL" --from-block 0 --address "$(jget "$DEP" contracts.vault)" "TopUpRecorded(bytes32,uint256)" | grep -c "^- address" || true)"
  [[ "$n" != "0" ]]
}

# ---------------------------------------------------------------- plan
step plan "L1 ${NETWORK} | timelock ${COUNCIL_TIMELOCK_S}s | top-up ${AMOUNT} tUSDC (SIMULATED, no bridge)"
l1_deployed && status "L1 contracts: deployed ($(jget "$DEP" contracts.vault))" || status "L1 contracts: not deployed"
c_deployed && status "C-Chain treasury: deployed ($(jget "$C_FILE" treasury))" || status "C-Chain treasury: not deployed"
if l1_deployed; then
  topup_done && status "top-up: recorded" || status "top-up: not recorded"
  verify_seed_ok && status "seed: verified" || status "seed: not verified yet"
  verify_handover_ok && status "handover: verified" || status "handover: not done"
fi
step funding "C-Chain AVAX needed (estimate at 25 gwei; send it yourself, this script never funds)"
status "deployer ${DEPLOYER_ADDR}: about 0.07 AVAX (deploy 2.3M gas, plus top-up executes)"
status "owners 1..3 (CCHAIN_OWNER_KEY_1..3): owner 1 about 0.02 AVAX, owners 2 and 3 about 0.005 AVAX each; owners 4 and 5 none"
if [[ -n "${CCHAIN_OWNER_KEY_1:-}" ]]; then
  for i in 1 2 3; do
    v="CCHAIN_OWNER_KEY_$i"
    a="$("$PY" -c "import sys;from eth_account import Account;print(Account.from_key(sys.argv[1]).address)" "${!v}")"
    status "owner $i $a balance: $(cast balance --ether --rpc-url "$CCHAIN_RPC_URL" "$a" 2>/dev/null || echo '?') AVAX"
  done
fi
status "deployer balance: $(cast balance --ether --rpc-url "$CCHAIN_RPC_URL" "$DEPLOYER_ADDR" 2>/dev/null || echo '?') AVAX on C-Chain, $(cast balance --ether --rpc-url "$RPC_URL" "$DEPLOYER_ADDR" 2>/dev/null || echo '?') on the L1"
if ((DRY)); then
  echo; echo "dry run: nothing was sent."
  exit 0
fi

# Owners 1..3 need gas on C-Chain before the top-up; check now so the run fails before the L1 is touched.
if [[ "$NETWORK" == "fuji" ]] && ! topup_done; then
  for i in 1 2 3; do
    v="CCHAIN_OWNER_KEY_$i"
    a="$("$PY" -c "import sys;from eth_account import Account;print(Account.from_key(sys.argv[1]).address)" "${!v}")"
    bal="$(cast balance --rpc-url "$CCHAIN_RPC_URL" "$a")"
    ((bal >= 3000000000000000)) || die "C-Chain owner $i ($a) holds under 0.003 AVAX: fund the owners, then re-run"
  done
fi

# ---------------------------------------------------------------- steps
step 1/9 "L1 contracts (deploy)"
if l1_deployed; then status "skip: already deployed"; else bash "$CONTRACTS" deploy; status "deployed"; fi

step 2/9 "L1 seed policy v1 (propose, wait out the timelock, execute)"
if [[ "$(proposals)" != "0" ]]; then bash "$CONTRACTS" execute; fi # drain anything queued by an earlier run
if verify_seed_ok; then status "skip: seed verified"
elif [[ "$(proposals)" == "0" ]]; then bash "$CONTRACTS" seed; verify_seed_ok || die "seed ran but verify-seed fails"; status "seeded"
else die "proposals exist but verify-seed fails: inspect the Council before re-running"; fi

step 3/9 "baseline (policy v1 label)"
bash "$CONTRACTS" baseline; status "baseline recorded"

step 4/9 "C-Chain treasury (3-of-5 multisig + test tUSDC, 2.000.000 minted)"
if c_deployed; then status "skip: ${C_FILE#"$ROOT"/} exists"; else bash "$CCHAIN" deploy; c_deployed || die "C-Chain deployment file is empty"; status "deployed"; fi

step 5/9 "SIMULATED top-up of ${AMOUNT} tUSDC (before the handover: the deployer still mints and records)"
if topup_done; then status "skip: TopUpRecorded already on the vault"; else AMOUNT="$AMOUNT" bash "$CCHAIN" topup; status "top-up recorded"; fi

step 6/9 "handover (Council becomes admin, minter and top-up operator move)"
if [[ "$(proposals)" != "0" ]]; then bash "$CONTRACTS" execute; fi
if verify_handover_ok; then status "skip: handover verified"; else bash "$CONTRACTS" handover; status "handed over"; fi

step 7/9 "baseline again (after the handover proposal)"
bash "$CONTRACTS" baseline; status "baseline recorded"

step 8/9 "verify-seed"
bash "$CONTRACTS" verify-seed; status "ok"

step 9/9 "verify-handover"
bash "$CONTRACTS" verify-handover; status "ok"

echo; echo "DONE: L1 contracts, seed, simulated top-up and handover verified."
echo "Next: record the L1 rpc/ws in Backend/deployments/fuji-l1.json and Backend/.env (contracts/genesis/README.md)."
