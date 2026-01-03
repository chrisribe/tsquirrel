# EventGlimpse Deployment

## Quick Deploy

```bash
# STEP 1: Start SSH agent (creates a session to hold your keys in memory)
ssh-agent bash

# STEP 2: Add your key to the agent (one-time per terminal session)
ssh-add ~/.ssh/id_hetzner

# STEP 3: Connect to server with agent forwarding
# -A = forward agent (lets server use your local keys)
# Agent already knows which key to use from step 2
ssh -A root@5.78.154.18

# STEP 4: Deploy
cd /opt/stacks/eventglimpse
git pull
docker compose down
docker compose up -d --build
docker logs -f eventglimpse-server-1
```

## How SSH Agent Forwarding Works

**The Problem:**
- Your PC has the SSH key for GitHub
- Server needs to talk to GitHub (for `git pull`)
- You DON'T want to copy your private key to the server (insecure)

**The Solution: Agent Forwarding**

1. **`ssh-agent bash`** - Starts a special program that holds keys in memory
2. **`ssh-add ~/.ssh/id_hetzner`** - Loads your key into the agent
3. **`ssh -A`** - The `-A` flag forwards the agent through the SSH connection
4. **On server:** When git tries to connect to GitHub, it asks the forwarded agent
5. **Agent responds:** Uses your LOCAL key (never copied to server)

**Visual:**
```
Your PC                Server              GitHub
  |                      |                   |
  | ssh -A -i key -----> |                   |
  |   (login)            |                   |
  |                      |                   |
  |                      | git pull -------> |
  |                      |   (needs auth)    |
  |                      | <-- need key? --- |
  | <-- forward key? --- |                   |
  | -- yes, use mine --> |                   |
  |                      | -- authenticated->|
  |                      | <--- code --------|
```

**Important:**
- Agent forwarding only works WHILE you're connected
- If you disconnect, server loses access (secure!)
- Need to run `ssh-agent bash` + `ssh-add` each new terminal session

## First Time Setup

```bash
# STEP 1: Start SSH agent
ssh-agent bash

# STEP 2: Add your key
ssh-add ~/.ssh/id_hetzner

# STEP 3: Connect to server
ssh -A root@5.78.154.18

# STEP 4: Clone repo (on server)
cd /opt/stacks
git clone git@github.com:chrisribe/Eventglimpse.git eventglimpse
cd eventglimpse
git checkout mvp-friction-test

# STEP 5: Setup environment
cp .env.example .env
nano .env
# Add these values:
#   DB_PASSWORD=<your-password>
#   AWS_ACCESS_KEY_ID=<your-key>
#   AWS_SECRET_ACCESS_KEY=<your-secret>
#   S3_BUCKET_NAME=eventglimpse

# STEP 6: Create Docker network (one-time)
docker network create proxy-net

# STEP 7: Start containers
docker compose up -d

# STEP 8: Create admin user
docker exec -it eventglimpse-server-1 node scripts/create-admin.js
# Enter: username, email, password when prompted
```

## NPM Proxy Config

- Domain: `event-glimpse.com`
- Forward: `http://eventglimpse-server-1:3000`
- SSL: Let's Encrypt

## Common Tasks

```bash
# Reset admin password
docker exec -it eventglimpse-server-1 node scripts/create-admin.js

# Fresh database (deletes data!)
docker compose down -v
docker compose up -d

# Database access
docker exec -it eventglimpse-db-1 psql -U dockeruser -d appdb

# View logs
docker logs eventglimpse-server-1 --tail 100

# Rollback
git log --oneline -10
git checkout <hash>
docker compose up -d --build
```

## URLs

- App: https://event-glimpse.com
- NPM: https://npm.event-glimpse.com (IP restricted)
- Dockge: https://dockge.event-glimpse.com (IP restricted)

## Notes

- Trust proxy enabled for NPM SSL termination
- Postgres 17
- Lambda processes uploads (see EventglimpseORG repo)

