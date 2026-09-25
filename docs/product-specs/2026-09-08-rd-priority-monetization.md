# Deferred idea — R&D Priority Monetization

Date: 2026-09-08  
Owner: TSquirrel  
Status: Deferred reference only — not an active implementation plan

## Read this first

The [Extra Context KISS plan](2026-09-08-extra-context-mvp-plan.md) is the **only active
implementation plan**. This document preserves future monetization ideas so they do
not need to be rediscovered; it does not add work to the current release.

All phases, schemas, endpoints, and references to "v1" below describe a possible
future paid product, not the Extra Context MVP. Revisit only after real usage supports
the need. No commitment to a worker architecture, provider, price, or SLA is implied.

## 1) Decision Summary

Potential future **2-lane publishing model**:

- **Lane A (free authority lane):** keep live publication of short-form stories as the default growth engine (through existing publish gates; not raw radar auto-publish).
- **Lane B (paid speed+depth lane):** add paid, on-demand **Priority Deep R&D Briefs** per story (or topic), delivered asynchronously with status + alerts.

This keeps discovery open (SEO/authority) while monetizing urgency and analytical depth.

**Product direction:** PR #4 was the initial exploration; PR #5 is the preferred
long-term direction. Implement the small admin-only pilot first, not PR #4's public
generator. This is a product/design change, not authorization to introduce
unrestricted reader-triggered model calls.

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

- Button A: `Request Deep Dive` (standard queue; price and delivery target shown before submission)
- Button B: `Priority Deep Dive` (paid, faster SLA)
- Inputs:
  - email (required)
  - focus area (optional chips: market, policy, technical risk, competitors)
  - urgency (standard / priority)

## 5.2 Request lifecycle

Generation/request lifecycle:

`requested -> queued -> generating -> completed`

- `requested` waits for verified reader identity and any required payment.
- Only eligible requests enter the queue. Priority is assigned by the server after
  verified payment, never by trusting a submitted urgency or payment-status field.
- An eligible request matching an existing usable brief can go directly to `completed`.
- Generation or quality-check failure transitions to `failed`; a bounded, authorized
  retry returns it to `queued` without another charge for the same purchased service.
- A brief is completed only after its evidence and quality checks pass.

Notification delivery is separate: `pending -> sending -> delivered|failed`.
Here `delivered` means accepted by the email provider, not proof the reader opened it.
Retrying notification delivery must not regenerate the brief or charge again.

User surfaces:
- on-page request success + opaque tracking id (an identifier, not an access credential)
- owner-only status page (`/r-and-d/:request_id`)
- email notification when completed

## 5.3 Deliverable format

Deep brief should include:
1. Strategic read (what changed, why now)
2. Evidence table (source-backed claims)
3. Scenario map (base/upside/downside)
4. Risks / unknowns
5. Confidence tags (confirmed / likely / speculative)

Translation is optional add-on, appended after core brief.

## 5.4 Shared unlock when brief already exists

If a matching brief is completed, current, and explicitly approved for shared access,
later visitors should see:
- `Get it right now` (instant access path), instead of creating duplicate queue work
- purchase/access options based on entitlement:
  - already entitled users: instant open
  - non-entitled users: one-off checkout/unlock; plan entitlements are deferred

Rules:
- no duplicate generation for the same canonical brief scope unless stale/revision-needed
- private or embargoed output is not a shared-unlock candidate; completion alone
  grants neither public release nor permission to resell access
- entitlement is checked server-side before returning the full brief, including
  status responses, downloads, and notification links
- buying an existing brief grants access to that version, not another generation job
- preserve free authority lane: core story remains public
- premium value is speed/depth packaging, not headline gating

Launch decision required: whether standard readers receive delayed free access to
an existing shared brief or must buy an unlock. Do not silently remove the standard
path when a brief becomes available. Show the chosen price/wait policy consistently.

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

Separate reusable output from reader requests and access grants. These are logical
records; final SQL and indexes belong to implementation review.

New table: `rd_briefs`
- `id`
- exactly one subject: `story_id` or a persisted canonical `topic_key`
- normalized `focus_tags`, `language`, and `scope_key`
- `revision`, source/evidence snapshot, freshness deadline or invalidation reason
- `status` (`queued|generating|completed|failed`)
- `brief_markdown`, validated evidence/confidence data, model and generation timestamps
- `sharing_policy` (`private|shareable|public`), with release approval recorded separately
- job lease/attempt metadata for bounded worker retries

Canonical shared scope is subject + normalized focus + language. Reuse requires the
same scope, compatible sharing policy, a current revision, and successful quality
checks. A story-only match is insufficient. Use a database uniqueness/locking rule
to prevent simultaneous active shared jobs for the same scope/revision. Private
artifacts remain request-scoped and cannot be reused across readers.

New table: `rd_requests`
- `id`
- `brief_id` (nullable until matched/assigned)
- requested subject/scope, using the same story-or-topic constraint as `rd_briefs`
- verified reader identity reference and delivery email
- `urgency` (`standard|priority`)
- `status` (`requested|queued|generating|completed|failed`)
- reader-safe error code (detailed provider errors remain internal)
- `payment_status` (`not_required|pending|paid|failed|refunded`)
- `notification_status` (`pending|sending|delivered|failed`), attempts and `delivered_at`
- `created_at`, `updated_at`, `completed_at`

New table: `rd_entitlements`
- verified reader identity + brief version (unique pair)
- grant reason (`standard|purchase|admin`), originating request/payment reference
- grant/revocation timestamps; duplicate checkout events cannot duplicate a grant

Persist payment references and processed webhook event IDs for replay safety.
Record request, payment, access, and release transitions in an audit timeline without
raw access tokens or unnecessary personal data.

## 8.2 API endpoints and authorization

Keep existing `/api/v1` API-token authentication intact; do not expose staff tokens
to browsers or remove router-wide authentication to add reader endpoints.

Reader surface (separate router, verified reader session/access required):
- `POST /r-and-d/requests` create request, or request access to an existing shared brief
- `GET /r-and-d/:request_id` owner-only status; full output additionally requires entitlement
- `POST /r-and-d/requests/:id/checkout` owner-only, server-priced checkout creation

Use verified email access links to establish reader identity without requiring a
subscription/account system. Links must be random, expiring, single-use, stored
hashed, and exchanged for a secure session. Email text and request IDs are not proof
of ownership. Do not return another reader's email, private output, or internal errors.
Protect cookie-authenticated mutations against CSRF and rate-limit verification,
creation, and checkout; request submission must be idempotent per reader.

Staff API surface (existing token authentication plus explicit staff authorization):
- `GET /api/v1/rd-requests/:id` operational status/details
- `POST /api/v1/rd-requests/:id/retry` bounded manual retry
- `POST /api/v1/rd-briefs/:id/publish` optional reviewed public release of a redacted artifact (Phase 3)

Provider webhook surface uses verified provider signatures, not reader sessions.

## 8.3 Background processing

Reuse Hermes-native cron pattern:
1. match eligible requests to a current, permitted brief or atomically create/claim a job
2. generate with a bounded deadline and source-grounded template outside the web request
3. validate evidence and output; persist the version and complete linked eligible requests
4. grant the applicable entitlements and enqueue notification delivery
5. send alerts independently (email first; optional Discord DM later)

Use leases with ownership/fencing checks so expired workers cannot overwrite a newer
attempt. Cap retries, concurrency, and daily model spend; prioritize paid work without
starving standard requests. A worker restart must recover jobs without duplicate
active generation. Provider calls may have incurred cost before a timeout: record
attempts and budget for that uncertainty rather than promising exactly-once inference.

## 8.4 Payments

v1 abstraction:
- payment provider adapter interface
- start with “payment_status” state handling and webhook-ready transitions
- no provider lock-in in core request logic

Required invariants before enabling paid checkout:
- Compute price, currency, and purchasable scope/version on the server; persist the
  order and provider references before fulfillment.
- Verify webhook signatures and bind paid amount/currency/order to the expected
  purchase. A browser success redirect is not proof of payment.
- Apply payment events idempotently and tolerate duplicates/out-of-order delivery;
  persist each event ID and fulfillment transition transactionally.
- Only verified paid priority requests receive paid queue priority. Instant unlock
  grants an entitlement and never starts a duplicate job.
- Define cancellation, terminal generation failure, refund, and entitlement-revocation
  behavior before launch. Record refunds separately; never erase the payment audit.
- Show when the delivery target begins (identity verified + payment confirmed), and
  disclose the missed-target/refund policy before charging. The example <2h target
  is not a promise until capacity is validated.

## 8.5 Safety / quality

- Require >=2 credible sources for generated brief sections that claim facts.
- Explicitly label unsupported sections as uncertain.
- Never fabricate numerical claims.
- Keep current StoryService editorial gates unchanged for public story publishing.
- Validate claim-to-source references against the stored evidence snapshot; a prompt
  instruction alone is not enforcement. Reject insufficient evidence and preserve
  the existing usable revision on failed regeneration.
- Generated private output does not overwrite the public story. Shared/public release
  requires explicit review and source/license permission; no automatic release in v1.

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

First ship the admin-only pilot described above. The following phases are the later
reader-facing expansion, not prerequisites for that pilot. Membership and monetization
should follow evidence of useful output and manageable operating cost.

- Phase 0 (this spec): align direction + settle launch policy questions below.
- Phase 1: protected standard-request pilot, schema + reader verification + basic API + admin queue + bounded worker + notifications (no paid checkout or paid-SLA claims).
- Phase 2: priority payment + shared unlock + verified webhooks + entitlement enforcement + SLA dashboards, after access/pricing/refund policies are approved.
- Phase 3: optional embargo-to-public release controls.

### Acceptance gates

- Unverified readers cannot trigger model work; other readers cannot inspect a request
  or retrieve its private/paid output by guessing an ID or following an expired link.
- Repeated submission and concurrent workers create at most one active shared job per
  canonical scope/revision. An entitled reader opens a reusable brief without generation.
- Forged checkout success, mismatched amounts, and duplicate/reordered webhooks cannot
  grant unpaid access, duplicate fulfillment, or downgrade a settled payment.
- Generation timeouts, insufficient evidence, and worker restarts have bounded,
  auditable recovery; notification retries neither regenerate nor recharge.
- Free story access remains unchanged. Private/embargoed briefs cannot enter shared
  unlock or public release merely because generation completed.
- Standard-access policy, priority target, terminal-failure/refund handling, provider,
  and privacy/retention policy are approved before the corresponding public launch.

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

## 11.6 PR #4 relationship and sequencing

PR #5 is the preferred long-term direction; PR #4 is earlier exploration, not a
committed second implementation. Its free, cited Story Brief ideas may inform the
authority lane, but its synchronous public generator is not a prerequisite. Do not
import its direct writes to published story content or anonymous, unrestricted
generation path. No PR #4 runtime changes are included or approved by this specification.

## 12) Open Questions

1. Should standard deep-dive be fully free at launch or soft-paid from day one?
2. What SLA target is realistic for priority requests under current model budget?
3. Should completed premium briefs auto-publish in redacted form after N days by default, or opt-in only?
4. Which payment provider should be first adapter?
5. When a shared brief already exists, can standard readers wait for free access, or
  must they purchase an unlock? What happens to already accepted standard requests?
6. What terminal-failure, missed-target, cancellation, and refund policy will be shown
  before payment, including whether refunded access is revoked?
7. What email/request retention period, deletion process, and notification consent
  wording apply? Completion alerts must not silently subscribe readers to marketing.

## 13) Revisit criteria

Return to this proposal only after the Extra Context MVP demonstrates useful output,
manageable editorial cost, and evidence of demand for paid depth or faster delivery.
Until then, keep the public reading experience free and implement only the linked
Extra Context plan. Do not add subscription or research-worker infrastructure in advance.
