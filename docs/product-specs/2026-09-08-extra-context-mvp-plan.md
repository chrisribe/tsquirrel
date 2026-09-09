# Extra Context — KISS Implementation Plan

Date: 2026-09-08
Status: WIP checkpoint — scope frozen 2026-09-09; not ready to merge or deploy

## Checkpoint / resume here

- Implementation exists for storage, limited research tokens, draft API, admin actions,
  and public rendering. No additional features until the current diff is reviewed.
- Verified: three validation/rendering tests, JavaScript syntax checks, local database
  migrations, API draft submission/readback, and research-token listing denial.
- Not verified: admin approval end-to-end, concurrent first saves, stale approvals,
  full authorization/CSRF/error handling, and mobile rendering.
- Review gaps before merge: shared admin/public preview, source-row editing controls,
  changed-story warning, date/URL validation, CSRF byte-length handling and session
  scope, and the global request-size change. These are checks against existing scope,
  not new feature requests.
- Migration 22 skips versions 20/21 from the unmerged alternative PR; confirm migration
  compatibility before merging. Do not merge the alternative runtime implementation.
- Local demo content on stories 11 and 19 is placeholder prose, not researched reporting.
  It was published directly through SQL; that does not validate the approval workflow.
  A predictable local-only research token was created for testing; revoke it after demo.
- Local database/container state is not captured by Git. No production deployment was made.
- Next session: review and verify storage/API, then admin approval, then public rendering.
  Do not broaden scope to workers, payments, or automated research.

This is the single source of truth for the current feature. The
[monetization proposal](2026-09-08-rd-priority-monetization.md) is deferred reference
only, not additional MVP scope.

## 1. The entire workflow

**You choose a published TSquirrel story -> ask Hermes to research it -> Hermes saves
a draft through the API -> you preview and publish it in admin.**

Readers see the addition below the existing story and sources, before related stories.
The original article, URL, and publishing rules stay unchanged. Public reading is free.

Hermes runs only when you ask it; the site does not start, schedule, or monitor research.

**Not included:** request buttons, automatic selection, queues, workers, leases,
heartbeats, research cooldowns, member signup, payments, email, or model/browser hosting.
Research costs and Camofox startup remain with your existing Hermes setup.

## 2. What gets published

One optional **A little deeper** section per story, using the
[tech](../story.html#deep-dive) and [travel](../story-travel.html#deep-dive) previews as
layout references, not as templates for mandatory research headings.

- A specific title and a few natural paragraphs, usually about 200–400 words.
- Concrete information absent from the article, with source references.
- A source list, research date, publication date, and honest AI-assistance disclosure.
- No filler, automatic confidence scores, or forced scenarios/risks sections.
- If research adds nothing useful, Hermes reports that to you and submits nothing.

For v1, store plain text, blank-line-separated paragraphs, and citation markers such
as `[S1]`. No Markdown, raw HTML, rich-text editor, or automatic URL extraction.
Render text escaped and convert only validated citation markers into source anchors.
One authoritative source may support a factual clarification; do not imply independent
corroboration merely because there are multiple links from the same publisher.

## 3. Small data model

Add one table, `story_extra_context`, keyed by `story_id` with a cascading story FK:

- `draft_content JSONB` (nullable)
- `published_content JSONB` (nullable, independent snapshot)
- `revision INTEGER NOT NULL DEFAULT 0`
- `draft_updated_at`, `draft_author_token_id` (nullable FK, token deletion sets null)
- `published_at`, `published_by` (nullable admin-user FK)

Each content snapshot contains `title`, `body`, `sources`, `researched_on`, and
`ai_assisted`. Each source contains stable `id`, `title`, public HTTP(S) `url`,
`accessed_on`, and optional short `evidence_excerpt` for admin review only.
Sources can be newly found URLs; they need not be existing ingested articles.

Saving a draft never changes the published snapshot. Publishing copies the reviewed
draft to the published snapshot and clears the draft in one transaction. Discarding
clears only the draft; withdrawing clears only the published snapshot and its metadata.
Retain the row/revision after clearing content so old clients cannot recreate an old
revision. Do not build revision history or a generic document system in this release.

Lock the story row in each mutation transaction, compare the supplied revision, then
update the context row. Increment `revision` for every successful state change. This
also handles the first-write race when the context row does not exist yet.

## 4. API for Hermes

Keep the existing bearer-token authentication and `{ ok: true, ... }` response style.
No endpoint triggers research or publishes content on behalf of Hermes.

| Endpoint | Purpose |
| --- | --- |
| Existing `GET /api/v1/stories/:id` | Read the user-selected published story and attached sources |
| New `GET /api/v1/stories/:id/extra-context` | Read current draft, published content, and revision |
| New `PUT /api/v1/stories/:id/extra-context` | Replace the complete draft only |

For an existing story without context, GET returns revision `0` and null draft/published
content. PUT requires `expected_revision` from GET; reject a stale value with `409`.
Return the saved normalized draft, new revision, and an admin preview URL on success.
Use `400` for invalid input, `401/403` for auth failures, and `404` for missing or
inaccessible stories. Validation errors should identify fields, not expose SQL errors.

Example PUT body (based on the travel preview, not a required prose template):

```json
{
  "expected_revision": 0,
  "content": {
    "title": "The charge at your hotel isn't the one that ended",
    "body": "Venice's overnight tourist tax is separate from its day-visitor access fee. The city's FAQ limits the accommodation tax to five nights. [S1]",
    "researched_on": "2026-09-08",
    "ai_assisted": true,
    "sources": [
      {
        "id": "S1",
        "title": "Venice access-fee FAQ",
        "url": "https://cda.veneziaunica.it/en/faq",
        "accessed_on": "2026-09-08"
      }
    ]
  }
}
```

Proposed generous limits: title 160 characters, body 12,000 characters, 1–10 sources,
source title 300 characters, URL 2,048 characters, optional excerpt 1,000 characters,
and a 64 KiB request limit. Require nonblank text, valid dates, a boolean AI flag,
unique `S1`-style source IDs, at least one citation, and resolution of every citation.
Reject unexpected publication/status fields. Validate URL schemes and reject embedded
credentials/local destinations; the site never fetches submitted URLs itself.

PUT replaces one resource: repeat calls cannot create duplicate additions. On a lost
response, Hermes re-reads GET; if the draft matches its submission, the save succeeded.
Otherwise report the conflict rather than overwriting a newer edit. Do not claim the
existing idempotency middleware solves this: this branch does not mount it in the API
router and its method set excludes PUT. Transaction/revision checks are sufficient here.

### One limited token, not a permissions framework

Existing API tokens can change and publish ordinary stories. A label saying “Hermes”
does not restrict that access. Add a token purpose (`editorial` or `research_draft`),
defaulting existing tokens to `editorial` to preserve their behavior.

The research token may use **only the three routes above**, only for published stories;
all other API routes/methods are denied for it. It cannot change the original story,
publish/withdraw the addition, select stories through a listing endpoint, or bypass
admin approval. Add the purpose choice to existing admin token creation. Give Hermes
this token for the research task rather than its broader editorial credentials.
This restricts capabilities, not specific story IDs; you select the story in the prompt.

## 5. Admin review and public display

Extend the existing story editor; no new dashboard:

- Show draft and published snapshots distinctly, with research sources/excerpts.
- Edit title/body and source rows using normal form fields; preserve the AI flag.
- Preview with the same escaped rendering component used publicly.
- **Save draft**, **Publish this revision**, **Discard draft**, **Withdraw published**.
- Each mutation carries the current revision and requires admin auth and CSRF checks.
  A publish click cannot publish a newer draft that arrived after the preview loaded.

Admin actions call the same domain validation/persistence methods as the API. Publishing
requires the story still to be published. Story hide/unpublish must hide the addition
too; delete cascades. Warn reviewers when the story changed since the draft was saved;
automated source monitoring and automatic republication are out of scope.

Public reads load only `published_content`, never the draft or private evidence excerpts.
Append the section after original sources and before related stories; show a jump link
near the summary only when an addition exists. No empty state, login gate, or request
button for readers. A replacement draft leaves the previous approved addition visible.

## 6. Three implementation slices

1. **Storage + API.** Add the next available migration, DAO operations, shared
   `StoryService` methods, API controller/service routes, token-purpose restriction,
   and tests. Do not reserve migration 20 without checking other branches at merge time.
2. **Admin + public rendering.** Add ordinary form fields/actions, CSRF protection,
   shared preview/public partial, publication snapshots, and the optional story section.
3. **One real story.** Document the API contract for Hermes, create a limited token,
   and manually run read -> research -> PUT -> preview -> publish. No Hermes runner,
   cron job, or skill automation is necessary for this slice.

Use the existing DAO, `StoryService`, admin/API services and controllers rather than
adding a research engine. Current package has no test command: use Node's built-in test
runner plus a separate PostgreSQL test database for concurrency and transactional tests.

### Done when

- Valid API submission appears as a private draft without changing the story/live addition.
- Missing/revoked tokens fail; research tokens cannot mutate/publish via other API routes.
- Invalid sources, citations, URLs, oversized bodies, and publication fields are rejected.
- Simultaneous first saves, stale edits, and stale approval clicks cannot overwrite work.
- A lost-response retry is recoverable by GET without another research run.
- Only admin approval exposes content; discard/withdraw and story visibility work correctly.
- Draft text and evidence excerpts never leak to public pages; rendered text cannot run HTML/JS.
- Both short and longer additions remain readable on mobile, with working citations and no JS dependency.
- One user-selected story completes the manual Hermes-to-API-to-publication flow.

**Success measure:** does the addition tell the reader something useful they did not
get from the original article, at an acceptable research/review cost? Decide on any
further automation after several real examples, not before this slice ships.