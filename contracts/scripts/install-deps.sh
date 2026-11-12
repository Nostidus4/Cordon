#!/usr/bin/env bash
# Fetch the pinned Solidity dependencies into contracts/lib (gitignored). Idempotent.
# Usage: contracts/scripts/install-deps.sh   (or `make contracts-deps`).
set -euo pipefail

LIB="$(cd "$(dirname "$0")/.." && pwd)/lib"
mkdir -p "$LIB"

fetch() { # <dir> <repo> <tag>
  local dir="$LIB/$1" repo="$2" tag="$3"
  if [ -f "$dir/.pinned-$tag" ]; then
    return
  fi
  rm -rf "$dir"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$tag" "https://github.com/$repo.git" "$dir"
  rm -rf "$dir/.git"
  touch "$dir/.pinned-$tag"
  echo "installed $repo@$tag"
}

fetch openzeppelin-contracts OpenZeppelin/openzeppelin-contracts v5.4.0
fetch forge-std foundry-rs/forge-std v1.10.0
