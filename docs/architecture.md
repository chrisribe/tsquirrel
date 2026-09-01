# TSquirrel — Architecture & Deploy Reference

Scaffolded July 2026. Repo: `~/GitRepos/tsquirrel` → `github.com/chrisribe/tsquirrel` (private).

## Why it exists
tsquirrel.com was a dead PHP news aggregator. Cloudflare shows it still gets ~17k uniques/month organically. GA confirms 162/208 page views hit "What's Trending, Squirrel News" — the homepage still ranks. The Jan 2026 concept (parked until EventGlimpse hit $500 MRR) was unblocked when this traffic signal surfaced.

## Service Map

```
IngestionService (30m cron)
  └─ ingestAll(pool)
     ├─ HN API → top 30 items (parallelized in batches of 10)
     ├─ RSS/Atom feeds → parsed with stdlib regex (no deps)
     └─ Google Trends RSS → ht:news_item articles per trending topic
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

## DB Schema (migration v7+)

```sql
sources        id, name, slug, url, feed_url, type (rss|hn|trends), active
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
| google-trends-ca | trends | (constructed: trends.google.com/trending/rss?geo=CA) |

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

## IngestionService — Notes
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
| 10 | `/sitemap.xml` route: dynamic, all story slugs | ⬜ todo | Non-negotiable for SEO — just a simple XML render from DB |
| 11 | OG/Twitter meta on story detail pages | ⬜ todo | layout-main has partial support; verify `og:url` + `og:description` populated on `/story/:slug` |
| 12 | Legacy image hosting (see design note below) | ⬜ todo / think | 65 legacy rows have no image. Need resolve-once pipeline w/ fallback |
| 13 | Auth + admin (see design note below) | ✅ done | Ported session/auth stack from mood-tube. `/admin` gated by requireAuth+requireAdmin. Source stats + per-source article drill-down live. CLI `npm run create-user`. |
| 14 | Google Trends source (type `trends`) | ✅ done | Migration v7 seeds `google-trends-ca`. IngestionService parses `ht:news_item` blocks from Trends RSS. Each trending topic's linked articles ingested as normal articles. 30m cron picks them up automatically |
| 15 | Publishing model: manual + API first, retire auto-curation (see design note below) | 🟡 partial | **Manual flow DONE** (migration v8: status/author/published_at + api_tokens; dynamic heat_score; `/admin/stories` compose/edit/publish/unpublish/hide/feature/delete; homepage published-only; SummaryService retired from cron; existing stories hidden on cutover). **API `/api/v1` + token auth still TODO.** |
| 16 | Article retention: tombstone-and-prune (see design note below) | ⬜ todo | Keep full rows 30d; after that, if unlinked, move `(source_id, external_id)` to `seen_ids` tombstone (60–90d) + delete heavy row. Linked/cited articles never pruned. **Implement AFTER manual flow.** |
| 17 | Feed-image capture for live articles (see design note below) | ✅ done | Migration v12 (`articles.image_url`). RSS/Atom parser extracts `media:thumbnail`/`media:content`/`enclosure`/`itunes:image`/`<img>` — zero extra HTTP. Google Trends captures `ht:news_item_picture`. Radar-created drafts auto-seed `stories.image_url` from first evidence article w/ image. Admin can override via a thumbnail picker + custom-URL field on the story editor. Hotlinked images rendered (with `referrerpolicy="no-referrer"` + emoji fallback on load error) in signals list, story-edit attached-sources, `/admin/stories` list, homepage cards, featured strip, and story detail hero. |
| 18 | Premium R&D workflow (translation as minor bonus): deep analysis first + optional language output + private embargo/public release | ⬜ todo | Keep premium core centered on deeper article analysis/R&D value. Offer translation/language selection as a light add-on bonus (not the main value prop), with longer privacy windows by tier, "keep private forever" upsell, "publish now" generosity toggle, and auto-publish after N days only when source/license permits. |

---

## Design Note: Auth + Admin (ported from mood-tube)

**Problem:** No admin interface exists anywhere in tsquirrel. Sources are seeded twice (SQL init
script + migration v3) with no DAO write methods, no route, no UI. `static/robots.txt` already
disallows `/admin/` — an admin panel was clearly planned but never built. Before any source-management
UI can exist it needs an auth gate behind it.

**Decision: port the stack from `mood-tube`, not EventGlimpse.** Both sibling projects
(`f:\CRibe\GitRepos\DockerProjects\mood-tube`, `f:\CRibe\GitRepos\DockerProjects\Eventglimpse`) already
have a working `users` + `connect-pg-simple` session + rotating-secret architecture. mood-tube's is the
better source to copy from:

- Uses **argon2** for password hashing (not bcrypt) + a constant-time dummy hash on unknown-user login
  to prevent username enumeration via timing attacks (`authService.js`).
- Has a dedicated **`adminMiddleware.js`** (403 on non-admin role) that EventGlimpse lacks — exactly
  the gate tsquirrel needs for `/admin/*`.
- Leaner `users` schema — no `tier`/`paid_at`/`expires_at` billing columns tsquirrel doesn't need.
- `SessionService.js` cleanly encapsulates `express-session` + `connect-pg-simple` + cookie hardening
  (`httpOnly`, `sameSite: lax`, `secure` in prod, `trust proxy` behind Nginx) in one class, called once
  from `server.js`.
- `scripts/create-user.js` — interactive CLI to provision the first admin post-deploy (no public
  self-registration for admin accounts).

**Schema (new migration v6 — becomes v7 if legacy-image v6 lands first):**

```sql
users          id, username (unique), password (argon2 hash), email (unique),
               role ('user'|'admin', default 'user'), status ('active'|..., default 'active')
user_session   sid (PK), sess (json), expire   -- managed by connect-pg-simple, createTableIfMissing
session_secrets id, secret, created_at, active  -- rotated every 24h, last 5 kept active
```

Indexes: `idx_users_status`, `idx_session_secrets_active`, `IDX_session_expire`.

**Files to port (near-verbatim from mood-tube, path-adjusted for tsquirrel's structure):**

| mood-tube source | tsquirrel destination | Notes |
|---|---|---|
| `server/services/SessionService.js` | `server/services/SessionService.js` | Wires `express-session` + `connect-pg-simple` + `SecretService` |
| `server/services/SecretService.js` | `server/services/SecretService.js` | 24h rotation, keeps last 5 secrets active |
| `server/services/authService.js` | `server/services/authService.js` | argon2 hash/verify, timing-safe unknown-user path |
| `server/dao/SessionSecretsDAO.js` | `server/dao/SessionSecretsDAO.js` | As-is |
| `server/dao/UserDAO.js` | `server/dao/UserDAO.js` | Trim to fields tsquirrel needs (no tier/billing) |
| `server/middleware/authMiddleware.js` | `server/middleware/authMiddleware.js` | `requireAuth` — redirect HTML, 401 JSON |
| `server/middleware/adminMiddleware.js` | `server/middleware/adminMiddleware.js` | `requireAdmin` — 403 on non-admin role |
| `server/middleware/sessionMiddleware.js` | `server/middleware/sessionMiddleware.js` | Injects `res.locals.user`/`isAuthenticated` for EJS |
| `server/routes/auth.js` + `AuthController` | `server/routes/auth.js` | **Trim: login/logout only, drop public `/register`** |
| `server/scripts/create-user.js` | `server/scripts/create-user.js` | CLI-provisioned admin, wired as `npm run create-user` |

**New tsquirrel-specific pieces (not ported, built fresh):**

- `server/dao/SourcesDAO.js` — `createSource`, `updateSource`, `deactivateSource`, `listSources` (currently `NewsDAO.getActiveSources`/`getSourceBySlug` are read-only).
- `server/routes/admin.js` — `GET/POST /admin/sources` (list, add, edit, deactivate), gated by `requireAuth` + `requireAdmin`. Consider an "ingest now" button that calls `IngestionService.ingestAll(pool)` on demand.
- `server/views/admin/*.ejs` — minimal source list/edit forms, reuse `layout-main.ejs`.
- `server.js`: replace hardcoded `res.locals.user = null` with `sessionMiddleware`; call `new SessionService(pool).initialize(app)` before routes are mounted.
- De-dupe the source seed: remove the duplicate seed list from `MigrationService.js` v3 now that sources are DAO/UI-manageable (keep `db/02-sources.sql` as the one source of truth, or vice versa — pick one before writing the DAO).

**Decisions made:**
- No public registration — admin accounts are CLI-provisioned only (`create-user`).
- Scope of `/admin` for v1: source CRUD + manual ingest trigger only. Story moderation (hide/delete/feature) deferred to a later pass.
- Reuse `users.role` (`user`/`admin`) rather than a separate permissions table — single-operator use case doesn't need more.

---

## Design Note (TODO — think before implementing): Legacy Image Hosting

**Problem:** `legacy_articles` rows have `title`, `description`, `source_url` — but **no image**. The
current archive cards fall back to the category emoji. Original tsquirrel.com is dead; the external
`source_url`s (Gizmodo, DailyMail, Telegraph, RollingStone… circa 2013–2018) are mostly link-rotted.

**Options considered:**

| # | Approach | Resilience | Effort | Legal/risk |
|---|----------|-----------|--------|-----------|
| A | Emoji thumbnail (current) | ∞ (nothing breaks) | none | none |
| B | Hotlink source `og:image` | low — dies with link, hosts block hotlink-referer | low | grey (hotlinking) |
| C | Wayback-resolved image | good — archive.org is stable & hotlink-friendly | medium | grey, archival-friendly |
| D | Self-host (download → volume/R2) | best — own the bytes | high | **highest** — rehosting press photos |

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

---

## Design Note: Feed-Image Capture (live articles + radar authoring)

> **Status: ✅ IMPLEMENTED (Jul 2026).** This is the *live-feed* sibling to the Legacy Image
> Hosting note above (#12). That note is a one-shot backfill for dead 2013–2018 links via
> Wayback; **this** note is about images for articles ingested *right now* from active feeds.
> The two do not share code and shipped independently. See "Implementation Summary" at the
> end of this note for what was actually built, verified, and extended beyond the original spec.

**Problem.** `articles` rows carry `title`, `url`, `published_at`, `description` — but no image.
When the radar clusters articles into a signal and the operator opens the authoring view, they see
a wall of text with no visual cue about what each cluster is. And when a draft story is created from
a signal, `stories.image_url` is left null, so the published card/detail page also has no image.

**Key finding (verified live 2026-07-27).** The active RSS feeds already embed a usable image URL
**inside the feed XML we download anyway** — no per-article page fetch, no scraping, no `og:image`
round-trip. Confirmed samples:

| Source | Tag present | Example |
|---|---|---|
| BBC (`feeds.bbci.co.uk/news/rss.xml`) | `<media:thumbnail url="…">` | `ichef.bbci.co.uk/ace/standard/240/…jpg` |
| Guardian (`theguardian.com/world/rss`) | `<media:content url="…">` | `i.guim.co.uk/img/media/…jpg` |
| Ars Technica | `<media:thumbnail url="…">` | `cdn.arstechnica.net/…jpg` |
| Google Trends RSS | `<ht:news_item_picture>…</ht:news_item_picture>` | per news item |
| Hacker News API | none | (no image — expected; leave null) |
| TechCrunch | none in the sampled item | leave null, no fallback fetch |

Because the bytes are already in-hand, this is **Option B (hotlink)** from the legacy note — the
user has confirmed hotlinking is acceptable — but with *far higher resilience* than the legacy case:
these are live feeds pointing at CDN-hosted assets (BBC ichef, Guardian guim, Ars CDN) that are
hotlink-tolerant and current, not link-rotted archives. **No Wayback fallback is needed here.**

**Explicitly out of scope (do NOT build):**
- No fetching of each article's HTML page to parse `<meta property="og:image">`.
- No downloading/rehosting of image bytes (that's Phase-2 self-host, deferred exactly as the legacy note defers it).
- No image proxying or resizing. Hotlink the source URL as-is.
- No retroactive backfill of already-ingested rows (new column is null for old rows; acceptable — they age out via retention #16).

### Data model

Migration **v12** (idempotent, follows the v11 pattern in `MigrationService.js`):

```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url TEXT;
```

No index needed (never queried by image). `stories.image_url` already exists.

### Ingestion — `server/services/IngestionService.js`

All image extraction happens in the existing parsers. **No new HTTP requests.** The service is a bag
of stateless functions (not a class) — keep that shape.

1. **`parseRss(xml)`** — for each `<item>`/`<entry>` block, in addition to title/url/pubDate:
   - also capture `description` (currently declared as a column but never populated — the admin
     article-picker `searchAvailableArticles` already ILIKEs `description`, so this fixes a latent gap).
   - add an `extractImage(innerXml)` helper that returns the **first** match, in priority order:
     1. `<media:thumbnail url="…">`
     2. `<media:content url="…">` (only if its attrs/URL look like an image: `type="image/*"` or extension `jpg|jpeg|png|gif|webp`)
     3. `<enclosure url="…">`
     4. `<itunes:image href|url="…">`
     5. `<image><url>…</url></image>`
     6. first `<img src="…">` inside `content:encoded`/`description`
   - HTML-decode entities (`&amp;` → `&`) on the returned URL.
   - `stripTags()` the description and cap it (~1000 chars) since RSS descriptions carry markup.
   - Return shape gains two fields: `{ title, url, publishedAt, description, imageUrl }`.

2. **`parseGoogleTrends(xml)`** — add `imageUrl: getHt('news_item_picture')` to each pushed item.

3. **`ingestAll(pool)`** — pass the two new fields through to the DAO:
   `dao.upsertArticle({ …, description: item.description || null, imageUrl: item.imageUrl || null })`.

### DAO — `server/dao/NewsDAO.js` (all SQL lives here, per project rule)

- **`upsertArticle`** — add `imageUrl = null` param; insert into the new `image_url` column.
  Keep `ON CONFLICT (source_id, external_id) DO NOTHING` (ingest is idempotent; we don't overwrite).
- **`getArticlesByIds`** — add `a.image_url` to the SELECT (radar authoring reads this).
- **`createDraft`** — add optional `imageUrl = null` param and write it to `stories.image_url`.
- No other methods change. `upsertStory` already COALESCEs `image_url`, so nothing there.

### Draft creation from a signal — `server/routes/admin.js`

In `POST /admin/signals/:id/create-story`, after loading `evidence.article_ids`:
1. `const articles = await dao.getArticlesByIds(articleIds);`
2. Pick a lead image: `const lead = articles.find(a => a.image_url)?.image_url || null;`
3. Pass `imageUrl: lead` into `dao.createDraft({ … })`.
   (Operator can still swap it later in the story editor.)

### Views

- **`server/views/admin/signals.ejs`** — inside the expandable `<details>` article list, if
  `articleMap[id].image_url` is set, render a small hotlinked thumbnail
  (`<img src="…" loading="lazy" width="80" referrerpolicy="no-referrer">`) beside the title.
  `referrerpolicy="no-referrer"` avoids hotlink-referer blocks; `loading="lazy"` keeps the list light.
- **Story edit view** — surface each attached source article's thumbnail so the operator can
  eyeball/choose; the auto-picked `stories.image_url` is already the first one.
- **Public output** — `stories.image_url` now populates on radar-authored drafts, so the existing
  card/detail `<img>` rendering "just works." Where it renders a hotlinked source image, add
  `referrerpolicy="no-referrer"` and an `onerror` that hides the `<img>` (fall back to category emoji).

### Failure & edge handling (keep minimal — system boundary only)

- Missing image → column stays null → views fall back to existing emoji/no-image behavior. Never blocks ingest.
- Broken hotlink at render → `<img onerror>` hides it, category emoji shows. No server-side liveness check.
- Malformed/edge XML → `extractImage` returns null; do not throw.

### Acceptance checks

1. After v12 + rebuild, `\d articles` shows `image_url`.
2. Run ingest; `SELECT COUNT(*) FILTER (WHERE image_url IS NOT NULL), COUNT(*) FROM articles WHERE source_id IN (bbc, guardian, ars)` shows a healthy majority populated.
3. HN/TechCrunch rows remain null (expected) — ingest does not error.
4. `/admin/signals` shows thumbnails in the expanded article lists.
5. Creating a story from a signal whose cluster has ≥1 imaged article sets `stories.image_url`.
6. Re-running ingest is still idempotent (no duplicate rows, existing images unchanged).

### Decisions still open (for the operator, not the implementer)

- Overwrite policy: currently `DO NOTHING` means an article's image is set once at first ingest and
  never refreshed. Fine for hotlinks; revisit only if a feed serves a placeholder first then a real image.
- Whether to also capture image dimensions/`type` for better `<img>` sizing (deferred — not needed for v1).

### Implementation Summary (what actually shipped)

Built and verified live against production feeds (BBC, Guardian, Ars, Google Trends, HN, TechCrunch)
on 2026-07-27. Matches the spec above with one deliberate addition (admin image override, not in the
original spec) and one intentionally-skipped item (radar-authored image on the demo path, superseded
by the manual picker — see below).

**Shipped as specced:**
- Migration v12 — `articles.image_url TEXT`, applied cleanly, verified via `\d articles`.
- `IngestionService.extractImage()` — priority chain (`media:thumbnail` → `media:content` →
  `enclosure` → `itunes:image` → `<image><url>` → `<img src>`), plus `stripTags()`/`decodeEntities()`.
  Also backfilled the previously-declared-but-unused `description` capture in `parseRss`.
  Verified 100% extraction rate on live BBC/Guardian/Google-Trends payloads; HN/TechCrunch correctly
  null (no image tag present, no fallback fetch attempted).
- `NewsDAO`: `upsertArticle`, `getArticlesByIds`, `createDraft` all thread `imageUrl` through.
  Round-tripped with a synthetic insert/read/cleanup to confirm the column survives the DAO layer.
- `admin.js` `POST /signals/:id/create-story` — picks the first evidence article with an image as
  the new draft's `image_url`.
- Thumbnails rendered in `/admin/signals` (evidence list) and story-edit (attached-sources table),
  both with `referrerpolicy="no-referrer"` + `loading="lazy"`.
- Public output — `story-cards.ejs` (feed grid) and `story-page.ejs` (detail hero) render the
  hotlinked image with a JS `onerror` fallback that swaps back to the category emoji.
- **Extra (not in original spec):** the homepage **featured strip** (`index-page.ejs`, `.card-featured`)
  now also renders the lead story's image as a background with a dark gradient scrim for text
  legibility — the spec only covered cards/hero, this was found missing during manual QA and closed
  the same day.

**Extra — Admin image picker (built same day, separate follow-up request, not in original spec):**
- Problem: auto-picked image (first evidence article with one) is a reasonable default but the
  operator may want a different source photo, or none at all.
- `story-edit.ejs` — new "Story image" fieldset: a "No image" radio, one radio + thumbnail per
  *unique* `image_url` among the story's attached source articles (current selection pre-checked),
  plus a free-text "custom image URL" field that overrides the radio choice.
- `admin.js` — both `POST /stories` (create) and `POST /stories/:id` (update) resolve
  `image_url_manual || image_url || null` and pass it through.
- `NewsDAO.updateDraft` — gained an optional `imageUrl` param (backward compatible: omitting it
  leaves the existing image untouched, so other non-image callers are unaffected).
- Verified end-to-end: picked a different candidate thumbnail via a simulated form POST, confirmed
  `stories.image_url` changed in the DB to the newly selected URL.

**Admin/stories list layout fix (same session, follow-up):**
- `/admin/stories` table was not using the `.table-scroll`/`.admin-actions`/`.nowrap` pattern already
  established for `/admin/signals`, so action buttons and long titles could blow out page width.
- Brought it in line: table wrapped in `.table-scroll`, Status/Cat/Sources/Heat/Featured marked
  `.nowrap`, publish/unpublish/feature buttons moved into `.admin-actions`, and added a leading
  48px thumbnail column (blank cell when a story has no image — no layout break for old rows).

**Verified live (2026-07-27):**
- Real ingest cycle after deploy populated `image_url` on 6 newly-fetched articles (Guardian +
  Google Trends confirmed via SQL).
- Built and published a real demo story from freshly-imaged articles; screenshot-confirmed the
  Guardian hotlinked image renders in both the story hero and the homepage featured strip.
- Admin picker confirmed to persist a different image selection to `stories.image_url`.
- `/admin/stories` list confirmed to show a thumbnail for the imaged story and a blank cell
  (no breakage) for stories without one.

**Known environment quirk found during QA (not a code bug, documented in repo memory):**
`NODE_ENV` defaults to `production` in `docker-compose.yml`, which sets the session cookie's
`secure` flag. Testing directly against the container over plain HTTP (no reverse proxy adding
`X-Forwarded-Proto: https`) causes the browser to silently drop the session cookie, making login
appear to fail even with correct credentials. Worked around during testing by sending
`X-Forwarded-Proto: https` on direct HTTP requests (`trust proxy` is already set to `1`). Not an
issue in the real deployment, which always sits behind Nginx Proxy Manager over HTTPS.

---

## Design Note: Publishing Model — Manual + API First, Retire Auto-Curation

**Core philosophy (decided Jul 2026):** TSquirrel is a **host and linker of curated content, not a
content foundry.** The site's job is to store published stories, accrue source links to them over time,
and serve them well. Authoring is done by **humans** or **external systems** (e.g. a Hermes LLM
instance that browses, gathers, summarizes, and submits) — never by an unreviewed baked-in cron.
"Proud squirrels": full-auto generation produces poor quality, so nothing an agent writes goes live
without human review.

**The key primitive:** "publish a story" is a single operation that both a human (admin UI, session
auth) and an external agent (API, token auth) call the same way, through one `StoryService`. Auto-
curation is not a privileged internal shortcut — if it ever returns, it's just another API client.

```
articles (raw ingest — unchanged, source material only)
    │  (attach as citations; links accrue over time → dynamic heat_score)
    ▼
┌──────────── StoryService (the ONE publish primitive) ────────────┐
│  createDraft · updateDraft · attachSource · publish · unpublish  │
│  · hide · delete                                                 │
└───────────────────────────────────────────────────────────────────┘
    ▲                         ▲
    │ admin UI (session)      │ POST /api/v1/stories (per-agent token)
    │ = human, manual         │ = Hermes / external contributor
    │                         │ → always lands as DRAFT (pending review)
```

**Build order:** manual flow **first** (defines the canonical publish contract), then the API as a
thin auth-swapped wrapper over the identical `StoryService`. Human and agent become interchangeable
authors — no separate code path.

### Decisions (locked)

1. **heat_score stays — but must become DYNAMIC.** Concept: publish on a lightly-covered subject; as
   new sources cover it over time they get linked, and the score rises. **Current code freezes
   `heat_score = source_count × 10` at cluster-creation** — that must change to **recompute on every
   source link** (or render as a live `COUNT(story_articles)` × 10). A story published with 1 source
   must climb as sources #2–#6 attach later. This is the mechanism that makes "host + link over time"
   meaningful.
2. **Agent-authored stories → DRAFT only, always human-reviewed before publish.** No auto-publish for
   agents, ever. Full-auto = poor quality; human-in-the-loop is the default.
3. **Per-agent API tokens, hashed and REVOCABLE.** New `api_tokens` table (hashed token, agent label,
   `created_at`, `revoked_at`), not a single shared env secret — gives per-contributor audit trail and
   independent revocation.
4. **Site hosts & links; it is not the foundry.** Retire `SummaryService` from the live pipeline
   (cron off; keep the file dormant as optional reference, not wired to auto-create stories). Humans /
   external systems author. This keeps the platform flexible — any human or system can complete the
   authoring task.
5. **Ranking: `published_at` DESC + manual `featured` flag, `heat_score` as tie-breaker.** Start
   simple and deterministic (no LLM). "Trending" / "related articles" (shared tags/sources) can layer
   on later without changing the ranking core.

### Story lifecycle (new columns on `stories`)

```sql
status        VARCHAR(20) DEFAULT 'draft'   -- draft | published | hidden
author_type   VARCHAR(20)                   -- human | agent
author_id     TEXT                          -- user id (human) or agent/token label
published_at  TIMESTAMP                      -- nullable; set on publish()
featured      BOOLEAN DEFAULT FALSE          -- manual homepage boost
```

- Homepage query changes from "all stories" → `WHERE status = 'published'`. That single clause
  **decouples ingestion from publication** — a `stories` row existing no longer means it's live.
- Admin sees all statuses. Nothing goes live without an explicit `publish()` call.
- `heat_score` recomputed on `attachSource` (see decision #1).

### New pieces to build

- **`server/services/StoryService.js`** — the one publish primitive (createDraft, updateDraft,
  attachSource [recompute heat_score], publish, unpublish, hide, delete). Both UI and API call this.
- **`server/dao/StoryDAO.js`** (or extend `NewsDAO`) — write methods for the lifecycle + status-
  filtered reads (`getPublishedStories`, `getAllStoriesForAdmin`).
- **Admin UI** (`/admin/stories`, `/admin/stories/new`, `/admin/articles`) — browse raw articles,
  compose a story from selected article_ids, save draft, preview, publish/unpublish/hide/delete,
  toggle featured. Reuses `layout-main.ejs` + existing session/admin gate.
- **`server/routes/api.js`** — `POST /api/v1/stories` (create draft), `PATCH /api/v1/stories/:id`,
  `POST /api/v1/stories/:id/publish` (may be admin-only if agents are review-gated), token-auth
  middleware validating against `api_tokens`. Drafts from agents surface in the admin review queue.
- **`api_tokens` table + `apiTokenMiddleware.js`** — hashed token lookup, `revoked_at IS NULL` check,
  attaches agent label as `author_id`.

### Migration (next version)

```sql
-- stories lifecycle
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS status       VARCHAR(20)  DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS author_type  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS author_id    TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS featured     BOOLEAN      DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_stories_status_published ON stories(status, published_at DESC);

-- revocable per-agent API tokens
CREATE TABLE IF NOT EXISTS api_tokens (
  id          SERIAL PRIMARY KEY,
  label       VARCHAR(100) NOT NULL,        -- e.g. 'hermes-prod'
  token_hash  VARCHAR(255) NOT NULL,        -- argon2/sha256 of the token
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at  TIMESTAMP                     -- NULL = active
);
```

**Data migration note:** existing auto-generated `stories` rows have no `status`. Decide on cutover:
default them to `hidden` (clean slate, nothing unreviewed stays live) or `published` (keep current
homepage as-is). Recommend **`hidden`** to honor the "nothing unreviewed is live" principle, then
manually publish the good ones.

### Open (defer, not blocking v1)

- Do agents ever get a trusted "auto-publish" scope per-token, or is human review permanent? (Start
  permanent.)
- "Related articles" surfacing via shared tags/sources — post-v1.
- Whether `SummaryService` is deleted outright or kept dormant as a future opt-in token client.
- **Language: English-only for v1.** Open to multi-language articles later — when added, `stories`
  (and likely `articles`) will need a `lang` column (e.g. BCP-47 `en`, `fr`) plus per-language homepage
  filtering. Design decisions (per-language homepages vs. mixed feed with filter, translation vs.
  native-only) deferred until there's demand. Not building now; noted so the schema can accommodate it.

---

## Design Note: Article Retention — Tombstone-and-Prune

**Problem:** `IngestionService` upserts into `articles` every 30 min, deduped by `(source_id, external_id)`,
and **nothing ever deletes them.** ~7 sources × dozens of items every 30 min ≈ thousands of rows/day,
forever. Most are never cited by a published story. Unbounded growth → slower ungrouped-article scans,
bloated backups, wasted disk.

**Why articles can't just be deleted:** the `(source_id, external_id)` UNIQUE constraint is *also* the
"already seen" ledger — it's why the same headline isn't re-ingested every 30 min. Delete the row and
its `external_id` is forgotten, so the next feed poll re-inserts it (re-ingest storm). Articles serve
three roles: (1) dedup memory, (2) un-curated source inventory for the manual/Hermes compose flow,
(3) late source-linking material (a week-old corroborating article can attach to an existing story and
raise its dynamic heat_score). Dedup needs a *long* horizon; the curation window needs a *bounded* one
— hence two tiers.

**Decision (locked Jul 2026): tombstone-and-prune (Option C).**

1. **Curation window: keep full article rows for 30 days.** Long enough for late source-linking and
   for a human/agent to compose from recent inventory.
2. **After 30 days, if still unlinked** (not referenced by any `story_articles` row): move
   `(source_id, external_id)` into a slim **`seen_ids` tombstone table** and delete the heavy
   `articles` row. Dedup still works — IngestionService checks tombstones before inserting.
3. **Tombstone retention: 60–90 days.** Feeds don't re-surface items older than a couple months, so
   the dedup ledger can itself be pruned after 60–90 days without practical re-ingest risk.
4. **Linked/cited articles are NEVER pruned.** Once an article is attached to any story it's published
   provenance and is permanent, regardless of age.

This keeps the fat table bounded, preserves dedup effectively forever (within the feed's own re-surface
window), gives a generous 30-day curation window that serves the "host + link over time" philosophy,
and garbage-collects noise without ever causing re-ingestion.

### Schema (future migration)

```sql
CREATE TABLE IF NOT EXISTS seen_ids (
  source_id   INTEGER NOT NULL REFERENCES sources(id),
  external_id VARCHAR(255) NOT NULL,
  seen_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, external_id)
);
```

### Prune cron (runs daily; NOT before manual flow exists)

```sql
-- 1. Tombstone + delete unlinked articles older than 30 days
INSERT INTO seen_ids (source_id, external_id, seen_at)
SELECT source_id, external_id, fetched_at FROM articles a
WHERE a.fetched_at < NOW() - INTERVAL '30 days'
  AND a.id NOT IN (SELECT article_id FROM story_articles)
  AND a.external_id IS NOT NULL
ON CONFLICT DO NOTHING;

DELETE FROM articles a
WHERE a.fetched_at < NOW() - INTERVAL '30 days'
  AND a.id NOT IN (SELECT article_id FROM story_articles);

-- 2. Prune tombstones older than the feed re-surface window (60–90 days)
DELETE FROM seen_ids WHERE seen_at < NOW() - INTERVAL '90 days';
```

IngestionService dedup check becomes: skip insert if `(source_id, external_id)` exists in **either**
`articles` OR `seen_ids`.

**Sequencing: implement AFTER the manual publishing flow is in place** (refactor #15). The retention
rules depend on `story_articles` linkage being the source of truth for "is this article cited," which
the manual flow finalizes. Documenting now because it interacts with the dynamic-heat_score /
late-linking design; not building yet.


