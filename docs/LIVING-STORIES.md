# Living Stories: Implementation Plan

Status: **plan**, branch `feat/living-stories`
Created: 2026-10-30
Mockups: POC v3 (timeline layout) and the "update" mock (Flávio Bolsonaro), described in the Discord thread *TSquirrel Site Manager Skill*.

---

## Goal

Make every story a page that keeps growing, with this layout:

**headline → lede → Why now → How we got here (dated timeline) → Ahead entries → change log**

When news breaks on an existing story, add **new timeline entries to the same URL**. Do not create a new thin story.

## Why

- **Unique format.** Most outlets cover only the latest step. Our pages show how the story developed and what comes next.
- **SEO.** We get one strong URL with real freshness signals instead of N thin URLs. Today about 830 thin stories are noindexed, see #8.
- **Return visits.** "Updated Oct 29" plus "New" tags give readers a reason to come back.
- **Cost.** About $0.0003–0.0006 per story. Only the timeline is regenerated per update, using deepseek-v4-flash with `reasoning: {enabled: false}`.

## Non-goals (v1)

- No per-outlet comparisons, no "numbers that don't match" section, no claim badges. These were rejected in POC v1 because publish timing makes them noisy.
- No separate key-numbers box. Numbers stay inline (rejected in v2).
- No user notifications or follow buttons yet.
- No admin UI beyond read-only display.

---

## What exists today (hooks we reuse)

1. **SignalService.createStoryFromSignal** (`server/services/SignalService.js:82`). It already detects continuations:
   - Guard 1: the evidence articles are already attached to a published story → `suggestSources(existingStory.id, newIds, 'signal:…')`.
   - Guard 2: a title near-duplicate within `TSQ_DUPLICATE_TOPIC_WINDOW_HOURS` (96h) → links the signal to that story.
   - **Gap:** nothing consumes `story_source_suggestions` automatically, and the 96h window misses follow-ups that arrive days or weeks later.
2. **Full-text fetch, background, and number grounding.** These are in `scripts/quality_gate/run_dig_deeper_daily.py` (`fetch_fulltext`, `fetch_background`, the numeric check in `normalize`).
3. **Deep Dive (`story_briefs`)** stays as is. The timeline is a separate, additive section.
4. **SEO noindex policy** (`server/services/SeoIndexPolicy.js`). It gets a new rule: stories with a timeline count as indexable.

---

## Data model (migration 28)

```sql
CREATE TABLE story_timeline (
  story_id      INTEGER PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  why_now       TEXT NOT NULL,
  lede          TEXT,                    -- current-state lede; NULL = use stories.summary
  update_note   TEXT,                    -- one-line "Update, Oct 29: …" box; NULL = hidden
  revision      INTEGER NOT NULL DEFAULT 1,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE story_timeline_entries (
  id            SERIAL PRIMARY KEY,
  story_id      INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  occurred_on   DATE,                    -- NULL allowed for fuzzy "Early 2027"
  occurred_label TEXT NOT NULL,          -- display: "Oct 27", "Early 2027"
  time_label    TEXT,                    -- "11:00", "morning"
  kind          VARCHAR(10) NOT NULL CHECK (kind IN ('past','ahead')),
  text          TEXT NOT NULL CHECK (length(text) <= 400),
  article_ids   INTEGER[] NOT NULL DEFAULT '{}',   -- grounding
  added_in_revision INTEGER NOT NULL DEFAULT 1,    -- drives "New" tag
  resolved_by   INTEGER REFERENCES story_timeline_entries(id), -- ahead → past
  sort_key      NUMERIC NOT NULL,        -- chronological order
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tl_entries_story ON story_timeline_entries(story_id, sort_key);

CREATE TABLE story_timeline_changes (
  id          SERIAL PRIMARY KEY,
  story_id    INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL,
  summary     TEXT NOT NULL,             -- "Added Miami arrival and statement"
  article_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Why separate tables instead of JSONB:
- The "New" tag and the resolved-ahead logic need per-entry identity.
- The change log should be append-only.

---

## API (REST, token auth, same style as `/brief`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/stories/:id/timeline` | Full timeline + entries + changes |
| PUT | `/api/v1/stories/:id/timeline` | Initial create / full replace (`expected_revision`) |
| POST | `/api/v1/stories/:id/timeline/updates` | Append-only update: `{expected_revision, lede?, why_now?, update_note, entries:[…], resolve:[{ahead_id, by_entry_index}], change_summary, article_ids}` |
| GET | `/api/v1/timeline/candidates?limit=` | Stories with pending continuation evidence (see Continuation detection) |

Validation (in `StoryTimelineService`, mirroring `_normalizeBriefBackground`):
- 3–10 past entries on create, 1–4 entries per update.
- Each **past** entry must cite ≥1 `article_id` that is attached to the story. **Ahead** entries may cite 0.
- `text` ≤400 chars, `why_now` ≤800, `update_note` ≤240.
- On a stale `expected_revision`, return 409 `stale_timeline_revision`, the same pattern as briefs.
- An update bumps `stories.updated_at` **and** a new `stories.content_updated_at` column. The sitemap lastmod uses `GREATEST(published_at, content_updated_at)`. This preserves the fix from 3e3116c: bulk backfills must not touch lastmod.

---

## Continuation detection (the core decision)

**v1 rule (cheap, deterministic, runs in Python):**

1. Take candidates from `story_source_suggestions` where `status='pending'`. Guard 1 already writes these.
2. Extend Guard 2's window for *published* stories that have a timeline from 96h to 30 days (`TSQ_TIMELINE_CONTINUATION_DAYS=30`). Only those stories get the longer window.
3. For each (story, new articles) pair, make one cheap LLM call: "Is this a new development of the same story, a duplicate of what's already covered, or unrelated?" It must return `{verdict: 'new_development'|'duplicate'|'unrelated', reason}`.
   - `new_development` → accept the suggestions and run the timeline update.
   - `duplicate` → accept the suggestions as sources only; no timeline change.
   - `unrelated` → reject the suggestions.
4. Cap at 5 timeline updates per run (`TSQ_TIMELINE_UPDATE_LIMIT`).

Later (v2, not in this branch): entity overlap using the Wikipedia entity list from `fetch_background`, so a follow-up weeks later with a different headline still matches.

---

## Generator: `scripts/quality_gate/run_timeline.py`

Two modes, both supporting `--dry-run` and `--story-id`.

**create:** for published stories without a timeline, picked by priority:
- Deep Dive stories first,
- then stories with GSC impressions,
- then new stories under 14 days old.

Steps:
- Fetch full text for each source (reuse `fetch_fulltext`), and include `published_at` per source.
- Background (reuse `fetch_background`) for Politics, World and Business only.
- Prompt = the POC v2 prompt (`poc4.py`): `what_happened`, `why_now`, `timeline[]`, `whats_next[]`. Drop `key_numbers`.
- Validate:
  - number grounding per entry, against the cited sources' text;
  - dates are parseable and ascending;
  - past entries cite ≥1 article;
  - no "not yet reported" filler.
- PUT the timeline.

**update:** for each continuation candidate:
- Send the model the existing timeline (entries + ids) plus only the *new* articles' full text.
- The model returns only additions: new entries, ahead→past resolutions, a rewritten lede/why_now, `update_note` and `change_summary`. **It never rewrites existing entries.**
- Apply the same validation, then POST `/timeline/updates`.

Both modes:
- Use `reasoning: {enabled: false}`, `max_tokens 4000`, `temperature 0.1`.
- Log cost per call, and add a cost line to `step5_report`.

Cron:
- Add a `run_timeline.py --mode update` step to `run_all.py`, after step 4 (publish).
- Add `create` as a separate daily job with a cap of 10 per day.
- Budget: well under the $0.05/day alert threshold.

---

## Story page (`server/views/story-page.ejs`)

Render order when a timeline exists:

1. h1 + meta line: `Category · Compiled from N outlets · First published X · Updated Y`.
2. Update box, only if `update_note` is set **and** the last update was < 7 days ago.
3. Lede (`timeline.lede || story.summary`).
4. **Why now**.
5. **How we got here**: a timeline `<ol>` with a date column, past entries, then `ahead` entries dashed.
   - Entries with `added_in_revision == revision` and revision > 1 get the "New · date" tag and a tint.
   - The last past entry gets "Latest".
   - Resolved `ahead` entries are hidden; the past entry replaces them.
6. Existing Deep Dive section (unchanged, below).
7. "What changed in this story" (the change log, collapsed if more than 3 items).
8. Sources footer.

Design:
- The POC v3 CSS becomes `.story-timeline*` in `server/static/css/styles.css`.
- Use the site's existing fonts and palette rather than the POC's Newsreader/cream, to avoid the impeccable "overused font" / "cream palette" flags.
- Mobile-first: a single column, and the date column shrinks to 62px under 600px.
- Must pass `impeccable detect` with 0 contrast findings.

Structured data:
- Add `dateModified` = `content_updated_at` to the existing NewsArticle JSON-LD.
- Optional: render timeline entries as `LiveBlogPosting` (deferred; check whether Google rewards it for non-live coverage).

---

## SEO policy change

`SeoIndexPolicy.isStoryIndexable`: add **`hasTimeline` → indexable**. A story with a timeline is unique content by definition, so the noindex list shrinks as timelines are generated.

---

## Build order (small PR-sized steps on this branch)

1. Migration 28, plus the `content_updated_at` column and sitemap lastmod change. Test: migration idempotent; sitemap test updated.
2. `StoryTimelineService` + DAO + validation. Unit tests: entry limits, grounding ids, stale revision, the append-only rule, ahead→past resolution.
3. API routes + controller. Tests: auth, 404, 409, happy path.
4. Story page rendering + CSS. Tests: EJS render snapshot for create, an update with New tags, and resolved-ahead hidden. Then the impeccable detector and screenshots at 1280px and 390px.
5. `run_timeline.py --mode create --dry-run` on the 3 POC stories (1325, 1243, 1326), checking for parity with POC v2.
6. Continuation detection + `--mode update --dry-run`. Replay the Bolsonaro case: feed in articles from Oct 28–29 and confirm the output matches the update mock.
7. SeoIndexPolicy `hasTimeline` rule + test.
8. Cron wiring (disabled by default: `TSQ_TIMELINE_ENABLED=0`).

**Ship gates (need DaCRibe approval):**
- Deploy (the migration runs automatically).
- Enable `create` for 10 stories and review them on prod.
- Enable `update` mode.

## Risks

- **Wrong continuation match.** This would attach unrelated news to a story. Mitigations: the LLM verdict plus same-category and entity-overlap requirements; every update logged in the change log; a revert endpoint that drops the last revision (a nice-to-have; v1 can do it manually through the API).
- **Hallucinated dates.** Dates must come from the source text or the source's `published_at`. Entries with an unparseable or future date are dropped, unless `kind=ahead` with a stated source.
- **Paywalled sources.** Fall back to descriptions. Skip creating a timeline if total full text is under 1,500 characters.
- **Old stories with no follow-ups.** The timeline is still useful (Why now plus history). No update box is shown.
- **Cost creep.** Hard caps per run; costs reported in step5.

## Open questions for DaCRibe

1. Should a timeline **replace** the Deep Dive for new stories, or sit above it? The plan assumes it sits above, and the Deep Dive stays.
2. Should the update box show for 7 days? Is that the right decay?
3. Backfill: timelines for all ~413 indexed stories (about $0.25 one-time), or only Deep Dive and GSC stories first?
