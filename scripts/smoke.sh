#!/usr/bin/env bash
# Smoke test of the docker compose stack (QA-002). Run after `docker compose up --build -d`.
# Resets the sim demo, checks health/graph, simulate(minh), merge to policy v2, one agent run, scene 4,
# the web container (/ and /api proxy), then `docker compose restart api` keeps attempts + proposals.
# Needs curl + jq. SKIP_RESTART=1 skips the restart check.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
API="http://localhost:${API_PORT:-8000}"
WEB="http://localhost:${WEB_PORT:-8080}"
fails=0

check() { # label got want
  if [ "$2" == "$3" ]; then echo "PASS $1: $2"; else echo "FAIL $1: got $2, want $3"; fails=$((fails + 1)); fi
}
call() { # method path [json]
  curl -fsS -X "$1" -H 'content-type: application/json' ${3:+-d "$3"} "$API$2"
}
wait_health() { # url
  for _ in $(seq 1 90); do curl -fsS -o /dev/null "$1/api/health" 2>/dev/null && return 0; sleep 2; done
  echo "FAIL $1/api/health not up after 180s"; exit 1
}

wait_health "$API"
wait_health "$WEB"
call POST /api/demo/reset >/dev/null

h=$(call GET /api/health)
check "health chainMode" "$(jq -r .chainMode <<<"$h")" sim
check "health agent status present" "$(jq -r '.agent.status' <<<"$h")" never_run
check "graph districts" "$(call GET /api/graph | jq '.districts | length')" 7

t=$(call POST /api/simulate '{"compromised":["minh"]}' | jq -r '.totals | "\(.enforced.display) \(.estimated.display)"')
check "simulate minh enforced/estimated" "$t" "20.000 100.000"

# scene 3: merge minh -> policy v2 (scene 4 requires it)
F=R1_MULTI_KEY_NO_SHARED_CAP:minh
pid=$(call POST /api/proposals "{\"member\":\"lan\",\"findingId\":\"$F\"}" | jq .id)
call POST "/api/proposals/$pid/approve" '{"member":"lan"}' >/dev/null
check "merge executed" "$(call POST "/api/proposals/$pid/approve" '{"member":"trang"}' | jq -r .status)" executed

a=$(call POST /api/agent/run-once | jq -r '"\(.outcome) \(.decision.amountIn.display)"')
check "agent run" "$a" "swapped 5.000"

r=$(call POST '/api/scenario/scene4/run?delay=0&wait=true' |
  jq -c '[.attempts[] | select(.step >= 1 and .step <= 5)] | sort_by(.step) | map(.reasonCode)')
check "scene 4 reasons steps 1-5" "$r" '["RECIPIENT_NOT_ALLOWED","PROTOCOL_NOT_ALLOWED",null,null,"DISTRICT_DAILY_CAP"]'

h=$(call GET /api/health)
check "health agent after run" "$(jq -r '"\(.agent.status) \(.agent.lastOutcome)"' <<<"$h")" "idle swapped"
check "web /" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" 200
check "web /api/health (proxy)" "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/health")" 200
check "web proxy chainMode" "$(curl -fsS "$WEB/api/health" | jq -r .chainMode)" sim

if [ "${SKIP_RESTART:-}" != 1 ]; then
  snap() { echo "{\"attempts\":$(call GET /api/attempts),\"proposals\":$(call GET /api/proposals)}" | jq -S .; }
  before=$(snap)
  docker compose restart api >/dev/null
  sleep 2
  wait_health "$API"
  after=$(snap)
  check "attempts/proposals count after restart" "$(jq -c '[.attempts, .proposals] | map(length)' <<<"$after")" \
    "$(jq -c '[.attempts, .proposals] | map(length)' <<<"$before")"
  if [ "$before" == "$after" ]; then check "attempts+proposals identical after restart" same same
  else check "attempts+proposals identical after restart" differ same; diff <(echo "$before") <(echo "$after") || true; fi
fi

[ "$fails" -eq 0 ] && echo "SMOKE OK" || { echo "SMOKE FAILED ($fails)"; exit 1; }
