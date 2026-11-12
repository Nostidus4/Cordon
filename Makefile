.PHONY: contracts-build abis setup dev-api dev-web test lint build docker-up docker-down demo-reset demo-scene4 blender-rebuild l1-local-up l1-local-down l1-local-verify deploy-l1 l1-status

API_URL ?= http://localhost:8000

setup:
	cd Backend && uv sync
	cd Frontend && npm ci
	cd Backend && uvx pre-commit install --hook-type pre-commit --hook-type pre-push || echo "skip pre-commit install (not a git repo yet)"

dev-api:
	cd Backend && uv run guardian-api

dev-web:
	cd Frontend && npm run dev

test:
	cd Backend && uv run pytest -q
	cd Frontend && npm test

lint:
	cd Backend && uv run ruff check . && uv run ruff format --check .
	cd Frontend && npm run lint && npm run typecheck

build:
	cd Frontend && npm run build

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down

demo-reset:
	curl -fsS -X POST $(API_URL)/api/demo/reset

demo-scene4:
	cd Backend && uv run guardian-attacker scene4 --step all --simulate-lock

blender-rebuild:
	@test -x Blender/scripts/rebuild.sh || { echo "Blender/scripts/rebuild.sh not found"; exit 1; }
	bash Blender/scripts/rebuild.sh

contracts-build:
	cd contracts && forge build

# Regenerate Backend/src/guardian/chain/abis/*.json from contracts/src/interfaces/*.sol
abis:
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
