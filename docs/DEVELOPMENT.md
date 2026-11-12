# Development

## Setup
Requires `uv`, Node 22, and (optional) Docker.

    make setup          # uv sync + npm ci + pre-commit hooks
    uvx pre-commit install --hook-type pre-commit --hook-type pre-push   # hooks only

## Run
    make dev-api        # FastAPI on :8000
    make dev-web        # Vite on :5173, proxies /api -> :8000

The frontend defaults to `VITE_API_MODE=mock` (in-browser backend, fully static). Use `VITE_API_MODE=live` to talk to the API.

## Run against the chain adapter (`CHAIN_MODE=l1`)
Default is `CHAIN_MODE=sim` (in-memory chain, no setup). To run the API on a Guardian L1:

    make contracts-deps && (cd contracts && forge build)   # Foundry: ~/.foundry/bin
    make l1-local-up                                       # local Guardian L1 (Avalanche CLI), then `make l1-local-verify`
    # deploy the contracts + seed policy v1 and write Backend/deployments/*.json  (see note)
    cd Backend && CHAIN_MODE=l1 DEMO_MODE=true L1_RPC_URL=... DEPLOYMENTS_FILE=deployments/fuji-l1.json \
        L1_KEY_KEY_MINH=... uv run guardian-api            # one L1_KEY_<SEED_ID> per demo actor, test keys only

Note: the deploy script for the real L1 (`contracts/script/Deploy.s.sol`, `make deploy-contracts`) does not exist yet, it is part of L1-002 (#31). Until then the L1 path is exercised on anvil by the tests (`uv run pytest tests/chain_l1 tests/conformance`, needs Foundry; they skip without it). Startup errors name the missing variable or file; `DEMO_MODE` is refused on a chain id outside `DEMO_CHAIN_IDS` (default anvil 31337 and local L1 424242). `POST /api/demo/reset` answers 409 on L1. Details: `docs/modules/chain-adapter/README.md`.

## Test / lint / build
    make test
    make lint
    make build

Pre-push runs backend pytest; pre-commit runs ruff, eslint, tsc, gitleaks and file hygiene hooks.

## Docker
    make docker-up      # api :8000, web :8080 (live mode, /api proxied)
    make docker-down

## GitHub Pages
`.github/workflows/pages.yml` builds with `VITE_API_MODE=mock VITE_BASE=/Cordon/`, copies `index.html` to `404.html` (SPA deep links) and deploys.
Repository setting: Settings > Pages > Source = "GitHub Actions".

## Blender
`make blender-rebuild` runs `Blender/scripts/rebuild.sh`. Sources live in `Blender/out/*.blend`. Scripts currently assume the repo is at `~/Documents/Cordon`.
