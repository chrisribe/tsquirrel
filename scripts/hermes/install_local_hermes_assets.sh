#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

mkdir -p "$HOME/.hermes/skills/software-development/tsquirrel_quality_gate"
mkdir -p "$HOME/.hermes/scripts"

cp "$REPO_ROOT/skills/tsquirrel_quality_gate/SKILL.md" "$HOME/.hermes/skills/software-development/tsquirrel_quality_gate/SKILL.md"
cp "$REPO_ROOT/scripts/hermes/tsquirrel-quality-gate.sh" "$HOME/.hermes/scripts/tsquirrel-quality-gate.sh"
chmod +x "$HOME/.hermes/scripts/tsquirrel-quality-gate.sh"

echo "Installed tsquirrel_quality_gate skill + cron script into ~/.hermes"
