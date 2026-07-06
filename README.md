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

```bash
cp .env.example .env  # fill in values
cd server && npm install && npm run dev
```

Requires a local Postgres instance or run `docker compose up db`.

## Deploy

Tag a release → Tagship auto-deploys to Hetzner:

```bash
git tag v1.0.0 && git push --tags
```

## Environment variables

See `.env.example`.
