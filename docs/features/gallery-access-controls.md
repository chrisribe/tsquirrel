# Gallery Access Controls

## Context
Galleries use UUID-based "security through obscurity" — anyone with the link can view and upload. When users share galleries on social media (Facebook, etc.), this expands access beyond the intended event guests.

## Priority Features

### 1. Read-Only Toggle ⭐ HIGH PRIORITY
**Goal:** Allow gallery owners to disable uploads while keeping the gallery viewable.

**Use cases:**
- Event is over, no more photos needed
- Shared on social media, want to prevent random uploads
- Archive mode for completed events

**Implementation:**
- Add `is_read_only` boolean to galleries table
- Toggle in gallery settings or header
- Hide upload zone when read-only
- Return 403 on upload attempts with friendly message

### 2. Photographer Mode ⭐ HIGH PRIORITY
**Goal:** When gallery is read-only, allow trusted parties (photographers) to still upload via special URL.

**Use case:**
- Gallery shared on Facebook → read-only for viewers
- Photographer at event has special link → can upload
- Owner controls who gets upload access

**Implementation:**
- Owner generates "Photographer Code" from gallery settings
- URL: `/g/{uuid}/photographer` prompts for code
- Valid code grants upload permission for session
- Multiple codes possible (one per photographer)
- Codes can be revoked by owner

**UX Flow:**
1. Owner enables read-only on gallery
2. Owner clicks "Create Photographer Access"
3. System generates 6-char code (e.g., `PHO-X7K9`)
4. Owner shares code + URL with photographer
5. Photographer visits `/g/{uuid}/photographer`, enters code
6. Session unlocked for uploads

---

## Future Ideas (Backlog)

### 2. View-Only Share Links
Separate URLs for viewing vs uploading:
- `/g/{uuid}` — full access (QR code at event)
- `/g/{uuid}/view` — view-only (for social sharing)

### 3. Gallery Password/PIN
Optional PIN required for uploads:
- Owner sets 4-6 digit PIN
- Guests enter PIN once per session
- Displayed on QR code at event

### 4. Photo Approval Queue
Owner approves photos before they appear:
- New photos go to "pending" state
- Owner reviews in dashboard
- Approve/reject actions
- Good for public-facing galleries

### 5. Upload Time Window
Auto-disable uploads after time period:
- Set duration when creating gallery (24h, 48h, 1 week)
- Auto-switches to read-only after expiry
- Owner can extend or close early

### 6. Rate Limiting per Gallery
Per-gallery upload limits:
- Max uploads per IP per hour
- Max total photos per gallery
- Prevents flooding from viral shares

---

## Current Protections
- UUID-based URLs (hard to guess)
- Global rate limiting (IP-based)
- Owner can delete unwanted photos
- Galleries not indexed by search engines (robots.txt)

## Notes
- Keep friction low for legitimate guests
- Controls should be optional, not mandatory
- Default behavior remains "open" for ease of use
