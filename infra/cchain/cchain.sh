#!/usr/bin/env bash
# C-Chain treasury (OPS-002).  bash infra/cchain/cchain.sh deploy | topup
#   NETWORK=local (default): an anvil you started yourself (`anvil --port 8546 --chain-id 43113`), anvil's PUBLIC dev
#                            keys, writes Backend/deployments/local-c.json. Nothing is sent anywhere else.
#   NETWORK=fuji:            REFUSES unless I_UNDERSTAND=fuji. Keys come from the environment only:
#                            the deployer and five owner keys named in Backend/.env.example (topup also L1_RPC_URL and the L1 key).
#                            Writes Backend/deployments/fuji-c.json (addresses only).
# topup also needs AMOUNT (whole tUSDC). The top-up is SIMULATED, see contracts/cchain/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.foundry/bin:$HOME/bin:$PATH"
STEP="${1:?usage: cchain.sh deploy|topup}"
export NETWORK="${NETWORK:-local}"

case "$NETWORK" in
  local)
    export CCHAIN_RPC_URL="${CCHAIN_RPC_URL:-http://127.0.0.1:8546}"
    # anvil's public dev keys 0..5 (the well-known "test ... junk" mnemonic), worthless by design.
    : "${CCHAIN_DEPLOYER_KEY:=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}" # gitleaks:allow
    : "${CCHAIN_OWNER_KEY_1:=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}" # gitleaks:allow
    : "${CCHAIN_OWNER_KEY_2:=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}" # gitleaks:allow
    : "${CCHAIN_OWNER_KEY_3:=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}" # gitleaks:allow
    : "${CCHAIN_OWNER_KEY_4:=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a}" # gitleaks:allow
    : "${CCHAIN_OWNER_KEY_5:=0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba}" # gitleaks:allow
    export CCHAIN_DEPLOYER_KEY CCHAIN_OWNER_KEY_1 CCHAIN_OWNER_KEY_2 CCHAIN_OWNER_KEY_3 CCHAIN_OWNER_KEY_4 CCHAIN_OWNER_KEY_5
    ;;
  fuji)
    [[ "${I_UNDERSTAND:-}" == "fuji" ]] || { echo "Refusing: NETWORK=fuji needs I_UNDERSTAND=fuji" >&2; exit 1; }
    export CCHAIN_RPC_URL="${CCHAIN_RPC_URL:-https://api.avax-test.network/ext/bc/C/rpc}"
    export CCHAIN_WS_URL="${CCHAIN_WS_URL:-wss://api.avax-test.network/ext/bc/C/ws}"
    for v in CCHAIN_DEPLOYER_KEY CCHAIN_OWNER_KEY_1 CCHAIN_OWNER_KEY_2 CCHAIN_OWNER_KEY_3 CCHAIN_OWNER_KEY_4 CCHAIN_OWNER_KEY_5; do
      [[ -n "${!v:-}" ]] || { echo "NETWORK=fuji: $v is not set (keys live in Backend/.env.fuji, never in git)" >&2; exit 1; }
    done
    ;;
  *) echo "NETWORK must be local or fuji" >&2; exit 2 ;;
esac

case "$STEP" in
  deploy)
    cd "$ROOT/contracts"
    forge script script/DeployCChain.s.sol:DeployCChain --rpc-url "$CCHAIN_RPC_URL" --broadcast --slow
    ;;
  topup)
    : "${AMOUNT:?set AMOUNT (whole tUSDC), e.g. make topup AMOUNT=200000}"
    if [[ "$NETWORK" == "local" && -z "${L1_RPC_URL:-}" && -f "$ROOT/infra/l1/.env.l1-local" ]]; then
      # shellcheck disable=SC1091
      source "$ROOT/infra/l1/.env.l1-local" # RPC_URL of the local L1
      export L1_RPC_URL="$RPC_URL"
      # public ewoq key: deployer, tUSDC minter and top-up operator of the local L1 until the handover
      : "${L1_TOPUP_KEY:=0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027}" # gitleaks:allow
      export L1_TOPUP_KEY
    fi
    cd "$ROOT/Backend"
    uv run python scripts/cchain_topup.py
    ;;
  *) echo "unknown step $STEP" >&2; exit 2 ;;
esac
