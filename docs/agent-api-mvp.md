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

### Optional "Dig deeper" research workflow

An authenticated contributor can attach additional research and submit a cited
brief for editorial review. The contributor may be a person, script, or agent.
These endpoints never publish the brief:

- `GET /api/v1/research-requests?limit=30&offset=0` lists published stories with
  outstanding reader requests and no published brief. Defaults to
  `status=needs_research`; use `status=awaiting_review` or `status=all` to include
  submitted drafts. Returns `requests[]`, `limit`, `offset`, `status`, and
  `has_more`. Items include story metadata, `request_count`,
  `recent_request_count` (last seven days), `last_requested_at`, `source_count`,
  `brief_status`, `brief_revision`, `brief_submitted_at`, `research_status`, and
  links to research context and the editor.
  Recent interest ranks first; repeat clicks do not raise counts or priority.
  These are browser-session signals, not verified unique readers. Use evidence
  quality and existing draft status when selecting work; nothing is auto-assigned.
- `GET /api/v1/stories/:idOrSlug/research-context` bundles the current story and
  brief, attached source links, pending suggestions, a research checklist, a
  revision-aware submission example, and relative next-step links. Start here
  with the numeric ID or final slug from a public story URL. This is stored
  editorial context, not a fact-check or live web search.
- `POST /api/v1/stories/:id/research-sources` registers and attaches a source using
  `title`, `url`, `publisher_name`, and optional `published_at`.
- `GET /api/v1/stories/:id/brief` returns the current draft or published brief and
  its `revision`; it returns `brief: null` when none exists.
- `PUT /api/v1/stories/:id/brief` replaces the complete brief as a draft. Send
  `expected_revision`, `introduction`, and cited `facts[]`. A stale revision returns
  HTTP `409`. Optional `proposed_summary`, `expected_summary`, and `editor_note`
  provide a private editorial handoff without changing live copy. The proposal
  must echo the exact current summary in `expected_summary`; a changed summary
  returns `409 stale_story_summary`. See the brief specification for limits.
  The response includes the saved brief and `research_status: "awaiting_review"`.

Only the session-authenticated admin workflow can publish or withdraw a brief.
Approving a brief clears its outstanding reader requests. Editing or withdrawing
it permits new requests without restoring the old counts.
Saving a draft moves existing requests to `awaiting_review`; additional reader
clicks do not make that draft need research again. **Return for more research**
reopens the request while preserving the draft and note.
Summary proposals require an explicit admin apply/keep decision. Applying checks
the summary has not changed since submission and updates it atomically with brief
publication; API submission alone never applies a proposal.
See `FREE-STORY-BRIEF.md` for the request shape and review lifecycle.
That document also describes the opt-in local HTTP workflow test, which creates
its token and content via the running app rather than inserting fixtures with SQL.
For routine use, reuse a configured token, start by checking the latest event
status, and inspect the PUT response rather than adding `/me`, context, or queue
rereads after every write.

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
