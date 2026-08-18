# Hermes Quality Gate (TSquirrel)

This repo now contains the TSquirrel Hermes quality-gate assets so they are code-reviewed and recoverable.

## Included in repo

- Skill doc: `skills/tsquirrel_quality_gate/SKILL.md`
- Pipeline scripts: `scripts/quality_gate/*.py`
- Cron wrapper: `scripts/hermes/tsquirrel-quality-gate.sh`
- Installer to copy into local Hermes profile: `scripts/hermes/install_local_hermes_assets.sh`

## One-time setup on a server

From repo root:

```bash
bash scripts/hermes/install_local_hermes_assets.sh
```

## Run manually

```bash
bash scripts/hermes/tsquirrel-quality-gate.sh
```

## Cron job wiring (Hermes)

Use existing job id or create a new one.

Update existing:

```bash
hermes cron update <job_id> --name "tsquirrel-quality-gate" --schedule "0 11 * * *" --script "tsquirrel-quality-gate.sh" --no-agent true --deliver origin
```

Create new:

```bash
hermes cron create --name "tsquirrel-quality-gate" --schedule "0 11 * * *" --script "tsquirrel-quality-gate.sh" --no-agent true --deliver origin
```

## Cost ledger

Per-run OpenRouter pre/post usage and delta are appended to:

`references/cost_ledger/quality_gate_costs.jsonl`

This file is intentionally git-ignored by default; commit snapshots manually only if needed for audit.
