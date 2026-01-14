# EventGlimpse

Simple photo sharing for events. Scan QR → Upload → Done.

## The Idea

At events (parties, weddings, BBQs), everyone takes photos but sharing is a pain:
- Google Photos is complicated for non-tech people
- Facebook compresses everything
- Dropbox requires accounts

**EventGlimpse:** Create a gallery, share a link (or QR code), guests upload without accounts.

## Quick Start

### 1. Setup environment
```bash
cp .env.example .env
# Add your AWS credentials for S3
# Optional: Set PUBLIC_URL for QR code testing (see below)
```

### 2. Start with Docker
```bash
# Linux/Mac
./scripts/start-dev.sh

# Or manually
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### 3. Create admin user
```bash
docker-compose exec server npm run create-admin
```

### 4. Use it
1. Go to http://localhost:3000
2. Sign in
3. Create a gallery (just a title)
4. Share the `/g/[uuid]` link
5. Anyone can upload photos

## Testing QR Codes Locally

QR codes won't work from `localhost:3000` on mobile devices. To test:

**Option 1: Use ngrok or similar**
```bash
ngrok http 3000
# Copy the https URL (e.g., https://abc123.ngrok.io)
```

**Option 2: Use production domain**
```bash
# In .env file:
PUBLIC_URL=https://event-glimpse.com
```

Then restart server:
```bash
docker-compose restart server
```

QR codes will now point to the PUBLIC_URL instead of localhost.

## Tech Stack

- Express.js + PostgreSQL
- AWS S3 for photo storage
- Lambda for auto-resizing (thumbs, display, originals)
- HTMX for interactions
- Pico CSS for styling

## Project Structure

```
├── server/
│   ├── controllers/GalleryController.js
│   ├── dao/GalleryDAO.js
│   ├── routes/galleries.js
│   ├── services/s3Service.js
│   ├── middleware/fileUploadMiddleware.js
│   └── views/galleries/
├── db/
│   ├── 01-init.sql          # Users, sessions
│   └── 02-galleries.sql     # Galleries, photos
└── infra/
    └── lambda-image-processor/  # (see EventglimpseORG)
```

## Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /galleries` | ✓ | List your galleries |
| `POST /galleries` | ✓ | Create gallery |
| `GET /g/:uuid` | Public | View gallery |
| `POST /g/:uuid/photos` | Public | Upload photos |
| `DELETE /g/:uuid/photos/:id` | Owner | Delete photo |

## License

MIT
