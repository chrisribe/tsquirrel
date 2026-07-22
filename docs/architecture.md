# TSquirrel — Architecture & Deploy Reference

Scaffolded July 2026. Repo: `~/GitRepos/tsquirrel` → `github.com/chrisribe/tsquirrel` (private).

## Why it exists
tsquirrel.com was a dead PHP news aggregator. Cloudflare shows it still gets ~17k uniques/month organically. GA confirms 162/208 page views hit "What's Trending, Squirrel News" — the homepage still ranks. The Jan 2026 concept (parked until EventGlimpse hit $500 MRR) was unblocked when this traffic signal surfaced.

## Service Map

```
FeedService (30m cron)
  └─ ingestAll(pool)
     ├─ HN API → top 30 items (parallelized in batches of 10)
     └─ RSS/Atom feeds → parsed with stdlib regex (no deps)
     → upserts into articles table (dedup by source_id + external_id)

SummaryService (1h cron)
  └─ processNewArticles(pool)
     ├─ fetch ungrouped articles (last 6h, not in story_articles)
     ├─ LLM cluster: group by topic → stories[]
     └─ LLM summarize: 2-3 sentence synthesis + tags + sentiment + squirrel_take
     → upserts into stories as status='draft'

CronService
  └─ startCron(pool) — called from server.js, skipped in NODE_ENV=test

Hermes curation skill (planned — not yet built)
  └─ Scheduled daily: scan draft stories, evaluate against curation persona
     → surfaces 5–7 "ready to publish" picks to owner via Discord
     → owner approves on phone → POST /api/admin/stories/:id/publish
```

## Ingestion Philosophy
- **Narrow sources, not firehose** — ~20–30 high-signal RSS feeds. LLM clusters into story drafts.
- **Draft → Live workflow** — SummaryService writes `status='draft'`. Homepage only shows `status='live'`.
- **Hermes as managing editor** — scheduled skill reviews drafts, sends Discord shortlist. Owner does 3-min phone approval. This replaces manual curation without causing burnout.
- **Curation persona prompt** in the Hermes skill is the product's secret sauce.

## DB Schema (migration v5+)

```sql
sources        id, name, slug, url, feed_url, type (rss|hn), active
articles       id, source_id→sources, external_id, title, url, published_at, fetched_at
               UNIQUE(source_id, external_id)
stories        id, title, slug (UNIQUE), summary, squirrel_take, category, tags[],
               sentiment, heat_score, image_url, status ('draft'|'live'|'suppressed'),
               updated_at, created_at
story_articles story_id→stories, article_id→articles  (PK both)
legacy_articles id, slug (UNIQUE), title, description, source_url, image_url, image_status, created_at
```

Heat score = source_count × 10. Top stories sorted by heat_score DESC.

## Display Layer
`server/lib/display.js` — category metadata map (emoji, thumb, CSS classes).
Maps stored category names (Technology, World, Business …) to themed labels + thumbnail styles.
Used by views — do not duplicate this logic in EJS.

## Default Sources (migration v3 seed)

| Slug | Type | Feed URL |
|---|---|---|
| hackernews | hn | (uses HN Firebase API) |
| bbc | rss | feeds.bbci.co.uk/news/rss.xml |
| reuters | rss | feeds.reuters.com/reuters/topNews |
| guardian | rss | theguardian.com/world/rss |
| arstechnica | rss | feeds.arstechnica.com/arstechnica/index |
| techcrunch | rss | techcrunch.com/feed/ |

## Routes

| Route | What |
|---|---|
| `GET /` | Homepage — top 30 `status='live'` stories, category filter bar |
| `GET /story/:slug` | Story detail — summary + squirrel_take + all source articles |
| `GET /archive` | Archive page — legacy articles |
| `GET /api/stories?offset=N&category=X` | HTMX partial — story-cards.ejs, infinite scroll |
| `GET /health` | `{ status: 'ok' }` + DB connectivity check |
| `GET /sitemap.xml` | Dynamic sitemap — all live story slugs |
| `GET /robots.txt` | Static, allows all crawlers |
| `POST /api/admin/stories/:id/publish` | Token-protected. Moves story draft→live (planned) |

## Environment Variables (.env.example)

```
DATABASE_URL=postgres://dockeruser:${DB_PASSWORD}@db:5432/appdb
DB_PASSWORD=changeme
NODE_ENV=production
PUBLIC_URL=https://tsquirrel.com
OPENAI_API_KEY=sk-...           # required for summaries
OPENAI_BASE_URL=https://api.openai.com   # override for proxy/compatible endpoint
SUMMARY_MODEL=gpt-4o-mini
INGEST_INTERVAL_MS=1800000      # 30 min
SUMMARY_INTERVAL_MS=3600000     # 1 hour
```

## Deploy Checklist (new Hetzner server)

1. SSH into **new Hetzner server** (NOT old server where EventGlimpse lives)
2. `cd /opt/stacks && git clone https://github.com/chrisribe/tsquirrel.git`
3. `cp .env.example .env` → fill `DB_PASSWORD`, `OPENAI_API_KEY`
4. Add `tsquirrel` to Tagship's `deploy.sh` repo map: `/opt/stacks/tagship/deploy.sh`
5. `docker compose up -d` (first deploy — runs migrations + seeds sources automatically)
6. NPM → new proxy host → `tsquirrel.com` → container `server:3000`
7. Add `DEPLOY_TOKEN` secret to GitHub repo → Tagship webhook fires on `git tag v*`

**Tag deploy:** `git tag v1.0.0 && git push --tags` → GitHub Actions → Tagship webhook → rebuild.

## FeedService — Notes
- Stdlib-only XML regex parser (no cheerio/xml2js). Works for RSS 2.0 + Atom.
- Falls back gracefully on malformed feeds — bad items skipped, feed continues.
- HN fetch: batches of 10 concurrent. **Do not add retry without rate-limit guard.**

---

## Refactor Plan (pre-launch, Jul 2026)

Reviewed by Opus (use GitHub Models or OpenRouter `anthropic/claude-opus-4.8`).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Migration v5: add `squirrel_take TEXT` + `status VARCHAR` to stories | ⬜ todo | status: 'draft'\|'live'\|'suppressed', default 'draft' |
| 2 | SummaryService: write stories as `status='draft'` | ⬜ todo | Homepage query must filter `WHERE status='live'` |
| 3 | SummaryService: add `squirrel_take` to LLM prompts | ⬜ todo | Mascot voice, opinionated. Null-safe — LLM fail = null, don't crash |
| 4 | Views: render `squirrel_take` in story-cards.ejs + story-page.ejs | ⬜ todo | `.squirrel-take` component. Hide block if null |
| 5 | index-page.ejs: featured strip for first story | ⬜ todo | Dark bg, watermark 🐿️, full-width. Collapses to normal card at <640px |
| 6 | Header: 'N nuts stashed today' count from DB | ⬜ todo | COUNT live stories in last 24h |
| 7 | Fix docker-compose: DATABASE_URL `***` → `${DB_PASSWORD:-changeme}` | ⬜ todo | Deploy blocker |
| 8 | Parallelize HN fetch: 30 serial → Promise.all batches of 10 | ⬜ todo | No retry burst |
| 9 | `/health` route: add DB ping | ⬜ todo | NPM won't route to dead container if health check fails |
| 10 | `/sitemap.xml` route: dynamic, all live story slugs | ⬜ todo | Non-negotiable for SEO |
| 11 | OG/Twitter meta on story detail pages | ⬜ todo | Verify `og:url` + `og:description` populated on `/story/:slug` |
| 12 | `POST /api/admin/stories/:id/publish` endpoint | ⬜ todo | Token-protected (ADMIN_TOKEN env var). Moves draft→live |
| 13 | Hermes curation skill | ⬜ todo | Scheduled daily. Scans drafts, sends Discord shortlist, owner approves on phone |
| 14 | Expand source list to ~20–30 high-signal feeds | ⬜ todo | Migration v6 seed. Define curation persona prompt alongside this |

---

## Design Note: Legacy Image Hosting

**Problem:** `legacy_articles` rows have no image. Original source URLs (Gizmodo, DailyMail, Telegraph … 2013–2018) are mostly link-rotted.

**Proposed direction — resolve-once, cache-forever (B→C→A chain):**

1. **Migration v6** — add to `legacy_articles`:
   ```sql
   ADD COLUMN image_url TEXT,
   ADD COLUMN image_status VARCHAR(20) DEFAULT 'pending'  -- pending|ok|dead|none
   ```
2. **`LegacyImageService`** (one-shot backfill, NOT on cron):
   - Fetch `source_url` → parse `<meta property="og:image">`.
   - On dead/timeout/403 → query Wayback `archive.org/wayback/available?url=<source_url>` → resolve snapshot og:image.
   - Still nothing → `image_status = 'none'`, keep emoji.
3. **Render:** `image_status = 'ok'` → `<img src=image_url>`, else category emoji fallback.
4. **Phase 2 (only if hotlinking proves flaky):** self-host on Docker volume / Cloudflare R2.

**Decisions still open:**
- Stop at resolve+hotlink, or go straight to self-host?
- Same pipeline could later backfill `stories.image_url` for live cards (currently always null).
