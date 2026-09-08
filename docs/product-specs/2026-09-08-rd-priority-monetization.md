# TSquirrel Product Spec — R&D Priority Monetization (Authority-first)

Date: 2026-09-08  
Owner: TSquirrel  
Status: Draft (spec branch)

## 1) Decision Summary

Adopt a **2-lane publishing model**:

- **Lane A (free authority lane):** keep live publication of short-form stories as the default growth engine (through existing publish gates; not raw radar auto-publish).
- **Lane B (paid speed+depth lane):** add paid, on-demand **Priority Deep R&D Briefs** per story (or topic), delivered asynchronously with status + alerts.

This keeps discovery open (SEO/authority) while monetizing urgency and analytical depth.

## 2) Problem

Current TSquirrel strengths:
- fast publish velocity
- stronger editorial gating
- improving source integrity

Current gap:
- no direct monetization tied to user intent after clicking a hot story
- no SLA-backed “go deeper now” flow

Risk if we gate core content too early:
- lower crawl/discovery
- slower authority growth while traffic base is still small

## 3) Goals / Non-goals

### Goals
1. Preserve and improve site authority (free lane remains open).
2. Monetize high-intent readers via paid deep R&D requests.
3. Provide reliable delivery UX: request -> queue -> completion -> alert.
4. Keep implementation KISS (no full subscription stack in v1).

### Non-goals (v1)
- Full recurring subscription billing platform.
- Complex role/tier matrix.
- Deep workflow custom prompt builder in UI.

## 4) User Segments

1. **Reader (free):** wants quick trend summary and source-backed context.
2. **Power user / operator (paid):** wants fast, deeper implications and scenario analysis.
3. **Lead/prospect:** not ready to pay now but willing to leave email for completion alerts.

## 5) Product UX

## 5.1 Story page CTA block

Add a compact module on `/story/:slug`:

- Button A: `Request Deep Dive` (free queue, standard SLA)
- Button B: `Priority Deep Dive` (paid, faster SLA)
- Inputs:
  - email (required)
  - focus area (optional chips: market, policy, technical risk, competitors)
  - urgency (standard / priority)

## 5.2 Request lifecycle

State machine:

`requested -> queued -> generating -> completed -> delivered`

Failure path:

`generating -> failed (retryable)`

User surfaces:
- on-page request success + tracking id
- optional status page (`/r-and-d/:request_id`)
- email notification when completed

## 5.3 Deliverable format

Deep brief should include:
1. Strategic read (what changed, why now)
2. Evidence table (source-backed claims)
3. Scenario map (base/upside/downside)
4. Risks / unknowns
5. Confidence tags (confirmed / likely / speculative)

Translation is optional add-on, appended after core brief.

## 6) Monetization Model (v1)

Use **per-request pricing** first:
- Standard deep dive: free or low-cost lead capture mode (configurable)
- Priority deep dive: paid one-off with target SLA (e.g. <2h)

Why per-request first:
- lower implementation complexity than subscriptions
- clear value exchange tied to one story click
- easier to test willingness-to-pay

Future:
- convert to credit packs or tiered plans after demand signal.

## 7) Authority Strategy Fit

Authority is expected to improve when:
- free lane remains open and consistently updated
- high-performing stories receive deeper linked artifacts (internal linking opportunities)
- premium output can be partially published after embargo when policy allows

Rule:
- **Do not block basic story access for SEO visitors.**
- monetize acceleration/depth, not headlines.

## 8) Technical Scope (v1)

## 8.1 Data model additions

New table: `rd_requests`
- `id`
- `story_id` (nullable for topic-only requests)
- `email`
- `urgency` (`standard|priority`)
- `focus_tags` (text/json)
- `status` (`requested|queued|generating|completed|failed`)
- `brief_markdown` (nullable until done)
- `error_message` (nullable)
- `payment_status` (`not_required|pending|paid|failed`)
- `created_at`, `updated_at`, `completed_at`

Optional table: `rd_request_events` (for audit timeline).

## 8.2 API endpoints

- `POST /api/v1/rd-requests` create request
- `GET /api/v1/rd-requests/:id` status/details
- `POST /api/v1/rd-requests/:id/retry` admin/manual retry
- `POST /api/v1/rd-requests/:id/publish` optional public release of redacted brief

## 8.3 Background processing

Reuse Hermes-native cron pattern:
1. pick queued requests
2. generate brief with source-grounded template
3. persist output + confidence labels
4. send alert (email first; optional Discord DM later)

## 8.4 Payments

v1 abstraction:
- payment provider adapter interface
- start with “payment_status” state handling and webhook-ready transitions
- no provider lock-in in core request logic

## 8.5 Safety / quality

- Require >=2 credible sources for generated brief sections that claim facts.
- Explicitly label unsupported sections as uncertain.
- Never fabricate numerical claims.
- Keep current StoryService editorial gates unchanged for public story publishing.

## 9) Analytics & Success Metrics

Track events:
- `rd_cta_view`
- `rd_request_started`
- `rd_request_submitted`
- `rd_priority_checkout_started`
- `rd_priority_checkout_paid`
- `rd_brief_completed`
- `rd_brief_delivered`

Primary KPIs (first 30 days):
1. Request rate per 100 story views
2. Priority paid conversion rate
3. Median completion time by urgency
4. Gross margin per completed priority brief
5. Organic sessions trend on story pages (authority guardrail)

Guardrails:
- keep 404 low
- no homepage title split regression
- no material drop in crawlable free content

## 10) Rollout Plan

Phase 0 (this spec): align direction + settle conflicts.  
Phase 1: schema + basic API + admin queue view (no payment).  
Phase 2: priority payment path + webhook handling + SLA dashboards.  
Phase 3: optional embargo-to-public release controls.

## 11) Conflict Check Against Existing Work

## 11.1 `docs/architecture.md` item 18
Current item 18 direction: premium R&D, translation minor bonus, private embargo/public release.  
**Alignment:** this spec keeps that core idea.  
**Change in emphasis:** default business model becomes **per-request priority monetization** first (instead of starting with tiered subscriptions).

## 11.2 Quality gate and blocked-article workflow
No conflict. Public story editorial gates stay in place. Deep-brief generation is separate and can run post-click without weakening publish quality controls.

## 11.3 Manual + API-first publishing model
No conflict. This spec extends monetization and delivery; it does not reintroduce uncontrolled auto-curation.

## 11.4 Potential directional change
If team planned immediate recurring subscriptions, this spec intentionally defers that in favor of lower-friction one-off purchases while authority is still growing.

## 11.5 Auto-publish policy constraints (important)
Existing docs currently lock two guardrails:
- `docs/NEWS-RADAR.md`: “Don’t auto-publish from radar.”
- `docs/architecture.md` decision #2: agent-authored stories remain draft/human-reviewed.

So this spec **does not** override those policies. “Live authority lane” here means continuing normal published story flow under existing quality/review gates, while premium deep briefs are generated post-click as a separate product lane.

## 12) Open Questions

1. Should standard deep-dive be fully free at launch or soft-paid from day one?
2. What SLA target is realistic for priority requests under current model budget?
3. Should completed premium briefs auto-publish in redacted form after N days by default, or opt-in only?
4. Which payment provider should be first adapter?

## 13) Recommendation

Proceed with this spec as the current direction:
- maintain free authority lane,
- monetize urgency/depth via priority deep dives,
- add subscription complexity only after conversion signal is proven.
