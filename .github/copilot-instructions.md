# TSquirrel — Copilot Instructions

AI-powered news aggregator. These notes give project context and light conventions.
They augment (not replace) your default behavior — use judgment.

## Architecture
- **Server:** Node.js + Express (`server/server.js`), no build step.
- **Views:** EJS rendered through a single `layout-main.ejs` wrapper; each route passes
  a `template` (e.g. `index-page`, `story-page`) plus `pageData`.
- **Styling:** Pico.css + a small `styles.css`. HTMX (`hx-*`) for progressive interactivity.
- **Data:** PostgreSQL via `pg` `Pool`, injected as `req.app.get('pool')`. Access through
  DAOs in `server/dao/` (e.g. `NewsDAO`). Migrations run at boot via `MigrationService`.
- **No auth** — MVP is public; `res.locals.user` is always `null`.

## Request flow
`routes/web.js` → `NewsDAO` (SQL) → `res.render('layout-main', { template, pageData })`.
Order matters in `web.js`: legacy slug route and numeric-ID redirect come **before** the
homepage/catch-all.

## Services (`server/services/`)
- `FeedService` — RSS + Hacker News ingestion.
- `SummaryService` — LLM clustering, summaries, tags, sentiment.
- `CronService` — schedules ingestion (~30 min).
- `MigrationService` — idempotent schema setup at startup.

## Conventions
- Parameterized SQL only (`$1, $2`) — never string-interpolate query input.
- Keep the security headers in `server.js` intact.
- Page titles: `"<Title> — TSquirrel"`.
- Prefer editing existing files over adding new layers.

