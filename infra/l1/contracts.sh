#!/usr/bin/env bash
# Run one L1-002 script (contracts/script/*.s.sol) against the Guardian L1.
#   NETWORK=local (default) | fuji      step: deploy | seed | policy-v2 | handover | verify-seed | verify-handover
#                                        | reset-open | reset-switch | reset-finish (demo-reset, see infra/l1/demo-reset.sh)
#                                        | execute (phase 2 only) | baseline
#
# COUNCIL_TIMELOCK_S (#77): the Council's immutable timelock in seconds, read by `deploy` (default 0; recommended 60
#        for the demo). The steps that pass proposals (seed, handover, policy-v2, reset-open, reset-switch,
#        reset-finish) are phase 1: they propose and approve, so with a timelock the proposals are only queued. Each
#        of them then runs phase 2 here: wait until the chain's block timestamp reaches the latest eta, then run
#        `Execute.s.sol` (member key signs `execute(id)`), then return, so the next step and the verify steps see the
#        executed state. Delay 0: nothing to wait for, nothing changes.
#        FAST_FORWARD=1 (NETWORK=local only, an anvil-like node with evm_increaseTime) moves the clock instead of
#        waiting. Never on fuji. Subnet-EVM only mines on transactions, so while waiting a cheap self-transfer from
#        the Trang key produces the block that carries a fresh timestamp.
#
# local: public ewoq deployer key and the public "test ... junk" mnemonic keys, nothing else; reads the RPC URL
#        saved by `make l1-local-up`, generates Backend/.env.l1-local + the localised seed when missing.
# fuji:  refuses to run unless I_UNDERSTAND=fuji. Needs, in the environment (never in a file in git):
#          RPC_URL, DEPLOYER_PK, SEED_FILE (May Labs seed with the Fuji key/Council addresses),
#          TOP_UP_OPERATOR, L1_KEY_COUNCIL_TRANG / _LAN / _HUY.
#        Writes Backend/deployments/fuji-l1.json (addresses only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.foundry/bin:$HOME/bin:$PATH"
STEP="${1:?usage: contracts.sh deploy|seed|policy-v2|handover|verify-seed|verify-handover|reset-open|reset-switch|reset-finish|execute|baseline}"
export NETWORK="${NETWORK:-local}"

case "$NETWORK" in
  local)
    # L1_LOCAL_ENV_FILE / L1_LOCAL_SEED_FILE / RPC_URL in the environment: a throwaway node (the anvil bootstrap
    # test) without touching the files of a running local L1.
    if [[ -z "${RPC_URL:-}" ]]; then
      [[ -f "$ROOT/infra/l1/.env.l1-local" ]] || { echo "no local L1 running: make l1-local-up" >&2; exit 1; }
      # shellcheck disable=SC1091
      source "$ROOT/infra/l1/.env.l1-local" # RPC_URL
    fi
    export L1_LOCAL_ENV_FILE="${L1_LOCAL_ENV_FILE:-$ROOT/Backend/.env.l1-local}"
    export L1_LOCAL_SEED_FILE="${L1_LOCAL_SEED_FILE:-$ROOT/infra/l1/seed.l1-local.json}"
    python3 "$ROOT/infra/l1/local_env.py" >/dev/null # keys + localised seed (public test mnemonic only)
    set -a
    # shellcheck disable=SC1091
    source "$L1_LOCAL_ENV_FILE"
    set +a
    # Public ewoq key shipped with the Avalanche CLI (prefunded on the local network, admin in the genesis).
    export DEPLOYER_PK="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027" # gitleaks:allow
    export SEED_FILE="$L1_LOCAL_SEED_FILE"
    TOP_UP_OPERATOR="$(python3 -c "import json;print(json.load(open('$ROOT/contracts/genesis/roster.local.json'))['enabled']['backend_demo_signer'])")"
    export TOP_UP_OPERATOR
    ;;
  fuji)
    [[ "${I_UNDERSTAND:-}" == "fuji" ]] || { echo "NETWORK=fuji needs I_UNDERSTAND=fuji" >&2; exit 1; }
    for v in RPC_URL DEPLOYER_PK SEED_FILE TOP_UP_OPERATOR L1_KEY_COUNCIL_TRANG L1_KEY_COUNCIL_LAN L1_KEY_COUNCIL_HUY; do
      [[ -n "${!v:-}" ]] || { echo "NETWORK=fuji: $v is not set" >&2; exit 1; }
    done
    ;;
  *) echo "NETWORK must be local or fuji" >&2; exit 2 ;;
esac

# --slow waits for each receipt: proposals depend on the previous transaction. Only the handover calls the
# precompiles. Subnet-EVM reports placeholder code (0x01) for them, so forge's on-chain simulation of those calls
# dies with StackUnderflow: the handover skips that simulation and takes a generous gas multiplier (the real
# precompile costs more than the local STOP stand-in; its transactions are small). The seed proposal is ~4M gas,
# so a big multiplier there would exceed the 15M block gas limit. --start-fresh: every run is a fresh deployment.
MULT=130
SKIP=()
case "$STEP" in handover | reset-open | reset-switch | reset-finish) MULT=400; SKIP=(--skip-simulation) ;; esac
SEND=(--rpc-url "$RPC_URL" --broadcast --slow --start-fresh --gas-estimate-multiplier "$MULT" ${SKIP[@]+"${SKIP[@]}"})
READ=(--rpc-url "$RPC_URL")
cd "$ROOT/contracts"

num() { awk '{print $1}'; } # `cast call ...(uint)` prints "60" or "60 [6e1]"
council_of() { python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['contracts']['council'])" "$1"; }
chain_time() { cast block latest --rpc-url "$RPC_URL" -f timestamp; }
tick() { # one cheap transaction so the node mines a block (Subnet-EVM has no empty blocks)
  local me
  me="$(cast wallet address "$L1_KEY_COUNCIL_TRANG")"
  cast send --rpc-url "$RPC_URL" --private-key "$L1_KEY_COUNCIL_TRANG" --value 0 "$me" >/dev/null
}

# Phase 2 (#77) for the Council in deployments file `$1`; `$2` is the send mode of the steps that need the precompile
# workaround (MULT/SKIP above) or "plain". No timelock: returns at once.
drain_queue() {
  local file="$1" mode="$2" council delay n i e max_eta=0 ts now tries
  council="$(council_of "$file")"
  delay="$(cast call --rpc-url "$RPC_URL" "$council" "timelockDelay()(uint64)" | num)"
  [[ "$delay" != "0" ]] || return 0
  n="$(cast call --rpc-url "$RPC_URL" "$council" "proposalCount()(uint256)" | num)"
  for ((i = 1; i <= n; i++)); do
    e="$(cast call --rpc-url "$RPC_URL" "$council" "etaOf(uint256)(uint64)" "$i" | num)"
    ((e > max_eta)) && max_eta="$e"
  done
  ((max_eta > 0)) || return 0
  echo "timelock ${delay}s on Council $council: queued proposals executable from chain time $max_eta"
  while :; do
    ts="$(chain_time)"
    ((ts >= max_eta)) && break
    if [[ "${FAST_FORWARD:-}" == "1" && "$NETWORK" == "local" ]]; then
      cast rpc --rpc-url "$RPC_URL" evm_increaseTime $((max_eta - ts + 1)) >/dev/null
      cast rpc --rpc-url "$RPC_URL" evm_mine >/dev/null
      continue
    fi
    now="$(date +%s)"
    if ((now >= max_eta)); then tick; else sleep 2; fi
  done
  local args=("${SEND[@]}")
  [[ "$mode" == "plain" ]] && args=(--rpc-url "$RPC_URL" --broadcast --slow --start-fresh --gas-estimate-multiplier 130)
  for tries in 1 2 3 4 5 6; do
    if COUNCIL="$council" forge script script/Execute.s.sol:Execute "${args[@]}"; then return 0; fi
    echo "execute attempt $tries failed (TimelockNotReady while the node's clock lags?): mining a block and retrying" >&2
    tick || true
    sleep 3
  done
  echo "FAIL: queued proposals of $council could not be executed" >&2
  return 1
}
DEP_FILE="${DEPLOYMENTS_OUT:-../Backend/deployments/$NETWORK-l1.json}"
OLD_FILE="${OLD_DEPLOYMENTS:-../Backend/deployments/$NETWORK-l1.json}"

case "$STEP" in
  deploy) forge script script/Deploy.s.sol:Deploy "${SEND[@]}" ;;
  seed) forge script script/Seed.s.sol:Seed "${SEND[@]}" && drain_queue "$DEP_FILE" plain ;;
  policy-v2) forge script script/PolicyV2.s.sol:PolicyV2 "${SEND[@]}" && drain_queue "$DEP_FILE" plain ;;
  handover) forge script script/Handover.s.sol:Handover "${SEND[@]}" && drain_queue "$DEP_FILE" plain ;;
  execute) drain_queue "$DEP_FILE" plain ;;
  reset-open) forge script script/Reset.s.sol:ResetOpen "${SEND[@]}" && drain_queue "$OLD_FILE" precompile ;;
  reset-switch) forge script script/Reset.s.sol:ResetSwitch "${SEND[@]}" && drain_queue "$OLD_FILE" precompile ;;
  reset-finish) forge script script/Reset.s.sol:ResetFinish "${SEND[@]}" && drain_queue "$DEP_FILE" precompile ;;
  # policyBaseline: the vault's policyVersion once the set is complete = "policy v1" (docs/spec/CONTRACTS.md section 9)
  baseline) python3 "$ROOT/infra/l1/set_baseline.py" "${DEPLOYMENTS_OUT:-$ROOT/Backend/deployments/$NETWORK-l1.json}" "$RPC_URL" ;;
  verify-seed) forge script script/VerifySeed.s.sol:VerifySeed "${READ[@]}" ;;
  verify-handover)
    DEPLOYER_ADDRESS="$(cast wallet address "$DEPLOYER_PK")" forge script script/VerifyHandover.s.sol:VerifyHandover "${READ[@]}"
    ;;
  *) echo "unknown step $STEP" >&2; exit 2 ;;
esac
