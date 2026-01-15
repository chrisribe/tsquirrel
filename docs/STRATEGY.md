# EventGlimpse Strategy

## What EventGlimpse IS

**One-line:** Friction-free photo sharing for events.

**The product:** Upload photos → Get QR code → Guests view/download on their phones.

**Target users:** Anyone hosting an event who wants to share photos without:
- Creating Facebook albums everyone has to join
- Texting photos individually
- Paying for expensive photo services

**Emerging segment: Event photographers** using clunky tools (Blueberry → AWS) who need:
- Bulk upload (folder support, 2-4k images)
- Auto-resize without manual processing
- Instant QR sharing
- Duplicate detection (saves bandwidth/storage)

---

## Current State (January 2026)

### ✅ Working Features
- User registration/login
- Create galleries with auto-generated QR codes
- Upload photos (auto-resize via Lambda)
- Share gallery via QR code or link (Facebook, copy link)
- View photos in responsive grid
- Lightbox with navigation
- Download individual photos (CDN-backed)
- Delete photos (owner only)
- Edit gallery title
- **Upload queue** - Unlimited photos, folder upload, 2 parallel uploads
- **Session-based delete** - Anonymous users can delete their own mistakes
- **Mobile hamburger menu** - CSS-only dropdown, fixed touch interactions
- **Compact upload UI** - Less intrusive, more photo space
- **Pre-upload hash check** - Skip duplicate uploads entirely (saves bandwidth)
- **Gallery/photo limits** - Free tier enforced with user feedback
- **EXIF date sorting** - Photos sorted by taken_at from EXIF data
- **ZIP download** - Bulk download all photos (gated behind paid tier)

### 🔧 Just Fixed (Jan 15 Session)
- **ZIP download** - Bulk download all gallery photos, unlocks with paid tier
- Tier system refactored: Moved from galleries to users table (one payment covers all galleries)
- Admin tier management: Dropdown to change user tier directly
- Admin abuse review: View all galleries for any user with photo counts
- Admin dashboard: Shows gallery/photo counts per user

### 🔧 Previously Fixed (Jan 4-6 Session)
- Homepage redesign: Hero section with coral gradient, Inter font, sticky header
- App-like nav: Pill-shaped CTA buttons, "How it works" section
- Share modal UX: Larger QR code (280x280), full-width copy button, keyboard support
- Lightbox: Uses display image directly, better error handling
- Cache busting: ASSET_VERSION system for CSS/JS
- Admin dashboard: Responsive card layout for mobile
- Problem/solution section on homepage

### ⏳ Not Yet Built
- Payment/billing (Stripe Checkout - simple payment links)
- Gallery expiration enforcement (7 days free, 90 days paid)

---

## Path to Revenue

### Phase 1: Validate Willingness to Pay (Now → 2 weeks)

**Goal:** 5 people use it for real events, 2+ say "I'd pay for this"

**Actions:**
1. Use it yourself at a real event
2. Offer free to 3-5 friends/family hosting events
3. Collect feedback: What's missing? Would you pay?

**No code changes needed** - current MVP is sufficient for validation.

### Phase 2: Add Payment (2-4 weeks)

**Goal:** First paying customer

**Build:**
1. Usage limits (free tier enforced)
2. Stripe Checkout (simple payment link, no subscriptions)
3. ZIP download unlock after payment

**Pricing (impulse-buy model):**
| Tier | Price | Galleries | Photos | Duration | ZIP Download |
|------|-------|-----------|--------|----------|--------------|
| Free | $0 | 1 | 50 | 7 days | ❌ |
| Event | $5 | 2 | 500 | 90 days | ✅ |
| Party Pack | $12 | 5 | 500 each | 90 days | ✅ |

**Why $5:**
- Impulse buy territory - no decision friction
- Below "ask permission" threshold
- Storage costs stay low with 90-day expiry
- Big fish (Pixieset, GuestPix) can't serve this market profitably

### Phase 3: Growth (Month 2-3)

**Goal:** $500/month (100 Event purchases or ~42 Party Packs)

**Actions:**
- SEO: "free event photo sharing", "party photo QR code"
- Content: "How to share wedding photos without Facebook"
- Local: Offer to photograph/manage photos at community events

---

## What We're NOT Building (Yet)

These ideas came from research but are **future features**, not MVP:

| Feature | Why Defer |
|---------|-----------|
| **Embed widget** | Requires different customer (web developers/organizers with sites) |
| **Bib detection** | Niche (races only), adds complexity |
| **Face grouping** | Expensive (Rekognition), privacy concerns |
| **PhotoPipe API** | Market already saturated (Cloudinary, ImageKit, Bytescale) |

**Rule:** No new features until 10 paying customers.

---

## Competitive Position

### Primary Competitor: GuestPix

GuestPix ($1K → $5M revenue, 150K+ events, 100 countries) is the polished market leader.

| Feature | GuestPix | EventGlimpse | Status |
|---------|----------|--------------|--------|
| QR Code + Private Link | ✅ | ✅ | Parity |
| No app/registration for guests | ✅ | ✅ | Parity |
| Photo upload | ✅ | ✅ | Parity |
| Full resolution download | ✅ | ✅ | Parity |
| Auto-resize for display | ✅ | ✅ | Parity |
| **Duplicate detection** | ❌ | ✅ | **Advantage** |
| **Bulk ZIP download** | ✅ | ❌ | **Gap - Priority** |
| Video upload | ✅ | ❌ | Gap |
| Video guestbook | ✅ | ❌ | Gap |
| Written guestbook | ✅ | ❌ | Gap |
| Live slideshow | ✅ | ❌ | Gap |
| Guest name capture | ✅ | ❌ | Gap |
| Custom welcome screen | ✅ | ❌ | Gap |
| Design themes | ✅ | ❌ | Gap |
| Albums (multiple per event) | ✅ | ❌ | Gap |
| Canva templates (180+) | ✅ | ❌ | Defer |
| Multi-language | ✅ | ❌ | Defer |

### Other Competitors
| Product | Price | Weakness |
|---------|-------|----------|
| Google Photos shared album | Free | No QR, requires Google account |
| The Guest (TheKnot) | Free | Wedding-only, pushes app |
| Capsule | $100+ | Expensive for casual events |

### EventGlimpse Advantage
- **No app required** - works in browser
- **No account for guests** - just scan and view
- **Simple pricing** - not per-GB confusion (GuestPix has complex tiers)
- **Fast** - CDN delivery, optimized images
- **Duplicate detection** - GuestPix doesn't have this

---

## Technical Priorities

### Must Fix (Before Charging Money)
1. ✅ Download actually downloads
2. ✅ Pre-upload hash check (duplicate detection)
3. ✅ Gallery/photo limits for free tier
4. ✅ **Bulk ZIP download** - unlocks with paid tier
5. ⬜ **Stripe Checkout** - simple payment link, webhook to unlock
6. ⬜ Gallery expiration (7 days free / 90 days paid)

### Phase 2 (Close Feature Gap)
- Guest name capture on upload
- Video upload support
- Live slideshow mode
- Written guestbook

### Phase 3 (Polish)
- Design themes/customization
- Albums/sub-galleries
- Analytics (views per gallery)
- Email notifications

---

## Success Metrics

| Milestone | Target | Timeline |
|-----------|--------|----------|
| Real event usage | 5 events | 2 weeks |
| "Would pay" validation | 3 people | 2 weeks |
| First payment | $5 | 3 weeks |
| $50/month | ~10 purchases | 6 weeks |
| $500/month | ~100 purchases | 3 months |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-15 | Move tier from galleries to users | One payment covers all user galleries, simpler model |
| 2026-01-15 | Admin gallery review | Abuse detection - view all galleries per user |
| 2026-01-09 | Pivot to $5 impulse pricing | Bottom-of-market strategy - serve casual hosts big fish ignore |
| 2026-01-09 | 90-day gallery expiry | Keeps storage costs low, creates urgency |
| 2026-01-09 | No subscriptions | One-time payments = no churn, simpler billing |
| 2026-01-07 | ZIP download is #1 priority | GuestPix analysis - biggest feature gap blocking revenue |
| 2026-01-06 | Implement gallery/photo limits | Free tier: 1 gallery, 100 photos - enforces upgrade path |
| 2026-01-05 | Pre-upload hash check | Skip duplicate uploads entirely, saves bandwidth/storage |
| 2026-01-05 | Homepage redesign | Hero + "How it works" section, coral brand color, Inter font |
| 2026-01-05 | EXIF date sorting | Photos sorted by taken_at for chronological order |
| 2026-01-04 | Skip PhotoPipe API | Research showed Bytescale/ImageKit/Cloudinary own that market |
| 2026-01-04 | Skip embed widget for MVP | Different customer segment, adds complexity |
| 2026-01-04 | Focus on simple event sharing | Validate core value prop before adding features |
| 2026-01-04 | Price per-event not per-GB | Customers think in events, not storage |
| 2026-01-04 | Add folder upload + queue | Photographers upload 2-4k images, need bulk workflow |
| 2026-01-04 | Session-based delete for guests | Reduces friction, lets people fix mistakes without bothering owner |

---

## Files to Archive

These docs were useful for exploration but are now superseded:

- `PLATFORM-VISION.md` → PhotoPipe idea (abandoned)
- `PHOTOPIPE-RD-RESEARCH.md` → Research for abandoned pivot
- `EVENTGLIMPSE-VERTICAL.md` → Future features, not MVP

Keep for reference but **this file (STRATEGY.md) is the source of truth**.
