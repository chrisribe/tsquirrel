#!/usr/bin/env bash
set -euo pipefail

# Deploy TSquirrel server with commit-SHA cache busting.
# Usage:
#   scripts/deploy-server.sh            # build+start server
#   scripts/deploy-server.sh --pull     # git pull --ff-only then build+start
#   scripts/deploy-server.sh --full     # rebuild all services

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DO_PULL=0
TARGET="server"

for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=1 ;;
    --full) TARGET="" ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: scripts/deploy-server.sh [--pull] [--full]" >&2
      exit 2
      ;;
  esac
done

if [[ "$DO_PULL" -eq 1 ]]; then
  git pull --ff-only origin main
fi

GIT_SHA="$(git rev-parse --short HEAD)"
export GIT_SHA

echo "Deploying commit $GIT_SHA"
if [[ -n "$TARGET" ]]; then
  docker compose up -d --build "$TARGET"
else
  docker compose up -d --build
fi

docker compose ps --format json
