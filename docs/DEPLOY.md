# TSquirrel Deployment

## Quick Deploy

```bash
# Connect
ssh -A root@5.78.154.18

# Deploy
cd /opt/stacks/tsquirrel
scripts/deploy-server.sh --pull
docker logs -f tsquirrel-server-1
```

## First Time Setup (server)

```bash
# Connect
ssh -A root@5.78.154.18

# Clone
cd /opt/stacks
git clone git@github.com:chrisribe/tsquirrel.git tsquirrel
cd tsquirrel

# Env
cp .env.example .env
nano .env
# Set at minimum:
#   DB_PASSWORD=<strong-password>
#   OPENAI_API_KEY=<key>
#   OPENAI_BASE_URL=<provider base>
#   SUMMARY_MODEL=<model>
#   PUBLIC_URL=<public domain>

# One-time network for NPM/Tagship reverse proxy
docker network create proxy-net

# Start
docker compose up -d --build
```

## Common Tasks

```bash
# Logs
docker logs tsquirrel-server-1 --tail 200

# Health
curl -sS http://localhost:3000/health

# Restart app only
docker compose restart server

# Rebuild app only (cache-bust uses current git SHA)
scripts/deploy-server.sh

# Pull + rebuild app
scripts/deploy-server.sh --pull

# Rebuild all services
scripts/deploy-server.sh --full

# DB shell
docker exec -it tsquirrel-db-1 psql -U dockeruser -d appdb

# Fresh DB (destructive)
docker compose down -v
docker compose up -d --build
```

## Migrations

TSquirrel DB image copies all `db/*.sql` into `/docker-entrypoint-initdb.d/`.
Those scripts auto-run only on a fresh Postgres volume.

```bash
# Rebuild DB image after adding a new db/*.sql file
docker compose up -d --build db

# Apply one migration manually to existing DB
docker exec tsquirrel-db-1 psql -U dockeruser -d appdb -f /docker-entrypoint-initdb.d/04-your-migration.sql

# List available migration files in container
docker exec tsquirrel-db-1 ls /docker-entrypoint-initdb.d/
```

## Tagship Pattern (optional)

Same pattern as EventGlimpse:

- Repo lives in `/opt/stacks/tsquirrel`
- Add `tsquirrel` mapping in `/opt/stacks/tagship/deploy.sh`
- Tag releases from GitHub to trigger deploy pipeline if webhook is configured

## Notes

- Current prod host: `5.78.154.18`
- Current prod path: `/opt/stacks/tsquirrel`
- Compose services: `server`, `db`
- Server port in container: `3000`
