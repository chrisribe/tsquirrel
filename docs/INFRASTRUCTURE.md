# EventGlimpse Infrastructure

## Architecture

```
Internet → NPM (SSL) → EventGlimpse App → PostgreSQL
                            ↓
                         AWS S3 → Lambda
```

**Flow:**
1. User uploads photo via HTTPS
2. NPM terminates SSL, forwards to app on port 3000
3. App saves metadata to Postgres, uploads to S3
4. S3 triggers Lambda to generate thumbnails
5. App serves photos from S3

## Server: Hetzner

**IP:** 5.78.154.18  
**OS:** Ubuntu 24.04  
**Location:** /opt/stacks/eventglimpse

### Running Services

| Service | Ports | Access | URL |
|---------|-------|--------|-----|
| NPM | 80, 443, 81 | Public (80/443), IP-restricted (81) | https://npm.event-glimpse.com |
| Dockge | 5001 | IP-restricted | https://dockge.event-glimpse.com |
| EventGlimpse | 3000 | Internal only | https://event-glimpse.com |
| PostgreSQL | 5432 | Internal only | - |

### Docker Networks
- **proxy-net** - NPM ↔ App
- **default** - App ↔ Database

## AWS Resources

**S3 Bucket:** eventglimpse (us-east-1)  
**Lambda:** image-processor (Node.js 20.x, 512MB)

**S3 Structure:**
- `uploads/` → triggers Lambda
- `originals/` → full-size processed
- `display/` → 800px versions
- `thumbs/` → 200px thumbnails

**Lambda Code:** https://github.com/chrisribe/EventglimpseORG/tree/main/infra/lambda-image-processor

## Key Files

- `.env` - AWS keys, DB password (NOT in git)
- `docker-compose.yml` - Container config
- `/opt/stacks/` - All Docker projects

## Access

**SSH:** `id_hetzner` key (also used for GitHub)  
**GitHub:** Same key, forwarded via `ssh -A`  
**NPM/Dockge:** IP-restricted to your IP

## Security

- SSH keys only (no passwords)
- HTTPS everywhere (Let's Encrypt)
- Session cookies: secure, httpOnly, sameSite
- Trust proxy enabled for NPM
- AWS keys in .env only
