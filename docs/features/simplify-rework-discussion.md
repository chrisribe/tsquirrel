# EventGlimpse Simplify-Rework Discussion

> Status: MVP BUILT - READY FOR DEPLOY
> Created: 2024-12-14
> Updated: 2026-01-02
> Context: Extracted express-mvc-starter, trimmed EventGlimpse to friction-free MVP

## The Question

**Trim EventGlimpse in-place** vs **Start fresh from express-mvc-starter and port the good parts**?

---

## Option A: Trim EventGlimpse In-Place

### Pros
- S3 integration already works
- Lambda image processor already deployed
- Gallery views already functional
- Less context switching - stay in this repo
- Git history preserved

### Cons
- Cruft accumulates (deleted code still in history)
- Temptation to "keep just one more thing"
- Current schema has unnecessary columns
- Mental baggage - hard to think fresh

### Work Involved
```
DELETE:
├── server/views/events/story-page.ejs (300 lines) - defer
├── server/views/events/event-edit-modal.ejs (150 lines) - simplify  
├── server/controllers/EventsController.js - strip 60%
├── server/dao/EventsDAO.js - strip search, counts
└── QR code generation code

SIMPLIFY:
├── events table - drop: category, capacity, status, organizer, tags
├── Event model - minimal fields
└── Event forms - just title + date
```

**Estimated effort:** 2-3 hours of careful deletion

---

## Option B: Start Fresh from express-mvc-starter

### Pros
- Clean slate - only what you need
- express-mvc-starter is proven working
- Forces you to be intentional about each addition
- Fresh schema design
- Clean git history

### Cons
- Need to re-integrate S3 service (~130 lines)
- Need to re-integrate upload middleware (~100 lines)
- Need to recreate gallery template (~80 lines)
- Lambda stays separate anyway
- Context switch to new repo

### Work Involved
```
COPY FROM EventGlimpse:
├── server/services/s3Service.js (130 lines)
├── server/middleware/fileUploadMiddleware.js (100 lines)
├── server/views/events/gallery-page.ejs (80 lines, simplified)
├── server/static/css/gallery.css
├── server/static/js/gallery.js
└── infra/lambda-image-processor/ (or reference existing)

CREATE NEW:
├── db/02-galleries.sql (minimal schema)
├── server/routes/galleries.js
├── server/controllers/GalleryController.js
└── server/dao/GalleryDAO.js
```

**Estimated effort:** 3-4 hours of intentional building

---

## Code Inventory Comparison

### What EventGlimpse Has Now
| Component | Lines | MVP Needed? |
|-----------|-------|-------------|
| EventsController.js | 350 | ~150 (40%) |
| EventsDAO.js | 250 | ~100 (40%) |
| s3Service.js | 130 | 130 (100%) |
| fileUploadMiddleware.js | 100 | 100 (100%) |
| gallery-page.ejs | 80 | 80 (100%) |
| story-page.ejs | 300 | 0 (defer) |
| event-edit-modal.ejs | 150 | ~40 (25%) |
| event-item.ejs | 120 | ~50 (40%) |
| events-list.ejs | 50 | 50 (100%) |
| Event.js model | 50 | ~20 (40%) |
| Lambda processor | 200 | 200 (100%) |
| **Total** | **~1,780** | **~970 (55%)** |

### What express-mvc-starter Has
- Auth system ✅
- User management ✅
- Session handling ✅
- Docker setup ✅
- HTMX integration ✅
- Layout system ✅

**Missing for gallery MVP:** ~400 lines of EventGlimpse-specific code

---

## Simplified MVP Scope (Either Approach)

### User Flow
```
1. Creator logs in (existing auth)
2. Creator clicks "New Gallery" 
3. Enters: Title, optional description
4. Gets: UUID link + QR code (defer QR to v2?)
5. Shares link with guests

Guests:
1. Visit /g/{uuid}
2. See photo grid
3. Click "Add Photos"
4. Select files → uploads to S3
5. See photos appear in gallery
```

### Minimal Schema
```sql
CREATE TABLE galleries (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP  -- optional: auto-cleanup
);

CREATE TABLE photos (
    id SERIAL PRIMARY KEY,
    gallery_uuid UUID REFERENCES galleries(uuid) ON DELETE CASCADE,
    photo_id UUID DEFAULT uuid_generate_v4() NOT NULL,
    s3_key VARCHAR(512) NOT NULL,
    width INTEGER,
    height INTEGER,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Routes
```
GET  /galleries              - List my galleries (auth)
POST /galleries              - Create gallery (auth)
GET  /g/:uuid                - Public gallery view
POST /g/:uuid/photos         - Upload photos (public!)
DELETE /g/:uuid/photos/:id   - Delete photo (owner only)
```

---

## My Recommendation

**Option B: Start Fresh** - but not in a new repo.

Here's why:

1. **Create a fresh branch** from express-mvc-starter, not EventGlimpse
2. **Copy only the S3/upload code** you need (~330 lines)
3. **Rename "events" to "galleries"** - clearer mental model
4. **Build minimal CRUD** - forces simplicity
5. **Keep Lambda as-is** - it works, don't touch it

### Alternative: Option A+ (Trim Aggressively)

If you want to stay in this repo:
1. Create branch `mvp-simplified`
2. **Delete first, code later**
3. Rename events → galleries in schema
4. Strip to 5 routes max

---

## Questions to Decide

1. **Repo preference?** 
   - Stay in EventGlimpse repo (history, familiarity)
   - Start in express-mvc-starter repo (clean slate)

2. **Feature scope - what's truly MVP?**
   - [ ] Gallery creation with title only
   - [ ] Public upload (no guest auth)
   - [ ] Photo grid view
   - [ ] Owner can delete photos
   - [ ] QR codes (v1 or defer?)
   - [ ] Expiring galleries (v1 or defer?)

3. **Naming?**
   - Keep "EventGlimpse" brand
   - Rename to something gallery-focused
   - Keep "events" in code or rename to "galleries"

---

## DECISION: Final Simple Go (Dec 14, 2025)

**Approach:** Trim in-place (stay in EventGlimpse repo)  
**Goal:** Reduce friction to test at ONE real event  
**Time budget:** 2-3 hours max  
**Success metric:** 3+ non-you people upload without being asked twice

### The Friction Problem
> "was ok but you had to want to push the pics there"

Current friction points:
1. URL is hard to share/type
2. Gallery has too much UI chrome
3. Upload button not obvious enough
4. No immediate "it worked" feedback

### Ship-in-One-Session Scope

**KEEP (works, don't touch):**
- [ ] S3 upload pipeline
- [ ] Lambda image processing  
- [ ] UUID-based gallery URLs
- [ ] Basic photo grid

**SIMPLIFY:**
- [ ] Strip event form to: Title only (date auto = now)
- [ ] Gallery page: Giant "Add Photos" button, minimal chrome
- [ ] Remove: story view, edit modal complexity, search, categories

**ADD (small but high impact):**
- [ ] QR code displayed prominently on gallery page
- [ ] "X photos uploaded" live counter
- [ ] Upload success toast/animation

**DEFER (v2 if test succeeds):**
- Expiring galleries
- Download all as zip
- Slideshow mode
- Any auth for guests

### Execution Plan

```
Branch: mvp-friction-test

1. Strip event creation form (30 min)
   - Title only, auto-date
   - Immediate redirect to gallery

2. Simplify gallery-page.ejs (45 min)
   - Remove extra UI
   - Giant floating "+" button
   - Show QR code inline

3. Add upload feedback (30 min)
   - Photo count updates live
   - Success animation

4. Test locally with real S3 (30 min)

5. Deploy to Hetzner (30 min)

6. Print QR code, use at next event
```

### After the Test

**If 3+ people upload unprompted:**
- Worth continuing
- Add features based on what people actually wanted

**If not:**
- Archive with `LESSONS-LEARNED.md`
- Keep express-mvc-starter as the win
- Let domain expire guilt-free

---

## Next Steps

```
[x] Decide: Trim in-place ✓
[x] Decide: MVP = friction reduction ✓
[x] Create branch: mvp-friction-test ✓
[x] Execute plan ✓
[ ] Deploy to Hetzner
[ ] Use at real event
[ ] Evaluate results honestly
```

---

## Progress Log

### Jan 2, 2026 - Session Fixes & Polish

**Fixes:**
- ✅ HTMX login form - now returns HTML fragments (not full page)
- ✅ AuthController - proper HX-Redirect header for login success
- ✅ Footer branding - "Your App" → "EventGlimpse"
- ✅ Page title - "App" → "EventGlimpse"
- ✅ Homepage conditional - logged-in users see "Go to My Galleries" vs sign-in buttons
- ✅ Get Started button - now goes to /register (was double login link)
- ✅ Spinner issue - ⏳ now hides when image loads (CSS `:has()` selector)
- ✅ Lightbox - now shows original full-size image (was 800px display version)
- ✅ Download button - smaller, subtle, bottom-right corner (was obstructing photos)

**Styling:**
- ✅ Warm coral theme (#e17055) - replaced corporate blue
- More "party/event" feel vs "enterprise tool"

**Developer Experience:**
- ✅ create-admin.js - upsert pattern (creates OR resets password)
- ✅ scripts/start-dev.sh - `--reset-admin` flag for convenience
- ✅ Backported fixes to express-mvc-starter repo

**Known Issues:**
- Lambda display size is 800px (but we now use originals in lightbox, so OK)
- infra/ folder removed from this branch (Lambda code in EventglimpseORG repo)

### Dec 14-15, 2025 - MVP Built

**Branch:** `mvp-friction-test` (previously `claude-gallery-experience`)

**Completed:**
- ✅ Fresh start from express-mvc-starter base
- ✅ Simplified gallery schema (`galleries` + `photos` tables)
- ✅ S3 service integration (upload, delete, URL generation)
- ✅ File upload middleware with image dimensions
- ✅ GalleryDAO + GalleryController
- ✅ Gallery routes (auth + public)
- ✅ Gallery views (list, view, photo items partial)
- ✅ Gallery CSS + JS
- ✅ Image retry logic for Lambda processing delay
- ✅ Lightbox for full-size viewing
- ✅ Photo delete (owner only, hover to reveal)
- ✅ Duplicate detection via MD5 hash
- ✅ User feedback for duplicates (HX-Trigger pattern)
- ✅ Toast notifications (smooth fade in/out)
- ✅ HTMX logout (no button styling issues)

**UI Polish:**
- Gallery list: Simple rows with title + photo count
- Gallery view: Big upload button, photo grid, photo counter
- Delete buttons: Red × on hover (consistent across photos + galleries)
- Nav: Clean alignment, logout as link

**Database:**
- `galleries`: id, uuid, user_id, title, created_at
- `photos`: id, gallery_uuid, photo_id, s3_key, width, height, uploaded_at, file_hash
- Migration: `03-photo-hash.sql` for duplicate detection

**Files Created/Modified:**
```
server/
├── controllers/GalleryController.js
├── dao/GalleryDAO.js
├── routes/galleries.js
├── services/s3Service.js
├── middleware/fileUploadMiddleware.js
├── static/css/gallery.css
├── static/js/gallery.js
└── views/galleries/
    ├── list-page.ejs
    ├── view-page.ejs
    └── photo-items.ejs

db/
├── 02-galleries.sql
└── 03-photo-hash.sql
```

### What's Ready
- App runs locally at localhost:3000
- S3 uploads work (bucket: eventglimpse, region: us-east-1)
- Lambda processes images to thumbs/display/originals
- Admin user: cribe (password reset via create-admin script)
- Warm coral theme applied
- All HTMX interactions working properly

### Next Session: Deploy
1. Push branch to GitHub
2. Deploy to Hetzner server
3. Test with real URL
4. Generate QR code for gallery link
5. **Use at real event** - success = 3+ people upload unprompted

---

## Notes

- express-mvc-starter already published: https://github.com/chrisribe/express-mvc-starter
- Lambda image processor is deployed and working
- S3 bucket structure: `uploads/`, `thumbs/`, `display/`, `originals/`

<!-- CTX: eventglimpse|simplify|decision|discussion -->
