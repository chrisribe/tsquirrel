# Free Story Brief

Status: **product and implementation plan**

## Summary

The Free Story Brief turns TSquirrel's source aggregation into visible reader value.
Instead of showing a summary followed by a list of links, each eligible story explains
what the combined reporting establishes, where uncertainty remains, and what readers
should watch next. Material claims link directly to their supporting sources.

The reader promise is:

> Understand the story without opening six tabs, and see the receipts.

This is the free trust layer of TSquirrel. It is not a premium research report.
Premium work may later add primary-document research, historical context, scenarios,
role-specific implications, and continuous monitoring.

## Problem

TSquirrel already clusters related reporting and displays source count, summaries,
editorial takes, and source links. The public story page does not yet expose much of
the value created by reading those sources together:

- A source count indicates convergence but not what the sources establish.
- A summary does not distinguish confirmed facts from inference or uncertainty.
- Readers cannot tell which source supports a particular claim.
- Conflicting claims and missing confirmation are not surfaced.
- The page provides little forward tension explaining what may happen next.

This makes the product feel closer to an AI summary feed than an evidence-backed
editorial digest.

## Goals

1. Make multi-source synthesis the clearest reason to use TSquirrel.
2. Let readers verify material facts without searching through every linked article.
3. Communicate uncertainty honestly instead of presenting all summaries as settled.
4. Give each story a forward-looking reason to revisit it.
5. Establish an evidence model that can later support timelines, updates, alerts, and
   premium deep dives.
6. Preserve fast, readable mobile pages and the existing human review requirement.

## Non-goals

- Full premium research reports
- Personalized implications or recommendations
- Automated truth scores
- Full-text article scraping
- User subscriptions or alerts
- Evolving-story timelines
- Translation
- Automatically publishing LLM output

These may build on the brief later, but they are not required to prove its value.

## Eligibility and fallback

The brief is intended for every published story with at least two independent source
articles.

- **Two or more sources with a completed brief:** render the full Story Brief.
- **Two or more sources without a completed brief:** keep the current story page
  during rollout and flag the missing brief in admin.
- **One source:** keep the existing summary, take, and source presentation. Do not
  imply multi-source verification.

Source independence is initially approximated by distinct `source_id` values. A later
iteration may account for syndicated reporting where several outlets repeat the same
wire story.

## Reader-facing contract

### What we know

Two to five concise factual claims that add useful detail beyond the headline. Every
claim must cite at least one article attached to the story.

Good claims are:

- specific and independently understandable;
- attributable when they depend on a statement or allegation;
- limited to what the cited material supports;
- free of editorial opinion.

### Still unclear

An optional short explanation of an unresolved fact, conflicting account, important
qualification, or evidence gap. Omit the section when there is no meaningful
uncertainty rather than filling it with generic language.

### What to watch

One concrete next event, decision, deadline, announcement, investigation step, or
unanswered question. This provides forward tension and creates a natural foundation
for later story updates.

### Confidence

One editorial label applies to the brief as a whole:

| Label | Meaning |
|---|---|
| `confirmed` | Core facts are supported by multiple credible or primary sources, with no material contradiction. |
| `developing` | Core reporting is credible, but important details may change or remain incomplete. |
| `disputed` | Material claims conflict, are denied, or lack independent confirmation. |

Confidence describes the state of available reporting. It is not a numerical truth
score and must not be inferred from source count alone.

### Why it is trending

This line is derived from TSquirrel data rather than manually authored. It should
describe source convergence and timing in plain language, for example:

> Three sources reported new developments within two hours.

Avoid claims such as "independent confirmation" unless the system can establish
source independence.

## Public presentation

The brief appears on `story-page.ejs` after the existing summary and before the full
source list.

```text
THE 30-SECOND BRIEF                         Developing

What we know

1. Germany attributed the attack to Russian-backed agents. [1] [2]
2. The drone carried explosives and targeted Ukrainian aircraft. [1] [3]

Still unclear

Russia's direct operational role has not been independently established.

What to watch

Whether German prosecutors name suspects or announce charges.

Why it is trending

Three sources reported developments within two hours.
```

Citation markers link to stable anchors on the corresponding source rows. Source
rows should display the same citation number used in the brief. The complete source
list remains visible so readers can inspect all attached reporting.

The component must:

- remain readable without JavaScript;
- use semantic headings and ordered lists;
- distinguish confidence by text, not color alone;
- avoid hiding evidence behind a collapsed control;
- preserve the existing fast mobile layout.

## Data model

Briefs use relational citation records instead of embedding article IDs in JSON.
Foreign keys prevent invisible stale citations when articles or stories are removed.

```sql
CREATE TABLE story_briefs (
  story_id       INTEGER PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  confidence     VARCHAR(20) NOT NULL,
  uncertainty    TEXT,
  what_to_watch  TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (confidence IN ('confirmed', 'developing', 'disputed'))
);

CREATE TABLE story_brief_facts (
  id          SERIAL PRIMARY KEY,
  story_id    INTEGER NOT NULL REFERENCES story_briefs(story_id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  text        TEXT NOT NULL,
  UNIQUE (story_id, position)
);

CREATE TABLE story_brief_fact_sources (
  fact_id     INTEGER NOT NULL REFERENCES story_brief_facts(id) ON DELETE CASCADE,
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
  PRIMARY KEY (fact_id, article_id)
);

CREATE INDEX idx_story_brief_facts_story
  ON story_brief_facts(story_id, position);

CREATE INDEX idx_story_brief_fact_sources_article
  ON story_brief_fact_sources(article_id);
```

`ON DELETE RESTRICT` protects cited evidence. Normal article retention already keeps
articles linked through `story_articles`; the brief adds an additional safeguard.

## Domain operations

`NewsDAO` should provide:

- `getStoryBrief(storyId)`
- `replaceStoryBrief(storyId, brief, client?)`
- `deleteStoryBrief(storyId, client?)`
- `getStoriesMissingBrief(options)`

`StoryService` owns validation and exposes:

- `getBrief(storyId)`
- `replaceBrief(storyId, brief)`
- `deleteBrief(storyId)`
- brief-related publish blockers

Replacing a brief is atomic:

1. Begin a transaction.
2. Lock or verify the target story.
3. Validate every cited article is attached through `story_articles`.
4. Upsert `story_briefs`.
5. Replace facts and citation rows in submitted order.
6. Commit.

No partial brief should survive a failed update.

Expected service input:

```json
{
  "confidence": "developing",
  "uncertainty": "Russia's direct operational role remains unconfirmed.",
  "what_to_watch": "Whether German prosecutors announce charges.",
  "facts": [
    {
      "text": "Germany attributed the attack to Russian-backed agents.",
      "article_ids": [101, 104]
    }
  ]
}
```

## Validation rules

For a complete brief:

- Confidence is one of the three allowed values.
- There are between two and five facts.
- Every fact contains meaningful text.
- Every fact cites at least one attached article.
- Citation article IDs are unique within each fact.
- `what_to_watch` is present and specific.
- `uncertainty` is optional.
- Duplicate normalized fact text is rejected.

Removing a source from a story must fail with a clear message if the article is cited
by a brief. The editor must first remove or replace those citations. Silent citation
deletion is not acceptable.

## Admin authoring experience

Add a **Story Brief** fieldset to the existing story editor:

- confidence selector;
- two initial fact rows;
- add, remove, and reorder fact controls;
- fact text input;
- citation checkboxes listing attached source titles;
- optional "Still unclear" textarea;
- required "What to watch" textarea;
- public-style preview;
- completion status and validation messages.

Citation controls should show source name and headline, not only an article ID.
Attaching or accepting a source should make it immediately available to the brief
editor. Detaching a cited source should explain which facts currently use it.

The existing `why_it_matters` field must also be added to the admin form. It already
exists in the schema, API, validation, and public view but is not currently editable
in `story-edit.ejs`.

## Publishing policy

The rollout uses warning mode before enforcement:

### Warning mode

- Existing published stories remain valid.
- Multi-source drafts without a complete brief show an admin warning.
- The story can still be published while editors establish the workflow.

### Enforcement mode

After backfilling representative stories and validating the workflow, newly created
multi-source stories require a complete brief before publication.

Publish blockers should identify exact fields and facts, for example:

- `brief_required`
- `brief_confidence_required`
- `brief_too_few_facts`
- `brief_fact_uncited`
- `brief_citation_not_attached`
- `brief_what_to_watch_required`

Single-source stories are not blocked by brief rules.

## Assisted generation

Manual authoring ships first and defines the canonical contract. Assisted generation
is a later editor tool, not a separate publishing path.

The existing OpenAI-compatible client can propose:

- factual claims;
- article IDs supporting each claim;
- uncertainty;
- what to watch;
- a confidence label.

Generation rules:

1. Only attached article IDs may be returned.
2. Unknown IDs cause rejection, not silent removal.
3. Uncited facts cause rejection.
4. Generated text remains an editable draft.
5. Human review is required before publication.
6. The model must distinguish source statements from established facts.

Because TSquirrel currently stores feed titles and descriptions rather than
authoritative full article text, generation must not claim evidence beyond those
inputs. An external browsing agent may provide richer proposals later through the
same API.

## API

Add token-authenticated endpoints:

```http
GET /api/v1/stories/:id/brief
PUT /api/v1/stories/:id/brief
DELETE /api/v1/stories/:id/brief
```

`PUT` replaces the complete brief and returns the normalized stored representation.
It must use the existing API idempotency behavior and return structured validation
errors. The API and admin UI call the same `StoryService` operations.

Example response:

```json
{
  "ok": true,
  "brief": {
    "story_id": 368,
    "confidence": "developing",
    "uncertainty": "Russia's direct operational role remains unconfirmed.",
    "what_to_watch": "Whether German prosecutors announce charges.",
    "facts": [
      {
        "id": 22,
        "position": 1,
        "text": "Germany attributed the attack to Russian-backed agents.",
        "article_ids": [101, 104]
      }
    ]
  }
}
```

## Analytics and success measures

Track enough behavior to determine whether the brief adds reader value:

- `story_brief_view`
- `story_brief_citation_open`
- `story_brief_source_open`
- `story_brief_keep_digging_open`

Initial evaluation should compare stories with and without briefs on:

- story-page engagement;
- citation and source click-through;
- related-story click-through;
- return visits where available;
- editorial time required per completed brief.

The feature is promising if readers interact with evidence and continue reading
without creating an unsustainable editorial burden. Raw time-on-page alone is not a
sufficient success measure.

## Delivery plan

### Phase 1: Schema and domain

- Add the three brief tables in the next migration.
- Add DAO reads and transactional replacement.
- Add service validation.
- Add tests for transactions, attached-source validation, and delete protection.

### Phase 2: Manual admin workflow

- Add Story Brief fields to the story editor.
- Add citation selection and validation feedback.
- Add the missing `why_it_matters` editor field.
- Add a public-style preview.
- Show missing/incomplete brief status in the story list.

### Phase 3: Public component

- Load the brief with the public story route.
- Render the 30-second brief before the source list.
- Add numbered citation anchors to source rows.
- Add derived "Why it is trending" copy.
- Add analytics events.

### Phase 4: Editorial rollout

- Enable warning mode.
- Backfill 15 to 20 strong multi-source stories.
- Review output quality, reader behavior, and authoring time.
- Refine wording and validation rules.
- Enable publish blockers for new multi-source stories.

### Phase 5: Assisted generation and API

- Add brief API endpoints.
- Add an editor-only generation action.
- Validate all generated citations.
- Keep human publication approval mandatory.

## Acceptance criteria

1. An editor can create, update, reorder, and delete brief facts.
2. Every stored fact has at least one citation to an article attached to its story.
3. Invalid or stale article IDs cannot be saved as citations.
4. Brief replacement is transactional.
5. A cited source cannot be detached without resolving its citations.
6. Eligible public stories render facts, confidence, uncertainty when present, what
   to watch, and numbered source links.
7. Pages remain useful without JavaScript and on mobile widths.
8. Stories without briefs continue to render the existing page safely during rollout.
9. The API and admin UI share the same validation and persistence path.
10. Generated proposals cannot bypass human review or publishing safeguards.

## Future extensions

The evidence model intentionally enables later features without including them in
the first release:

- evolving-story timelines and "what changed" summaries;
- follow-story and follow-topic alerts;
- claim-level correction history;
- source diversity and syndication detection;
- brief version history;
- premium deep dives derived from a public brief;
- translated renditions sharing the same citations.

The next product decision after launch should be based on observed use: whether users
primarily value fast comprehension, evidence verification, or following changes over
time.
