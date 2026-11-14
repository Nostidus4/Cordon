#!/usr/bin/env bash
# Run one Guardian L1 script against Fuji with the same environment as infra/l1/fuji-bootstrap.sh (#31).
#   I_UNDERSTAND=fuji RPC_URL=<validator rpc> infra/l1/fuji-run.sh <command...>
# e.g. infra/l1/fuji-run.sh bash infra/l1/contracts.sh policy-v2
#      infra/l1/fuji-run.sh bash infra/l1/real-checks.sh t8
#      infra/l1/fuji-run.sh bash infra/l1/demo-reset.sh
# Keys come from Backend/.env.fuji and the Avalanche CLI deployer key file; nothing is printed or written.
set -euo pipefail
[[ "${I_UNDERSTAND:-}" == "fuji" ]] || { echo "Refusing: needs I_UNDERSTAND=fuji" >&2; exit 1; }
: "${RPC_URL:?set RPC_URL (the Guardian L1 validator RPC)}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$ROOT/Backend/.venv/bin:$HOME/.foundry/bin:$HOME/bin:$PATH"
ROSTER="${FUJI_ROSTER:-$ROOT/contracts/genesis/roster.fuji.json}"
ENVF="${FUJI_ENV_FILE:-$ROOT/Backend/.env.fuji}"
DKF="${FUJI_DEPLOYER_KEY_FILE:-$HOME/.avalanche-cli/key/fuji_deployer.pk}"
[[ -f "$ROSTER" && -f "$ENVF" && -f "$DKF" ]] || { echo "missing roster, Backend/.env.fuji or deployer key file" >&2; exit 1; }
FUJI_ENV_FILE="$ENVF" FUJI_DEPLOYER_KEY_FILE="$DKF" python3 "$ROOT/infra/l1/fuji_env.py" >/dev/null
set -a
# shellcheck disable=SC1090
source "$ENVF"
set +a
DEPLOYER_PK="$(tr -d ' \n\r' <"$DKF")"
[[ "$DEPLOYER_PK" == 0x* ]] || DEPLOYER_PK="0x$DEPLOYER_PK"
export DEPLOYER_PK NETWORK=fuji I_UNDERSTAND=fuji RPC_URL L1_RPC_URL="$RPC_URL"
export SEED_FILE="$ROOT/infra/l1/seed.l1-fuji.json"
TOP_UP_OPERATOR="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['enabled']['backend_demo_signer'])" "$ROSTER")"
export TOP_UP_OPERATOR
[[ "$(cast chain-id --rpc-url "$RPC_URL")" == "$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['chainId'])" "$ROSTER")" ]] \
  || { echo "L1 RPC chain id is not the roster's" >&2; exit 1; }
cd "$ROOT"
exec "$@"
