# Development

## Setup
Requires `uv`, Node 22, and (optional) Docker.

    make setup          # uv sync + npm ci + pre-commit hooks
    uvx pre-commit install --hook-type pre-commit --hook-type pre-push   # hooks only

## Run
    make dev-api        # FastAPI on :8000
    make dev-web        # Vite on :5173, proxies /api -> :8000

The frontend defaults to `VITE_API_MODE=mock` (in-browser backend, fully static). Use `VITE_API_MODE=live` to talk to the API.

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
