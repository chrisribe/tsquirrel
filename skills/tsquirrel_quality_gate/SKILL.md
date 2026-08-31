---
name: tsquirrel_quality_gate
description: Run TSquirrel publish quality gating as a Hermes-native cron workflow using OpenRouter + cost ledger.
---

Use this skill for TSquirrel cron publication gates.

## Contract
Input: draft story candidates from TSquirrel API.
Output: `{pass:boolean, issues:string[]}` per story, then publish/hold decision.

## Required backend
- OpenRouter API (`/api/v1/chat/completions`) for LLM quality evaluation.
- OpenRouter cost endpoint (`/api/v1/auth/key`) for pre/post cost tracking.

## Workflow steps (fixed)
1. `scripts/quality_gate/step1_ingest.py` — trigger radar/ingest refresh.
2. `scripts/quality_gate/step2_candidates.py` — fetch draft candidates.
3. `scripts/quality_gate/step3_quality_gate.py` — run heuristics + OpenRouter gate.
4. `scripts/quality_gate/step4_publish.py` — publish pass stories; block failures.
5. `scripts/quality_gate/step5_report.py` — append cost/report ledger entry.

## Execute
```bash
cd scripts/quality_gate
python3 run_all.py
```

Dry run:
```bash
python3 run_all.py --dry-run --limit 10
```

## Deploy references (KISS)
When quality-gate or related server changes need deployment, use:
```bash
cd /opt/stacks/tsquirrel
scripts/deploy-server.sh --pull
```
Do not use ad-hoc compose teardown for routine deploys.

## Ledger
- Writes JSONL to `references/cost_ledger/quality_gate_costs.jsonl`
- Tracks `pre_daily`, `post_daily`, `delta_daily`, `published`, `blocked`

## Editorial hard gates
- Title >= 4 words
- source_count >= 2
- Non-boilerplate `squirrel_take`
- Non-boilerplate `why_it_matters`
- Topical coherence between source titles and story claim
