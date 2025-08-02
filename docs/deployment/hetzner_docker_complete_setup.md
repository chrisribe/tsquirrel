# Complete Hetzner Docker Setup Guide
*The perfect Docker development environment with reverse proxy and web management*

## 🎯 What You'll Get
- **Nginx Proxy Manager (NPM):** SSL certificates + domain routing
- **Dockge:** Beautiful Docker stack management UI
- **Proper networking:** All containers can talk to each other
- **Clean URLs:** `app.yourdomain.com`, `dockge.yourdomain.com`, etc.

## 🚀 Server Setup

### 1. Create Hetzner Server
- **Server type:** CPX21 (2 vCPU, 4GB RAM) or higher
- **Image:** Ubuntu 22.04 LTS
- **SSH Key:** Add your public key during creation
- **Firewall:** Enable with ports 22, 80, 443

### 2. Initial Server Configuration
```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Create directory structure
mkdir -p /opt/{nginx-proxy-manager,dockge,stacks}

# Create shared network
docker network create proxy-net
```

## 🔧 Nginx Proxy Manager Setup

### 3. Create NPM Configuration
```bash
cd /opt/nginx-proxy-manager
cat > docker-compose.yml << 'EOF'
services:
  npm:
    image: jc21/nginx-proxy-manager:latest
    ports:
      - "80:80"
      - "443:443"
      - "81:81"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    restart: unless-stopped

networks:
  default:
    external: true
    name: proxy-net
EOF

# Start NPM
docker compose up -d
```

### 4. Configure NPM
- Access: `http://YOUR_SERVER_IP:81`
- Default login: `admin@example.com` / `changeme`
- **Change credentials immediately!**

## 📊 Dockge Setup

### 5. Create Dockge Configuration
```bash
cd /opt/dockge
cat > docker-compose.yml << 'EOF'
services:
  dockge:
    image: louislam/dockge:1
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - /opt/stacks:/opt/stacks
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks

networks:
  default:
    external: true
    name: proxy-net
EOF

# Start Dockge
docker compose up -d
```

## 🌐 Domain Configuration

### 6. DNS Setup (Cloudflare)
Add A records pointing to your server IP:
- `@` → `YOUR_SERVER_IP` (for yourdomain.com)
- `www` → `YOUR_SERVER_IP`
- `dockge` → `YOUR_SERVER_IP`
- `npm` → `YOUR_SERVER_IP`

### 7. NPM Proxy Hosts
Create these proxy hosts in NPM:

#### Main Website
- **Domain Names:** `yourdomain.com`, `www.yourdomain.com`
- **Forward Hostname:** `your-app-container-name`
- **Forward Port:** `80` (or whatever your app uses internally)
- **SSL:** Request new certificate, Force SSL

#### Dockge Management
- **Domain Names:** `dockge.yourdomain.com`
- **Forward Hostname:** `dockge-dockge-1`
- **Forward Port:** `5001`
- **SSL:** Request new certificate, Force SSL
- **Access:** Restrict to your IP only

#### NPM Self-Management (Inception!)
- **Domain Names:** `npm.yourdomain.com`
- **Forward Hostname:** `nginx-proxy-manager-npm-1`
- **Forward Port:** `81`
- **SSL:** Request new certificate, Force SSL
- **Access:** Restrict to your IP only

## 🐳 Deploying Your App

### 8. Clone Your Project
```bash
cd /opt/stacks

# For private repos, set up SSH agent first:
ssh-agent bash
ssh-add ~/.ssh/id_yourkey

# Then clone normally
git clone git@github.com:username/your-project.git
cd your-project
```

### 9. Docker Compose Requirements
Your project's `docker-compose.yml` MUST include:

```yaml
services:
  your-app:
    # ... your service config
    ports:
      - "3000:80"  # external:internal
    # ... rest of config

# CRITICAL: Add this network config
networks:
  default:
    external: true
    name: proxy-net
```

### 10. Environment Variables
Create `.env` file in your project:
```bash
# Don't use port 80 externally - NPM owns it!
PORT=3000
DATABASE_URL=postgresql://user:pass@db:5432/dbname
# ... your other vars
```

## 🔥 Pro Tips

### SSH Key Setup
```bash
# Copy your SSH key to server for Git access (much simpler!)
scp -i ~/.ssh/id_yourkey ~/.ssh/id_yourkey* root@YOUR_SERVER_IP:~/.ssh/
ssh -i ~/.ssh/id_yourkey root@YOUR_SERVER_IP "chmod 600 ~/.ssh/id_yourkey"

# Pro tip: Add to ~/.ssh/config to avoid -i every time:
# Host hetzner
#     HostName YOUR_SERVER_IP
#     User root
#     IdentityFile ~/.ssh/id_yourkey
# Then just: ssh hetzner
```

### Port Management
- **Port 80/443:** NPM owns these (SSL/HTTP routing)
- **Port 81:** NPM admin interface  
- **Port 5001:** Dockge interface
- **Your apps:** Use 3000+, route through NPM

### Common Gotchas
1. **Whitespace in NPM fields** - trim all inputs!
2. **Container networking** - ALL projects need the proxy-net config
3. **Port confusion** - NPM talks to internal container ports
4. **DNS propagation** - can take up to 24 hours

### IP Lockout Recovery
If you lose access due to IP restrictions:

```bash
# SSH into server
ssh -i ~/.ssh/id_yourkey root@YOUR_SERVER_IP

# Access NPM database
cd /opt/nginx-proxy-manager/data
sqlite3 database.sqlite

# View access lists
.tables
SELECT * FROM access_list;

# Remove IP restrictions (nuclear option)
DELETE FROM access_list WHERE id = 1;  # or whatever ID
# OR update to allow all IPs temporarily
UPDATE access_list SET pass_auth = '[]' WHERE id = 1;

# Exit and restart NPM
.quit
cd /opt/nginx-proxy-manager
docker compose restart
```

**Prevention:** Add multiple IPs upfront (home, mobile, work) to avoid lockout!

## 🎉 Final Architecture

```
Internet → Cloudflare → Your Server
                        ├── NPM (80/443) → SSL termination
                        │   ├── yourdomain.com → your-app:80
                        │   ├── dockge.yourdomain.com → dockge:5001  
                        │   └── npm.yourdomain.com → npm:81
                        ├── Dockge (5001) → Stack management
                        └── Your Apps → Managed by Dockge
```

**Result:** Professional-grade Docker hosting with beautiful management interfaces and automatic SSL! 🚀

---

*This setup gives you enterprise-level infrastructure with hobby-level complexity!*