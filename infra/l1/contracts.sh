#!/usr/bin/env bash
# Run one L1-002 script (contracts/script/*.s.sol) against the Guardian L1.
#   NETWORK=local (default) | fuji      step: deploy | seed | policy-v2 | handover | verify-seed | verify-handover
#                                        | reset-open | reset-switch (demo-reset, see infra/l1/demo-reset.sh) | baseline
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
STEP="${1:?usage: contracts.sh deploy|seed|policy-v2|handover|verify-seed|verify-handover|reset-open|reset-switch|baseline}"
export NETWORK="${NETWORK:-local}"

case "$NETWORK" in
  local)
    [[ -f "$ROOT/infra/l1/.env.l1-local" ]] || { echo "no local L1 running: make l1-local-up" >&2; exit 1; }
    # shellcheck disable=SC1091
    source "$ROOT/infra/l1/.env.l1-local" # RPC_URL
    python3 "$ROOT/infra/l1/local_env.py" >/dev/null # keys + localised seed (public test mnemonic only)
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/Backend/.env.l1-local"
    set +a
    # Public ewoq key shipped with the Avalanche CLI (prefunded on the local network, admin in the genesis).
    export DEPLOYER_PK="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027" # gitleaks:allow
    export SEED_FILE="$ROOT/infra/l1/seed.l1-local.json"
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
case "$STEP" in handover | reset-open | reset-switch) MULT=400; SKIP=(--skip-simulation) ;; esac
SEND=(--rpc-url "$RPC_URL" --broadcast --slow --start-fresh --gas-estimate-multiplier "$MULT" ${SKIP[@]+"${SKIP[@]}"})
READ=(--rpc-url "$RPC_URL")
cd "$ROOT/contracts"
case "$STEP" in
  deploy) forge script script/Deploy.s.sol:Deploy "${SEND[@]}" ;;
  seed) forge script script/Seed.s.sol:Seed "${SEND[@]}" ;;
  policy-v2) forge script script/PolicyV2.s.sol:PolicyV2 "${SEND[@]}" ;;
  handover) forge script script/Handover.s.sol:Handover "${SEND[@]}" ;;
  reset-open) forge script script/Reset.s.sol:ResetOpen "${SEND[@]}" ;;
  reset-switch) forge script script/Reset.s.sol:ResetSwitch "${SEND[@]}" ;;
  # policyBaseline: the vault's policyVersion once the set is complete = "policy v1" (docs/spec/CONTRACTS.md section 9)
  baseline) python3 "$ROOT/infra/l1/set_baseline.py" "${DEPLOYMENTS_OUT:-$ROOT/Backend/deployments/$NETWORK-l1.json}" "$RPC_URL" ;;
  verify-seed) forge script script/VerifySeed.s.sol:VerifySeed "${READ[@]}" ;;
  verify-handover)
    DEPLOYER_ADDRESS="$(cast wallet address "$DEPLOYER_PK")" forge script script/VerifyHandover.s.sol:VerifyHandover "${READ[@]}"
    ;;
  *) echo "unknown step $STEP" >&2; exit 2 ;;
esac
