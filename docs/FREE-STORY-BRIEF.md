# Free Story Brief: Dig deeper

Status: **initial workflow implemented**

## Purpose

Add an optional, cited research brief to an existing TSquirrel story.
The owner chooses a story and asks Hermes to investigate the event more deeply.
Hermes researches and submits the findings; TSquirrel stores them for review and
displays them after explicit approval.

> I asked Hermes to research a story, reviewed its findings, and published useful
> additional context with receipts.

This replaces the earlier mandatory multi-source brief plan. Briefs are free to
read, but not required on every story. Stories without one remain unchanged.

## First workflow

1. The owner tells Hermes: "Dig deeper into this TSquirrel story."
2. Hermes reads the existing coverage and researches additional sources.
3. Hermes registers and attaches any new sources, then submits a draft brief.
4. The owner reviews the findings and citations in the existing admin editor.
5. The owner explicitly publishes the brief. The story gains a "Dig deeper" section.

Hermes does the research outside TSquirrel. No server-side LLM calls, background
generation, or automatic publishing are needed.

## Content

A brief contains a short introduction and an ordered list of findings. Each finding
has an optional heading, text, and at least one citation.

Findings can explain background, new facts, consequences, disagreements, or an
unresolved question. There are no mandatory sections, confidence scores, source-count
thresholds, or target number of facts. At least one substantive finding is required.
Keep claims attributable and distinguish reported facts from interpretation.

Use plain text initially, not arbitrary HTML. Keep the introduction as framing;
place substantive claims in the cited findings.

## Three small tables

Keep the proposed table names. A "fact" row represents a finding, including context
or clearly labelled analysis.

```sql
CREATE TABLE story_briefs (
  story_id     INTEGER PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  introduction TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'published')),
  revision     INTEGER NOT NULL DEFAULT 1,
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE story_brief_facts (
  id          SERIAL PRIMARY KEY,
  story_id    INTEGER NOT NULL REFERENCES story_briefs(story_id) ON DELETE CASCADE,
  position    INTEGER NOT NULL CHECK (position >= 1),
  heading     TEXT,
  text        TEXT NOT NULL,
  UNIQUE (story_id, position)
);

CREATE TABLE story_brief_fact_sources (
  fact_id     INTEGER NOT NULL REFERENCES story_brief_facts(id) ON DELETE CASCADE,
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
  PRIMARY KEY (fact_id, article_id)
);

CREATE INDEX idx_story_brief_fact_sources_article
  ON story_brief_fact_sources(article_id);
```

One brief per story; no version-history tables or separate live/draft copies.
`revision` is only an overwrite guard, not saved content history.
DAO SQL stays in `NewsDAO`; shared validation and operations stay in `StoryService`.

## API and research sources

Use the existing token-authenticated API for Hermes:

| Operation | Proposed endpoint |
|---|---|
| Read the brief, including its revision and status | `GET /api/v1/stories/:id/brief` |
| Create or replace the entire brief as a draft | `PUT /api/v1/stories/:id/brief` |
| Register and attach an external research source | `POST /api/v1/stories/:id/research-sources` |

Research sources may be official statements, filings, studies, or articles not in
the feeds. Accept URL, title, publisher name, and optional publication date. Reuse
the existing `articles`, `sources`, and `story_articles` model; return an article ID
that Hermes can cite. Reuse matching records on retry rather than duplicating them.
Registering a publisher must not automatically subscribe it to ingestion.

Only accept HTTP(S) URLs. TSquirrel stores metadata and links; it does not fetch
these pages or pretend it verified their contents. Hermes reads the originals and
the owner checks the evidence. Source attachment follows existing story behavior;
it is not a private evidence store.

Example brief submission:

```json
{
  "expected_revision": 0,
  "introduction": "The announcement leaves an important distinction between a pilot and a full rollout.",
  "facts": [
    {
      "heading": "What was actually announced",
      "text": "The company describes a limited pilot, not general availability.",
      "article_ids": [101, 104]
    }
  ]
}
```

`expected_revision: 0` means create only if absent; updates supply the revision from
GET. Return `409` on a stale revision and structured `400` errors for invalid content.
GET returns `brief: null` for an existing story without a brief and `404` for a
missing story. PUT returns the stored brief and its new revision.

Use the same operations from admin and API. Extend the existing idempotency
middleware to cover PUT; replay handling does not replace revision checks.

## Approval and integrity rules

- Every successful content edit sets the brief to `draft`, clears review metadata,
  and increments the revision. Failed edits leave the previous brief untouched.
- Only an authenticated admin can publish or withdraw a brief. Hermes cannot set
  status or review metadata; reject those fields in submissions.
- Publishing records the reviewing user and time. Approval checks the revision the
  reviewer actually saw. Withdrawing returns the brief to draft and clears approval.
- A public page shows the section only when both the story and brief are published.
  Editing a published brief temporarily removes the section, not the story.
- Normal story publication, bulk actions, and API story updates never approve a
  brief. Having no brief never blocks story publication.
- Require a nonempty introduction, at least one nonempty finding, and at least one
  attached article per finding. Reject invalid IDs and bound request/text sizes.
- Save the brief, findings, and citations atomically on one database connection.
  All brief writes, approval actions, and source detach/deduplication paths acquire
  the same story-row lock before checking or changing dependencies.
- Block removal of cited attachments with a useful error identifying the findings.
  Article foreign keys alone do not enforce attachment membership. The editor must
  first replace or remove the citations; do not silently discard them.

Newly attached sources do not automatically rewrite or invalidate the brief.
The displayed review date describes the last approved research, not a promise of
continuous monitoring. The owner can withdraw a brief if new evidence undermines it.

## Admin and public UI

Add a compact brief editor to the existing story editor: introduction, ordered
finding rows, optional headings, and citation selectors showing attached source
titles. Support saving, adding/removing/reordering findings, previewing, publishing,
and withdrawing. Preserve entered content when validation fails.

Render "Dig deeper" after the summary and before the source list:

```text
Dig deeper
Reviewed on October 4, 2026

Short introduction

What was actually announced
Finding text with supporting links. [1] [2]

Why the distinction matters
Additional context with supporting links. [2]
```

Use one numbering map for findings and source rows, with article-ID-based anchors.
Keep original source links available. Render escaped text, readable mobile layouts,
and working citations without JavaScript. No empty placeholder or upsell is needed
on stories without a published brief.

## Build order and acceptance

1. **Storage and API:** add the migration, shared operations, source registration,
   and draft submission. Verify complete round trips, retry behavior, rollback,
   stale-revision rejection, and citation membership under concurrent detachment.
2. **Review and display:** add admin editing/approval and the public section. Verify
   that Hermes cannot publish, stale approvals fail, edits hide only the brief, and
   existing stories still render unchanged without one.
3. **Small pilot:** use Hermes on a handful of selected stories. Check each finding
   against its citations, assess whether it adds information beyond the summary,
   and note the owner's review effort before expanding the workflow.

The first release is complete when the owner can request research from Hermes,
receive a cited draft, review and publish it, and see the approved findings on the
original story page.

## Later, only if needed

Defer automatic generation, mandatory coverage, confidence labels, trending
explanations, full-text storage, timelines, alerts, subscriptions, translation,
analytics dashboards, premium controls, and revision history.

If temporarily hiding a brief during edits becomes a problem, add separate approved
and draft versions then. Let actual research and review usage drive further changes.
