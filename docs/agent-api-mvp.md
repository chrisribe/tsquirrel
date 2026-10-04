# TSquirrel Agent API MVP (Pre-Launch)

## Why this exists
The goal is to make structured access more valuable than scraping HTML:
- lower extraction friction for legitimate agents
- meter usage per API token
- create upgrade pressure through quotas, not by breaking human UX

## Endpoints
All endpoints use `Authorization: Bearer <tsq_token>`.

### `GET /api/v1/signals`
Structured signal feed for bots/agents.

Query params:
- `status` (default `active`; supports `active`, `all`, or exact status)
- `limit` (default `50`, max `200`)

Returns:
- `signals[]` with `topic`, `strength`, `evidence`, timing
- linked `story` object when a signal maps to a story (`title`, `summary`, `why_it_matters`, `tags`, `source_count`)

### `GET /api/v1/changes?since=<ISO8601>`
Incremental delta feed for polling agents.

Query params:
- `since` (required ISO datetime)
- `limit` (default `100`, max `500`)

Returns mixed change events ordered by newest first:
- `kind: story`
- `kind: signal`

Plus:
- `next_since` cursor for next poll

## Quota + metering
Token auth now supports:
- plan metadata (`api_tokens.plan`)
- optional monthly quota (`api_tokens.monthly_quota`)
- active toggle (`api_tokens.is_active`)
- daily usage ledger (`api_token_usage_daily`)

Quota headers when quota is configured:
- `X-TSQ-Quota-Limit`
- `X-TSQ-Quota-Used`
- `X-TSQ-Quota-Remaining`

When quota is exceeded:
- HTTP `429`
- body: `{ "error": "monthly_quota_exceeded", ... }`

## Pre-launch growth uses (before charging)
Use the API directly for acquisition and quality loops:

1) **Agent-facing demos**
- publish a short quickstart showing `signals` + `changes`
- convert curious bot builders into waitlist/API users

2) **Outbound discovery**
- monitor top signal clusters and auto-generate outreach lists
- find newsletters/communities discussing those topics early

3) **Content improvement loop**
- run an internal agent that watches `/changes`
- flags weak summaries/tags and proposes edits before publish

4) **Partner pilots**
- give selected users quota-capped keys
- measure retained daily calls and top endpoint usage

## Suggested commercial tiers (initial)
- **Free**: delayed or low quota, non-SLA
- **Pro**: fresh feed + higher quota
- **Scale**: highest quota + webhook roadmap + support

Start with quota + telemetry first; pricing can follow once usage patterns stabilize.
