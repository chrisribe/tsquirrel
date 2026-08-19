# TSquirrel

AI-powered news aggregator — [tsquirrel.com](https://tsquirrel.com)

## Stack

Express + EJS + Pico.css + HTMX + Postgres. No build step.

## What it does

- Ingests RSS feeds + Hacker News every 30 min
- Clusters related articles into stories via LLM
- Generates AI summaries + tags + sentiment
- Mobile-first trending feed with category filters

## Local dev

### Host runtime (no Docker)

```bash
cp .env.example .env  # fill in values
cd server && npm install && npm run dev
```

Requires a local Postgres instance or run `docker compose up db`.

### Docker runtime with hot reload

```bash
cp .env.example .env  # fill in values
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

This dev override runs `npm run dev` (nodemon) and bind-mounts `./server` into the container, so edits to EJS/CSS/JS reload without rebuilding the image.

## Deploy

Tag a release → Tagship auto-deploys to Hetzner:

```bash
git tag v1.0.0 && git push --tags
```

## Tooling: article regrouping

To inspect related headlines (human triage or LLM pre-processing):

```bash
node tools/article_cluster_tool.js --input tools/sample_articles_boeing.json --table
```

Docs: `docs/article-regrouping-tooling.md`.

## Environment variables

See `.env.example`.

- `GOOGLE_ANALYTICS_ID` enables GA4 page tracking via gtag in the shared layout.

GA4 events emitted (recommended naming):
- `page_view`
- `view_item` (story / legacy story views)
- `select_item` (story opens from feed, featured, related, archive)
- `select_content` (filters, back navigation, source/outbound link clicks)
- `view_item_list` (feed load-more via HTMX)

## API auth for agents

LLM/agent clients should not log in via `/auth/login`.
Use admin-created API tokens with bearer auth:

```bash
curl -H "Authorization: Bearer tsq_..." http://127.0.0.1:3000/api/v1/me
```

Available token-auth endpoints:
- `GET /api/v1/me`
- `GET /api/v1/stories?status=draft|published|hidden&needs_review=true|false&page=1&per_page=30&sort=updated_at|created_at|published_at|heat_score|title|status&order=asc|desc`
- `POST /api/v1/stories`
- `PATCH /api/v1/stories/:id`
- `DELETE /api/v1/stories/:id`
- `POST /api/v1/stories/bulk` (`action`: publish|unpublish|hide|feature|unfeature|delete)
- `POST /api/v1/stories/:id/publish`
- `POST /api/v1/stories/:id/unpublish`
- `POST /api/v1/stories/:id/hide`

