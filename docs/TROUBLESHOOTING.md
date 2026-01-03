# EventGlimpse Troubleshooting

## Quick Checks

```bash
# Container status
docker ps | grep eventglimpse

# Logs
docker logs eventglimpse-server-1 --tail 50
docker logs eventglimpse-db-1 --tail 50

# Full restart
cd /opt/stacks/eventglimpse
docker compose down
docker compose up -d
```

## Common Issues

### 502 Bad Gateway

NPM can't reach app. Check:
```bash
# Container running?
docker ps | grep eventglimpse-server

# NPM config correct?
# Should be: eventglimpse-server-1:3000
```

### Login Immediately Logs Out

Session cookies not working behind NPM.

**Fix:** Already in code (`trust proxy` enabled). If still broken:
```bash
docker exec eventglimpse-db-1 psql -U dockeruser -d appdb -c "SELECT COUNT(*) FROM user_session;"
# Should show sessions
```

### Git Pull Permission Denied

SSH agent not forwarded.

**Fix:**
```bash
# Local machine
ssh-agent bash
ssh-add ~/.ssh/id_hetzner
ssh -A root@5.78.154.18

# Test on server
ssh -T git@github.com
```

### Wrong Database Schema

Old data from previous version.

**Fix (deletes data!):**
```bash
docker compose down -v
docker compose up -d
docker exec -it eventglimpse-server-1 node scripts/create-admin.js
```

### Photos Not Processing

Lambda not triggered or failing.

**Check:**
- AWS Console → Lambda → image-processor → Monitor tab
- S3 trigger configured for `uploads/` folder

## Emergency Reset

```bash
cd /opt/stacks/eventglimpse
docker compose down -v  # Deletes database!
git pull
docker compose up -d --build
docker exec -it eventglimpse-server-1 node scripts/create-admin.js
```

## Useful Commands

```bash
# Database access
docker exec -it eventglimpse-db-1 psql -U dockeruser -d appdb

# Check tables
\dt

# Container shell
docker exec -it eventglimpse-server-1 bash

# Environment variables
docker exec eventglimpse-server-1 printenv | grep AWS
```
