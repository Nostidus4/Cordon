#!/usr/bin/env bash
# Guardian L1 on the Avalanche CLI *local* network: up | verify | down.
# Throwaway test keys only (public ewoq key + public "test ... junk" mnemonic). No real funds.
# Requires: avalanche (CLI), cast (Foundry), python3, curl.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEN="$ROOT/contracts/genesis"
STATE="$ROOT/infra/l1/.env.l1-local" # git-ignored (.env.*), holds RPC_URL only
export PATH="$HOME/bin:$HOME/.foundry/bin:$PATH"

AVALANCHE="${AVALANCHE:-avalanche}"
CHAIN_NAME="${CHAIN_NAME:-guardianl1}"
VM_VERSION="${VM_VERSION:-v0.8.0}" # Subnet-EVM
ROSTER="${ROSTER:-$GEN/roster.local.json}"
MNEMONIC="${LOCAL_MNEMONIC:-test test test test test test test test test test test junk}"
# Public ewoq key shipped with the Avalanche CLI / docs (local network prefunded). Never use elsewhere.
DEPLOYER_PK="0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027" # gitleaks:allow
TX_ALLOWLIST="0x0200000000000000000000000000000000000002"
DEPLOYER_ALLOWLIST="0x0200000000000000000000000000000000000000"
DEAD="0x000000000000000000000000000000000000dEaD"
INIT_CODE="0x600a600c600039600a6000f3602a60005260206000f3" # tiny contract, returns 42

log() { printf '\n== %s\n' "$*"; }
pk() { cast wallet private-key --mnemonic "$MNEMONIC" --mnemonic-index "$1"; }
role() { cast call --rpc-url "$RPC_URL" "$1" "readAllowList(address)(uint256)" "$2" | awk '{print $1}'; }
fail() { echo "FAIL: $*" >&2; exit 1; }
expect() { # expect <label> <actual> <expected>
  [[ "$2" == "$3" ]] || fail "$1: got '$2', expected '$3'"
  echo "PASS: $1 = $2"
}

genesis_check() {
  python3 "$GEN/build_genesis.py" "$ROSTER" | diff -q - "$GEN/genesis.json" >/dev/null ||
    fail "contracts/genesis/genesis.json is stale; run: python3 contracts/genesis/build_genesis.py > contracts/genesis/genesis.json"
}

cmd_up() {
  genesis_check
  "$AVALANCHE" --version
  "$AVALANCHE" blockchain create "$CHAIN_NAME" --evm --genesis "$GEN/genesis.json" \
    --evm-token "$(python3 -c "import json;print(json.load(open('$ROSTER'))['tokenSymbol'])")" \
    --vm-version "$VM_VERSION" --sovereign=false --icm=false --force
  # A freshly booted local P-Chain has zero fee capacity for a short while ("tx exceeds current
  # gas capacity: N > 0"), so boot the network first, wait, then deploy (with retries).
  "$AVALANCHE" network clean >/dev/null 2>&1 || true
  "$AVALANCHE" network start --num-nodes 1 >/dev/null
  sleep "${BOOT_WAIT:-30}"
  out=""
  for attempt in 1 2 3; do
    if out="$("$AVALANCHE" blockchain deploy "$CHAIN_NAME" --local --ewoq --num-nodes 1 2>&1)"; then break; fi
    echo "$out" | tail -3
    [[ "$attempt" -lt 3 ]] || fail "blockchain deploy failed 3 times"
    echo "deploy attempt $attempt failed, retrying in 20s"
    sleep 20
  done
  echo "$out" | tail -25
  rpc="$(echo "$out" | grep -Eo 'http://127\.0\.0\.1:[0-9]+/ext/bc/[A-Za-z0-9]+/rpc' | head -1)"
  [[ -n "$rpc" ]] || fail "could not find RPC URL in deploy output"
  echo "RPC_URL=$rpc" >"$STATE"
  echo "RPC_URL=$rpc (saved to infra/l1/.env.l1-local)"
}

cmd_down() {
  "$AVALANCHE" network clean || true
  "$AVALANCHE" blockchain delete "$CHAIN_NAME" --force 2>/dev/null || rm -rf "$HOME/.avalanche-cli/subnets/$CHAIN_NAME"
  rm -f "$STATE"
}

cmd_verify() {
  [[ -f "$STATE" ]] || fail "no running local L1; run: make l1-local-up"
  # shellcheck disable=SC1090
  source "$STATE"
  export RPC_URL
  local chain_id expected
  expected="$(python3 -c "import json;print(json.load(open('$ROSTER'))['chainId'])")"
  local deployer_addr minh_pk minh outsider_pk outsider
  deployer_addr="$(cast wallet address "$DEPLOYER_PK")"
  minh_pk="$(pk 7)"; minh="$(cast wallet address "$minh_pk")"
  outsider_pk="$(pk 19)"; outsider="$(cast wallet address "$outsider_pk")"

  log "1. chain id and block production"
  chain_id="$(cast chain-id --rpc-url "$RPC_URL")"
  expect "chain id" "$chain_id" "$expected"
  b1="$(cast block-number --rpc-url "$RPC_URL")"
  sleep 6
  b2="$(cast block-number --rpc-url "$RPC_URL")"
  echo "block $b1 -> $b2 (blocks are produced on demand: a tx below forces one)"

  log "2. readAllowList: initial roles from genesis"
  expect "TxAllowList(deployer) admin" "$(role "$TX_ALLOWLIST" "$deployer_addr")" 2
  expect "TxAllowList(key_minh) enabled" "$(role "$TX_ALLOWLIST" "$minh")" 1
  expect "TxAllowList(outsider) none" "$(role "$TX_ALLOWLIST" "$outsider")" 0
  expect "DeployerAllowList(deployer) admin" "$(role "$DEPLOYER_ALLOWLIST" "$deployer_addr")" 2
  expect "DeployerAllowList(key_minh) none" "$(role "$DEPLOYER_ALLOWLIST" "$minh")" 0

  log "3. tx from an allow-listed key succeeds"
  st="$(cast send --rpc-url "$RPC_URL" --private-key "$minh_pk" --value 1 "$DEAD" --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')"
  expect "key_minh tx status" "$st" "0x1"
  b3="$(cast block-number --rpc-url "$RPC_URL")"
  [[ "$b3" -gt "$b1" ]] || fail "block number did not increase ($b1 -> $b3)"
  echo "PASS: block number increased $b1 -> $b3"

  log "4. tx from a NON-allow-listed key is rejected by the node (no hash)"
  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" --value 1ether "$outsider" >/dev/null # admin funds gas
  n_before="$(cast nonce --rpc-url "$RPC_URL" "$outsider")"
  raw="$(cast mktx --rpc-url "$RPC_URL" --private-key "$outsider_pk" --value 1 "$DEAD")"
  resp="$(curl -s -X POST -H 'content-type: application/json' "$RPC_URL" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_sendRawTransaction\",\"params\":[\"$raw\"]}")"
  echo "raw eth_sendRawTransaction response: $resp"
  echo "$resp" | python3 -c 'import json,sys;r=json.load(sys.stdin);assert "result" not in r and "error" in r' ||
    fail "outsider tx was not rejected"
  cast_msg="$(cast send --rpc-url "$RPC_URL" --private-key "$outsider_pk" --value 1 "$DEAD" 2>&1 || true)"
  echo "cast send output: $cast_msg"
  expect "outsider nonce unchanged" "$(cast nonce --rpc-url "$RPC_URL" "$outsider")" "$n_before"
  grep -qi "non-allow listed" <<<"$resp" || fail "unexpected rejection text"
  echo "PASS: rejected, no hash"

  log "5. contract deploy: non-deployer rejected, deployer allowed"
  out="$(cast send --rpc-url "$RPC_URL" --private-key "$minh_pk" --create "$INIT_CODE" 2>&1 || true)"
  echo "enabled-but-not-deployer deploy: $out"
  grep -qi "not authorized to deploy a contract" <<<"$out" || fail "deploy from non-deployer was not rejected"
  addr="$(cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" --create "$INIT_CODE" --json | python3 -c 'import json,sys;print(json.load(sys.stdin)["contractAddress"])')"
  echo "PASS: deployer deployed contract at $addr"

  log "6. setEnabled on an outsider, then setNone on an enabled key"
  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$TX_ALLOWLIST" "setEnabled(address)" "$outsider" >/dev/null
  expect "TxAllowList(outsider) after setEnabled" "$(role "$TX_ALLOWLIST" "$outsider")" 1
  cast send --rpc-url "$RPC_URL" --private-key "$outsider_pk" --value 1 "$DEAD" >/dev/null
  echo "PASS: outsider tx succeeds after setEnabled"

  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$TX_ALLOWLIST" "setNone(address)" "$minh" >/dev/null
  expect "TxAllowList(key_minh) after setNone" "$(role "$TX_ALLOWLIST" "$minh")" 0
  out="$(cast send --rpc-url "$RPC_URL" --private-key "$minh_pk" --value 1 "$DEAD" 2>&1 || true)"
  echo "key_minh after setNone: $out"
  grep -qi "non-allow listed" <<<"$out" || fail "key_minh tx not rejected after setNone"
  echo "PASS: next tx of the locked key is rejected"

  log "7. restore, plus deployer allow list management"
  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$TX_ALLOWLIST" "setEnabled(address)" "$minh" >/dev/null
  cast send --rpc-url "$RPC_URL" --private-key "$minh_pk" --value 1 "$DEAD" >/dev/null
  echo "PASS: key_minh works again after setEnabled"
  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$DEPLOYER_ALLOWLIST" "setEnabled(address)" "$minh" >/dev/null
  expect "DeployerAllowList(key_minh) after setEnabled" "$(role "$DEPLOYER_ALLOWLIST" "$minh")" 1
  cast send --rpc-url "$RPC_URL" --private-key "$minh_pk" --create "$INIT_CODE" >/dev/null
  echo "PASS: key_minh can deploy once enabled on the deployer list"
  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$DEPLOYER_ALLOWLIST" "setNone(address)" "$minh" >/dev/null
  cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PK" "$TX_ALLOWLIST" "setNone(address)" "$outsider" >/dev/null

  log "ALL CHECKS PASSED"
}

case "${1:-}" in
  up) cmd_up ;;
  verify) cmd_verify ;;
  down) cmd_down ;;
  *) echo "usage: $0 up|verify|down" >&2; exit 2 ;;
esac
