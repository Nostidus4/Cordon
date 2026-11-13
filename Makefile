.PHONY: openapi parity shared-tables e2e e2e-l1 conformance contracts-deps contracts-build contracts-test abis setup dev-api dev-web dev-live test lint build docker-up docker-down db-up db-migrate demo-reset demo-scene4 blender-rebuild l1-local-up l1-local-down l1-local-verify deploy-l1 l1-status deploy-contracts verify-handover l1-deploy l1-seed l1-handover l1-policy-v2 l1-baseline l1-local-env l1-local-bootstrap l1-local-checks

API_URL ?= http://localhost:8000

setup:
	cd Backend && uv sync
	cd Frontend && npm ci
	cd Backend && uvx pre-commit install --hook-type pre-commit --hook-type pre-push || echo "skip pre-commit install (not a git repo yet)"

dev-api:
	cd Backend && uv run guardian-api

dev-web:
	cd Frontend && npm run dev

# Sim API (demo mode) + Vite in live mode; Ctrl-C stops both.
dev-live:
	@trap 'kill 0' INT TERM EXIT; \
	(cd Backend && CHAIN_MODE=sim DEMO_MODE=true uv run guardian-api) & \
	(cd Frontend && VITE_API_MODE=live npm run dev) & \
	wait

# Mock vs live parity (QA-001): starts the sim backend itself on :8199
parity:
	cd Frontend && npm run test:parity

test:
	cd Backend && uv run pytest -q
	cd Frontend && npm test

lint:
	cd Backend && uv run ruff check . && uv run ruff format --check .
	cd Frontend && npm run lint && npm run typecheck

# Export FastAPI's OpenAPI to Backend/openapi.json (CI fails when the committed file is stale)
openapi:
	cd Backend && uv run python -m guardian.tools.export_openapi

# Dump Python shared tables to Frontend/src/shared/backendTables.json (pytest + vitest compare it)
shared-tables:
	cd Backend && uv run python -m guardian.tools.export_shared_tables

build:
	cd Frontend && npm run build

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

# Local Postgres 16 (profile db). Needs POSTGRES_PASSWORD in the root .env (see .env.example).
db-up:
	docker compose --profile db up -d --wait db

# alembic upgrade head. DATABASE_URL wins; otherwise built from the root .env's POSTGRES_PASSWORD.
db-migrate:
	@set -a; [ -f .env ] && . ./.env; set +a; \
	cd Backend && DATABASE_URL="$${DATABASE_URL:-postgresql+asyncpg://guardian:$${POSTGRES_PASSWORD:?set in .env}@localhost:$${POSTGRES_PORT:-5432}/guardian}" uv run alembic upgrade head

# Start of scene 1. sim API: POST /api/demo/reset. l1 API (running local Guardian L1): redeploy the contract set,
# re-seed policy v1, then the API reloads (infra/l1/demo-reset.sh, OPS-003). NETWORK=fuji needs I_UNDERSTAND=fuji.
demo-reset:
	NETWORK=$(NETWORK) API_URL=$(API_URL) bash infra/l1/demo-reset.sh

demo-scene4:
	cd Backend && uv run guardian-attacker scene4 --step all --simulate-lock

blender-rebuild:
	@test -x Blender/scripts/rebuild.sh || { echo "Blender/scripts/rebuild.sh not found"; exit 1; }
	bash Blender/scripts/rebuild.sh

# Scenes 1-5 end to end through the API: `e2e` on the sim (also part of the normal pytest run), `e2e-l1` on the REAL
# local Guardian L1 (reuses or bootstraps it, runs demo-reset + all scenes twice, ~8 min cold; docs/DEVELOPMENT.md).
e2e:
	cd Backend && uv run pytest tests/e2e -q

e2e-l1:
	bash infra/l1/e2e-l1.sh

# ChainPort conformance (sim + L1 on anvil) and the CHAIN_MODE=l1 API e2e; the l1 half needs Foundry
conformance: contracts-build
	cd Backend && uv run pytest tests/conformance tests/chain_l1/test_api_l1_anvil.py -q -rs

# Pinned OpenZeppelin + forge-std into contracts/lib (gitignored); CI runs the same script
contracts-deps:
	contracts/scripts/install-deps.sh

contracts-build: contracts-deps
	cd contracts && forge build

contracts-test: contracts-deps
	cd contracts && forge fmt --check && forge build && forge test -vv

# Regenerate Backend/src/guardian/chain/abis/*.json from contracts/src/interfaces/*.sol
abis: contracts-deps
	contracts/scripts/export-abis.sh

# Guardian L1 (docs: contracts/genesis/README.md). Local targets use throwaway test keys only.
l1-local-up:
	bash infra/l1/l1-local.sh up

l1-local-verify:
	bash infra/l1/l1-local.sh verify

l1-local-down:
	bash infra/l1/l1-local.sh down

# Fuji: needs FUJI_KEY, ROSTER and I_UNDERSTAND=fuji (see infra/l1/deploy-fuji.sh).
deploy-l1:
	bash infra/l1/deploy-fuji.sh

# Needs L1_RPC_URL (and optionally L1_CHAIN_ID) in the environment.
l1-status:
	bash infra/l1/health.sh

# Contracts on the Guardian L1 (L1-002, docs: contracts/README.md). NETWORK=local (default, public test keys only)
# or NETWORK=fuji (needs I_UNDERSTAND=fuji and the variables listed in infra/l1/contracts.sh).
NETWORK ?= local

l1-deploy:
	@test "$(NETWORK)" != "fuji" -o "$(I_UNDERSTAND)" = "fuji" || { echo "NETWORK=fuji needs I_UNDERSTAND=fuji"; exit 1; }
	NETWORK=$(NETWORK) bash infra/l1/contracts.sh deploy

l1-seed:
	NETWORK=$(NETWORK) bash infra/l1/contracts.sh seed

l1-handover:
	NETWORK=$(NETWORK) bash infra/l1/contracts.sh handover

# Policy v2 through the Council (not part of the bootstrap: scene 4 starts from policy v1).
l1-policy-v2:
	NETWORK=$(NETWORK) bash infra/l1/contracts.sh policy-v2

# Deploy, seed policy v1, hand the precompile admin to the Council: run on a FRESH chain only.
deploy-contracts: l1-deploy
	$(MAKE) l1-seed l1-handover l1-baseline

# Records `policyBaseline` (the vault's policyVersion after seed + handover) in the deployments file: label v1.
l1-baseline:
	NETWORK=$(NETWORK) bash infra/l1/contracts.sh baseline

# Fails if the deployer still has a role or power (T15), reads the real precompiles.
verify-handover:
	NETWORK=$(NETWORK) bash infra/l1/contracts.sh verify-handover

# Public test keys -> Backend/.env.l1-local (+ localised seed); local network only.
l1-local-env:
	python3 infra/l1/local_env.py

# Fresh local L1 with everything deployed and verified (about 3 minutes).
l1-local-bootstrap: l1-local-up
	NETWORK=local $(MAKE) deploy-contracts
	NETWORK=local bash infra/l1/contracts.sh verify-seed
	NETWORK=local $(MAKE) verify-handover

# T15 and T8 against the real precompiles (T8 needs `make l1-policy-v2` first).
l1-local-checks:
	bash infra/l1/real-checks.sh t15
	bash infra/l1/real-checks.sh v2
	bash infra/l1/real-checks.sh t8
