# EventGlimpse: Vertical SaaS Strategy

## What We Learned from Research

### Generic Photo API is Crowded
- Bytescale, ImageKit, Cloudinary, Uploadcare already do "upload → resize → CDN"
- The horizontal "photo infrastructure API" gap **does not exist**
- Competing with established players on generic features = losing strategy

### Event Photo Market Has Real Gap
- Small races/weddings/fundraisers underinvest in image management
- Existing platforms (Race Roster, RunSignup) are full solutions (registration + photos)
- **Gap:** Event organizers just want photos on their site, not a full platform
- Current pain: Dump photos into WordPress → slow site, no search, bad UX

### The Embed Widget is the Killer Feature
- Event organizers lack dev skills but control their own sites
- One `<script>` tag = instant searchable gallery on their domain
- Preserves branding, zero technical barrier
- Competitors force you to their platform or require dev work

---

## Revised Product Vision

### EventGlimpse: Drop-in Photo Galleries for Events

**One-line pitch:**
"Upload photos. Paste one line of code. Participants see a searchable gallery on your site."

**Target customer:**
- Race organizers (5K, marathons, triathlons)
- Wedding coordinators
- Fundraiser organizers
- Youth sports leagues
- Small event companies

**What they get:**
1. Upload endpoint or admin UI for bulk photo dumps
2. Automatic resize (thumb, display, original)
3. Fast CDN delivery
4. Bib number detection (races) or face grouping (weddings)
5. Embeddable widget for their WordPress/Squarespace/custom site
6. Participant search by bib, face, or keyword

---

## Product Features

### Core (MVP)
- **Bulk upload** - Drag folder of 500 photos, done
- **Auto-processing** - Resize, optimize, EXIF extraction
- **Embed widget** - `<script src="..." data-gallery-id="abc123"></script>`
- **Basic search** - Filter by upload date, filename
- **Download** - Individual or zip all

### Pro Features (Phase 2)
- **Bib detection** - OCR race numbers, auto-tag photos
- **Face grouping** - "Find photos of me" for participants
- **Custom branding** - White-label widget colors/logo
- **Paid downloads** - Monetize with Stripe integration (photographer use case)

### Enterprise (Phase 3)
- **Multi-event accounts** - Manage 50+ events/year
- **API access** - Integrate with registration platforms
- **Custom detection** - Train models for specific event types
- **Analytics** - Photo views, downloads, popular participants

---

## Embed Widget Spec

### Implementation
```html
<!-- Event organizer pastes into their site -->
<script src="https://cdn.eventglimpse.com/embed.js"></script>
<div data-eventglimpse-gallery="abc123-def456"></div>
```

### Widget Features
- **Photo grid** - Responsive masonry layout, lazy loading
- **Lightbox** - Click to view full-size with navigation
- **Search bar** - Filter by bib number (if detected), date, or keyword
- **Download button** - Individual photo or bulk zip
- **Mobile-first** - Works on phones (participants view at event)
- **Fast loading** - Serves from CloudFront, < 1s initial load

### Customization Options
```html
<div data-eventglimpse-gallery="abc123"
     data-theme="dark"
     data-search="true"
     data-download="false"
     data-columns="3">
</div>
```

---

## Competitive Analysis

### Direct Competitors

| Platform | What They Do | Price | Weakness |
|----------|-------------|-------|----------|
| **Race Roster** | Registration + photos | $200-500/event | Forces you onto their platform, expensive |
| **RunSignup** | Registration + photos | Similar | Same - full solution, not just photos |
| **GeoSnapShot** | Photo tagging by GPS | $200+/event | External gallery, not embedded |
| **Marathon Foto** | Professional race photos | Revenue share | For paid photo sales only, not free sharing |

### Indirect Competitors
- **Google Photos shared albums** - Free but no embedding, no bib search
- **Cloudinary + custom dev** - Requires developer, expensive for small events
- **WordPress plugins** - Slow, no CDN, no detection features

### Your Advantage
1. **Embedded on organizer's site** - Keeps branding, domain, SEO
2. **Zero dev required** - Paste one script tag
3. **Event-specific features** - Bib detection, face grouping built-in
4. **Predictable pricing** - Per event or flat monthly, not per-GB metrics
5. **Fast as hell** - CloudFront CDN, optimized images

---

## Pricing Strategy

### Tiers

| Tier | Price | Events | Photos | Features | Target |
|------|-------|--------|--------|----------|--------|
| **Free** | $0 | 1/month | 100 | Basic gallery, no detection | Test/small fundraiser |
| **Starter** | $29/mo | 5/month | 1,000 each | Basic search, email support | Youth sports, small races |
| **Pro** | $99/mo | Unlimited | 10,000 each | Bib detection, face grouping, custom branding | Marathon organizers, wedding coordinators |
| **Enterprise** | Custom | Unlimited | Unlimited | API access, white-label, dedicated support | Event companies, photo businesses |

### Alternative: Per-Event Pricing
- **Single event:** $49 (up to 2,000 photos)
- **Event pack:** $199 for 5 events
- **Annual:** $499 unlimited events (locks in customers)

**Insight from research:** Small organizers think in "events," not "gigabytes." Price accordingly.

---

## Go-to-Market Strategy

### Phase 1: Niche Domination (Months 1-3)
**Target:** Local running clubs and 5K races

**Why:** 
- Frequent events (weekly runs, monthly races)
- Existing pain (dumping photos in Facebook groups)
- Bib detection is instant value
- Word-of-mouth in tight community

**Tactics:**
1. Free tier for first 10 running clubs
2. Attend 3 local races, offer to manage photos for free
3. Case study: "XYZ Marathon cut photo delivery time from 3 days to 3 hours"
4. Sponsor local running Facebook groups

### Phase 2: Expand Verticals (Months 4-6)
**Target:** Weddings, youth sports, fundraisers

**Tactics:**
- SEO: "free wedding photo gallery," "race photo management"
- Integration partnerships: RunSignup, Race Roster API
- Affiliate program: Wedding photographers get 20% recurring
- Content: "How to share race photos without Facebook" guides

### Phase 3: Scale (Months 7-12)
**Target:** Event management companies, professional photographers

**Tactics:**
- Enterprise tier with API access
- White-label option for photographer brands
- Zapier/Make.com integrations
- Industry conferences (Running USA, ILEA wedding expos)

---

## Technical Architecture

### What You Already Have
✅ S3 upload + Lambda resize pipeline  
✅ PostgreSQL photo metadata  
✅ EXIF extraction  
✅ Gallery UI (becomes admin panel)  
✅ User auth (becomes organizer accounts)  

### What You Need to Build

**High Priority (Weeks 1-4):**
1. **Embed widget** - `embed.js` + API endpoint for gallery data
2. **Bib detection** - Tesseract.js or AWS Textract for OCR
3. **Bulk upload UI** - Drag 500 photos, progress bar, done
4. **Per-event galleries** - Separate gallery IDs, privacy controls

**Medium Priority (Weeks 5-8):**
5. **Search functionality** - Filter by bib, date, filename
6. **Download zip** - Generate on-demand, cache common requests
7. **Pricing tiers** - Stripe integration, usage limits
8. **Admin dashboard** - Organizer manages multiple events

**Low Priority (Months 3-6):**
9. **Face grouping** - AWS Rekognition integration
10. **Custom branding** - Widget theme customization
11. **Analytics** - Photo views, downloads per event
12. **API** - Programmatic access for integrations

---

## Success Metrics

### MVP Validation (Month 1)
- 5 event organizers using the product
- 3+ say "I would pay for this"
- 1,000+ photos uploaded
- Embed widget on 3+ external sites

### Product-Market Fit (Month 3)
- 25 paying customers
- $500+ MRR
- < 10% churn month-over-month
- 2+ organizers refer others

### Scale (Month 12)
- 500+ events hosted
- $10K+ MRR
- 50% of new sign-ups from referrals
- 1 enterprise customer using API

---

## Why This Works

### Validated Assumptions
✅ **Target underinvests in photos** - Research confirms small events dump into WordPress  
✅ **Embed widget removes friction** - No dev skills needed  
✅ **Vertical pricing makes sense** - Organizers think in events, not GB  
✅ **Bib detection is valuable** - Saves hours of manual tagging  

### Competitive Moats
1. **Event-specific UX** - Not generic, built for races/weddings
2. **Embed widget** - Harder to replicate than API
3. **Fast time-to-value** - Upload → embed in 5 minutes
4. **Network effects** - Participants tell other organizers

### Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cloudinary adds embed widget | Low | They target developers, not event organizers |
| Race platforms bundle photos for free | Medium | Focus on standalone event organizers, not platform users |
| Low willingness to pay | Medium | Generous free tier, prove value first |
| Bib detection accuracy issues | High | Clear disclaimers, manual tagging fallback |

---

## Next Steps

### Immediate (This Week)
1. ✅ Validate Perplexity research findings
2. 🔲 Talk to 3 race organizers about current photo workflow
3. 🔲 Prototype embed widget (static HTML + JS)
4. 🔲 Test bib detection with 10 sample race photos

### Short-Term (Weeks 2-4)
5. 🔲 Build MVP embed widget with real gallery data
6. 🔲 Implement bulk upload UI
7. 🔲 Add per-event gallery isolation
8. 🔲 Deploy to production, test at 1 real race

### Medium-Term (Months 2-3)
9. 🔲 Launch free tier, acquire 10 events
10. 🔲 Add bib detection
11. 🔲 Implement Stripe billing
12. 🔲 First paid customer

---

## Summary

**Don't build:** Generic PhotoPipe API competing with Cloudinary/Bytescale

**Do build:** EventGlimpse vertical SaaS for event photo galleries

**Unique value:** Embed widget + bib detection + event-specific UX + predictable pricing

**Target:** Small event organizers (races, weddings, fundraisers) who lack dev skills

**Moat:** Not the tech (resize/CDN), but the vertical focus and distribution (embed widget on customer sites)

**Path to $10K MRR:** 100 events at $99/mo or 200 events at $49/event

You're 70% there. The infrastructure exists. Pivot from generic gallery to vertical event solution with embed widget.
