# TSquirrel — Architecture & Deploy Reference

Scaffolded July 2026. Repo: `~/GitRepos/tsquirrel` → `github.com/chrisribe/tsquirrel` (private).

## Why it exists
tsquirrel.com was a dead PHP news aggregator. Cloudflare shows it still gets ~17k uniques/month organically. GA confirms 162/208 page views hit "What's Trending, Squirrel News" — the homepage still ranks. The Jan 2026 concept (parked until EventGlimpse hit $500 MRR) was unblocked when this traffic signal surfaced.

## Service Map

```
FeedService (30m cron)
  └─ ingestAll(pool)
     ├─ HN API → top 30 items
     └─ RSS/Atom feeds → parsed with stdlib regex (no deps)
     → upserts into articles table (dedup by source_id + external_id)

SummaryService (1h cron)
  └─ processNewArticles(pool)
     ├─ fetch ungrouped articles (last 6h, not in story_articles)
     ├─ LLM cluster: group by topic → stories[]
     └─ LLM summarize: 2-3 sentence synthesis + tags + sentiment + squirrel_take
     → upserts into stories, links via story_articles

CronService
  └─ startCron(pool) — called from server.js, skipped in NODE_ENV=test
```

## DB Schema (migration v5)

```sql
sources       id, name, slug, url, feed_url, type (rss|hn), active
articles      id, source_id→sources, external_id, title, url, published_at, fetched_at
              UNIQUE(source_id, external_id)
stories       id, title, slug (UNIQUE), summary, squirrel_take, category, tags[], sentiment, heat_score, image_url, updated_at
story_articles story_id→stories, article_id→articles  (PK both)
legacy_articles id, slug (UNIQUE), title, description, source_url, created_at
```

Heat score = source_count × 10. Top stories sorted by heat_score DESC.

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
| `GET /` | Homepage — top 30 stories, category filter bar |
| `GET /story/:slug` | Story detail — summary + squirrel_take + all source articles |
| `GET /api/stories?offset=N&category=X` | HTMX partial — story-cards.ejs, used for infinite scroll |
| `GET /health` | `{ status: 'ok' }` + DB connectivity check |
| `GET /sitemap.xml` | Dynamic sitemap — all active story slugs |
| `GET /robots.txt` | Static, allows all crawlers |

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

## FeedService — RSS Parser Note
Uses stdlib-only XML regex (no cheerio/xml2js). Works for standard RSS 2.0 and Atom.
Falls back gracefully on malformed feeds — bad items are skipped, feed continues.

HN fetch: parallelized in batches of 10 concurrent (no retry burst — do not add retry without rate-limit guard).

---

## Refactor Plan (pre-launch, Jul 2026)

Reviewed by Opus (via GitHub Models or OpenRouter `anthropic/claude-opus-4.8`).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Migration v5: add `squirrel_take TEXT` to stories | ⬜ todo | Idempotent DDL, `IF NOT EXISTS` pattern |
| 2 | SummaryService: add `squirrel_take` to LLM prompts | ⬜ todo | Mascot voice, opinionated take. Must be null-safe (fail = null, don't crash) |
| 3 | Views: render `squirrel_take` in story-cards.ejs + story-page.ejs | ⬜ todo | `.squirrel-take` component style. Hide block entirely if null |
| 4 | index-page.ejs: featured strip for first story | ⬜ todo | Dark bg, watermark 🐿️, full-width. Collapses to normal card at <640px |
| 5 | Category display name map (frontend only) | ⬜ todo | Tech→🔩 Nuts & Bolts, World→🌍 The Canopy, Business→💰 Acorn Economy, Science→🔭 Deep Forest, Entertainment→🔥 Forest Fire, Archive→📰 Buried Seeds |
| 6 | Header: 'N nuts stashed today' count from DB | ⬜ todo | COUNT articles in last 24h, injected in header.ejs |
| 7 | Fix docker-compose: DATABASE_URL `***` → `${DB_PASSWORD:-changeme}` | ⬜ todo | Deploy blocker |
| 8 | Parallelize HN fetch: 30 serial → Promise.all batches of 10 | ⬜ todo | No retry burst; HN Firebase has limits |
| 9 | `/health` route: add DB ping | ⬜ todo | NPM won't route to dead container if health check fails |
| 10 | `/sitemap.xml` route: dynamic, all story slugs | ⬜ todo | Non-negotiable for SEO — just a simple XML render from DB |
| 11 | OG/Twitter meta on story detail pages | ⬜ todo | layout-main has partial support; verify `og:url` + `og:description` populated on `/story/:slug` |
