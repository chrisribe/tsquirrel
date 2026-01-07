# PhotoPipe: Image Processing Platform Vision

## The Gap in the Market

### What Exists Today

| Service | Resize/Transform | Storage/CDN | Detection/AI | One API |
|---------|------------------|-------------|--------------|---------|
| **Cloudinary** | ✅ Excellent | ✅ Yes | ❌ Basic only | ✅ |
| **Imgix** | ✅ URL-based | ❌ BYOS | ❌ No | ✅ |
| **AWS Rekognition** | ❌ No | ❌ No | ✅ Excellent | ⚠️ AWS only |
| **Google Vision** | ❌ No | ❌ No | ✅ Excellent | ⚠️ GCP only |
| **AWS S3 + Lambda** | ⚠️ DIY | ✅ Yes | ⚠️ DIY | ❌ Assembly required |

### The Problem

**Developers rebuilding the same pipeline everywhere:**

1. Accept upload → validate → store temporarily
2. Resize to multiple dimensions (thumb, display, original)
3. Extract metadata (EXIF, dimensions)
4. Store in S3/cloud with proper keys
5. Serve via CDN with correct headers
6. *Optionally:* Run detection (faces, text, objects)
7. Handle webhooks/callbacks when async processing completes

**Every project reinvents this.** EventGlimpse did. Every photo app does.

### The Gap

**Nobody offers: Upload → Resize → Store → Detect → CDN → Webhook as ONE simple API.**

- Cloudinary does resize + CDN but weak on detection
- Rekognition does detection but no storage/resize
- Rolling your own = weeks of Lambda/S3/queue setup

---

## PhotoPipe: The Vision

### One API Call

```bash
curl -X POST https://api.photopipe.io/v1/photos \
  -H "Authorization: Bearer pk_live_xxx" \
  -F "file=@photo.jpg" \
  -F "sizes[]=thumb:200x200" \
  -F "sizes[]=display:1200x1200" \
  -F "sizes[]=original:keep" \
  -F "detect[]=faces" \
  -F "detect[]=text" \
  -F "webhook=https://myapp.com/hooks/photo-ready"
```

### Response (immediate)

```json
{
  "id": "ph_abc123",
  "status": "processing",
  "estimated_seconds": 3
}
```

### Webhook (when complete)

```json
{
  "id": "ph_abc123",
  "status": "complete",
  "sizes": {
    "thumb": "https://cdn.photopipe.io/ph_abc123/thumb.jpg",
    "display": "https://cdn.photopipe.io/ph_abc123/display.jpg",
    "original": "https://cdn.photopipe.io/ph_abc123/original.jpg"
  },
  "metadata": {
    "width": 4032,
    "height": 3024,
    "taken_at": "2026-01-04T14:30:00Z",
    "camera": "iPhone 15 Pro",
    "gps": { "lat": 45.5017, "lng": -73.5673 }
  },
  "detection": {
    "faces": [
      { "box": [120, 80, 200, 200], "confidence": 0.97 }
    ],
    "text": [
      { "value": "BIB 4521", "box": [300, 400, 150, 50], "confidence": 0.94 }
    ]
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATIONS                         │
│         (EventGlimpse, Race Photos, Real Estate, Insurance)         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                               │
│                    api.photopipe.io/v1/*                            │
│          • Auth (API keys)  • Rate limiting  • Usage metering       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Upload   │   │   Query   │   │  Manage   │
            │  Service  │   │  Service  │   │  Service  │
            └─────┬─────┘   └───────────┘   └───────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          JOB QUEUE (SQS/Bull)                       │
│                    Async processing orchestration                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────┬───────────┼───────────┬─────────────┐
          ▼             ▼           ▼           ▼             ▼
    ┌──────────┐  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  Resize  │  │ Metadata │ │   Face   │ │   OCR    │ │  Custom  │
    │  Lambda  │  │  Lambda  │ │  Lambda  │ │  Lambda  │ │  Lambda  │
    └────┬─────┘  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
         │             │           │           │             │
         └─────────────┴───────────┴───────────┴─────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          STORAGE LAYER                              │
│     ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│     │     S3      │    │  PostgreSQL │    │    Redis    │          │
│     │   (files)   │    │  (metadata) │    │   (cache)   │          │
│     └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CDN (CloudFront)                            │
│                    cdn.photopipe.io/*                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Core Endpoints

```
POST   /v1/photos              Upload & process photo
GET    /v1/photos/:id          Get photo details & URLs
DELETE /v1/photos/:id          Delete photo and all sizes
GET    /v1/photos              List photos (paginated, filtered)

POST   /v1/collections         Create collection (like a gallery)
GET    /v1/collections/:id     Get collection with photos
POST   /v1/collections/:id/photos   Add existing photo to collection
```

### Detection Endpoints

```
POST   /v1/detect/faces        Run face detection on existing photo
POST   /v1/detect/text         Run OCR on existing photo
POST   /v1/detect/custom/:model   Run custom model
```

### Management Endpoints

```
GET    /v1/usage               Current billing period usage
GET    /v1/webhooks            List configured webhooks
POST   /v1/webhooks            Register webhook endpoint
```

---

## Detection Services (Plugins)

### Built-in

| Service | Use Case | Pricing Model |
|---------|----------|---------------|
| `faces` | Find faces, return bounding boxes | Per image |
| `faces.identify` | Match faces to known people | Per face matched |
| `text` | OCR - extract text from images | Per image |
| `text.bib` | Race bib number detection | Per image |
| `objects` | General object detection | Per image |
| `nsfw` | Content moderation | Per image |
| `exif` | Full EXIF extraction | Free (included) |

### Custom Models (Future)

```bash
# Train custom detector
curl -X POST https://api.photopipe.io/v1/models \
  -H "Authorization: Bearer pk_live_xxx" \
  -F "name=license-plates" \
  -F "training_images=@plates.zip" \
  -F "labels=@labels.json"
```

---

## Pricing Model

### Tiers

| Tier | Monthly | Uploads | Storage | Detection | Support |
|------|---------|---------|---------|-----------|---------|
| **Free** | $0 | 1,000 | 1 GB | 100 calls | Community |
| **Starter** | $29 | 10,000 | 10 GB | 1,000 calls | Email |
| **Pro** | $99 | 50,000 | 50 GB | 10,000 calls | Priority |
| **Scale** | $299 | 200,000 | 200 GB | 50,000 calls | Slack |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Dedicated |

### Overage

- Uploads: $0.005/image
- Storage: $0.10/GB/month
- Detection: $0.01/call
- Bandwidth: $0.08/GB

---

## Migration Path from EventGlimpse

### Phase 1: Extract Core (Current → 2 months)

1. **Separate Lambda processing** into standalone service
2. **Add API layer** in front of current upload flow
3. **Create API key system** (simple table: key, user_id, tier, usage)
4. **EventGlimpse becomes first customer** of its own API

### Phase 2: API Product (2-4 months)

1. **Developer portal** - API docs, key management, usage dashboard
2. **Webhook system** - Queue + delivery + retry logic
3. **SDKs** - JavaScript, Python, PHP (generated from OpenAPI spec)
4. **Detection plugins** - Face detection via Rekognition, OCR via Textract

### Phase 3: Scale (4-6 months)

1. **Multi-region** - US, EU storage options
2. **Custom models** - Let users train detectors
3. **Batch API** - Process thousands of images efficiently
4. **On-prem option** - Docker deployment for enterprise

---

## What You Already Have

From EventGlimpse, reusable today:

| Component | Status | Reuse? |
|-----------|--------|--------|
| S3 upload handling | ✅ Working | Direct |
| Lambda resize pipeline | ✅ Working | Direct |
| Metadata extraction (EXIF) | ✅ Working | Direct |
| PostgreSQL photo records | ✅ Working | Extend schema |
| CDN delivery | ✅ Working | Direct |
| User auth system | ✅ Working | Becomes "account" system |
| Gallery UI | ✅ Working | Demo/dogfood app |

**Estimated work to MVP API:** 4-6 weeks of focused development.

---

## Why This Could Win

1. **Developer pain is real** - Every photo app rebuilds this
2. **Simple beats flexible** - One API vs stitching AWS services
3. **Detection differentiator** - Cloudinary can't match Rekognition
4. **Sticky product** - Once integrated, switching costs are high
5. **Clear pricing** - Per-image is easy to understand and budget

---

## Risks

| Risk | Mitigation |
|------|------------|
| AWS cost volatility | Build margin into pricing; cache aggressively |
| Big player enters market | Move fast, focus on developer experience |
| Low initial adoption | Use EventGlimpse as proof; target niche (race photos) first |
| Detection accuracy complaints | Clear SLAs; option to use customer's own AWS account |

---

## Next Steps

1. **Validate demand** - Talk to 10 developers who've built photo features
2. **API spec first** - Write OpenAPI spec before code
3. **Prototype** - One weekend to wrap current Lambda in API Gateway
4. **Landing page** - "Photo processing API" with waitlist
5. **First beta customer** - Find one real project to integrate (not EventGlimpse)

---

## Summary

**EventGlimpse = Consumer product in crowded market.**

**PhotoPipe = Infrastructure product in underserved market.**

The photo processing pipeline you built for one app could serve thousands. The gap exists: Cloudinary for transforms OR Rekognition for detection, but nobody combines upload + resize + store + detect + CDN + webhooks into one developer-friendly API.

Ship the gallery app for friction testing. But the bigger opportunity might be the plumbing underneath.
