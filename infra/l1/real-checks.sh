#!/usr/bin/env bash
# Checks that need the REAL Subnet-EVM precompiles (the anvil suites only have a mock): local Guardian L1 only.
#   t15   after the handover the deployer is rejected by the node and cannot touch either allow list
#   t8    Council member `lan` calls emergencyLock(minh): the 5 keys of `minh` read role 0 and the node rejects
#         their next transaction with no hash. Needs policy v2 first (5 keys in `minh`): `make l1-local-policy-v2`.
# Uses the public ewoq key and the public test mnemonic keys of Backend/.env.l1-local only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$HOME/.foundry/bin:$HOME/bin:$PATH"
[[ -f "$ROOT/infra/l1/.env.l1-local" ]] || { echo "no local L1 running: make l1-local-up" >&2; exit 1; }
RPC_URL="$(grep '^RPC_URL=' "$ROOT/infra/l1/.env.l1-local" | cut -d= -f2-)"
DEP="$ROOT/Backend/deployments/local-l1.json"
ENVF="$ROOT/Backend/.env.l1-local"
TX_ALLOWLIST="0x0200000000000000000000000000000000000002"
DEPLOYER_ALLOWLIST="0x0200000000000000000000000000000000000000"
DEAD="0x000000000000000000000000000000000000dEaD"
# Public ewoq key shipped with the Avalanche CLI (local network only).
DEPLOYER_PK="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027" # gitleaks:allow
INIT_CODE="0x600a600c600039600a6000f3602a60005260206000f3"

jget() { python3 -c "import json,sys;d=json.load(open('$DEP'));print(eval('d'+sys.argv[1]))" "$1"; }
envkey() { grep "^L1_KEY_$1=" "$ENVF" | cut -d= -f2-; }
role() { cast call --rpc-url "$RPC_URL" "$1" "readAllowList(address)(uint256)" "$2" | awk '{print $1}'; }
fail() { echo "FAIL: $*" >&2; exit 1; }
expect() { [[ "$2" == "$3" ]] || fail "$1: got '$2', expected '$3'"; echo "PASS: $1 = $2"; }

raw_send() { # raw_send <pk>: eth_sendRawTransaction response (prints it), fails if a tx hash came back
  local raw resp
  raw="$(cast mktx --rpc-url "$RPC_URL" --private-key "$1" --value 1 "$DEAD" --gas-limit 21000 --gas-price 2gwei)"
  resp="$(curl -s -X POST -H 'content-type: application/json' "$RPC_URL" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_sendRawTransaction\",\"params\":[\"$raw\"]}")"
  echo "  eth_sendRawTransaction -> $resp"
  echo "$resp" | python3 -c 'import json,sys;r=json.load(sys.stdin);assert "result" not in r and "error" in r' || fail "no rejection"
  grep -q "non-allow listed" <<<"$resp" || fail "unexpected rejection text"
}

t15() {
  local me out n0 n1
  me="$(cast wallet address "$DEPLOYER_PK")"
  echo "== T15 (real): deployer $me after the handover"
  expect "Tx AllowList readAllowList(deployer)" "$(role "$TX_ALLOWLIST" "$me")" 0
  expect "Deployer AllowList readAllowList(deployer)" "$(role "$DEPLOYER_ALLOWLIST" "$me")" 0
  expect "Tx AllowList readAllowList(Council)" "$(role "$TX_ALLOWLIST" "$(jget "['contracts']['council']")")" 2
  expect "Deployer AllowList readAllowList(Council)" "$(role "$DEPLOYER_ALLOWLIST" "$(jget "['contracts']['council']")")" 2
  n0="$(cast nonce --rpc-url "$RPC_URL" "$me")"
  echo "-- plain transfer from the deployer"
  raw_send "$DEPLOYER_PK"
  echo "-- contract deployment from the deployer (cast send --create)"
  out="$(cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" --create "$INIT_CODE" 2>&1 || true)"
  echo "  $out"
  grep -Eqi "non-allow listed|not authorized to deploy" <<<"$out" || fail "deployment from the deployer was not rejected"
  echo "-- deployer tries to take the Tx AllowList back (setAdmin(self))"
  out="$(cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$TX_ALLOWLIST" "setAdmin(address)" "$me" 2>&1 || true)"
  echo "  $out"
  grep -Eqi "non-allow listed|cannot modify allow list" <<<"$out" || fail "setAdmin from the deployer was not rejected"
  n1="$(cast nonce --rpc-url "$RPC_URL" "$me")"
  expect "deployer nonce unchanged" "$n1" "$n0"
  echo "T15 PASSED"
}

t8() {
  local council registry vault minh keys k n out
  council="$(jget "['contracts']['council']")"; registry="$(jget "['contracts']['registry']")"; vault="$(jget "['contracts']['vault']")"
  minh="$(cast format-bytes32-string minh)"
  echo "== T8 (real): emergencyLock(minh) by council_lan"
  keys="$(cast call --rpc-url "$RPC_URL" "$registry" "keysOf(bytes32)(address[])" "$minh" | tr -d '[],')"
  n=$(wc -w <<<"$keys" | tr -d ' ')
  expect "keys in district minh" "$n" 5
  for k in $keys; do expect "before: readAllowList($k)" "$(role "$TX_ALLOWLIST" "$k")" 1; done
  expect "before: principalLocked(minh)" "$(cast call --rpc-url "$RPC_URL" "$vault" "principalLocked(bytes32)(bool)" "$minh")" false
  out="$(cast send --rpc-url "$RPC_URL" --private-key "$(envkey COUNCIL_LAN)" "$council" "emergencyLock(bytes32)" "$minh" --json)"
  echo "  emergencyLock tx: $(python3 -c 'import json,sys;r=json.loads(sys.argv[1]);print(r["transactionHash"], "status", r["status"], "gasUsed", int(r["gasUsed"],16))' "$out")"
  expect "after: principalLocked(minh)" "$(cast call --rpc-url "$RPC_URL" "$vault" "principalLocked(bytes32)(bool)" "$minh")" true
  for k in $keys; do expect "after: readAllowList($k)" "$(role "$TX_ALLOWLIST" "$k")" 0; done
  for sid in KEY_MINH KEY_AGENT_DATA KEY_AGENT_INTL_PAY KEY_AGENT_REBALANCE KEY_SVC_PAYMENT; do
    echo "-- next transaction of $sid"
    raw_send "$(envkey "$sid")"
  done
  out="$(cast send --rpc-url "$RPC_URL" --private-key "$(envkey KEY_MINH)" --value 1 "$DEAD" 2>&1 || true)"
  echo "-- cast send from key_minh: $out"
  grep -q "cannot issue transaction from non-allow listed address" <<<"$out" || fail "key_minh was not rejected by the node"
  echo "T8 PASSED"
}

v2() { # state read from the chain after PolicyV2 (acceptance: 5 keys in minh, district cap 30.000)
  local registry vault minh
  registry="$(jget "['contracts']['registry']")"; vault="$(jget "['contracts']['vault']")"; minh="$(cast format-bytes32-string minh)"
  echo "policyVersion = $(cast call --rpc-url "$RPC_URL" "$vault" "policyVersion()(uint256)")"
  expect "keys in minh" "$(cast call --rpc-url "$RPC_URL" "$registry" "keysOf(bytes32)(address[])" "$minh" | tr -d '[],' | wc -w | tr -d ' ')" 5
  expect "principalDailyCap(minh) tUSDC base units" "$(cast call --rpc-url "$RPC_URL" "$vault" "principalDailyCap(bytes32)(uint256)" "$minh" | awk '{print $1}')" 30000000000
}

case "${1:-}" in
  v2) v2 ;;
  t15) t15 ;;
  t8) t8 ;;
  *) echo "usage: $0 t15|t8" >&2; exit 2 ;;
esac
