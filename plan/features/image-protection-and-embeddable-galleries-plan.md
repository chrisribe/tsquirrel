# Image Protection & Embeddable Galleries Implementation Plan

> **Status**: Draft  
> **Estimated Effort**: 8-10 days
> **Priority**: High (Security/Cost Impact)

## What to Build

A comprehensive image protection system to prevent hotlinking abuse and bandwidth theft, with future support for authorized embeddable galleries for pro users.

**Success Criteria:**
- [ ] Images cannot be hotlinked/embedded on unauthorized websites
- [ ] EventGlimpse maintains full control over image access
- [ ] Bandwidth costs from unauthorized usage are eliminated
- [ ] Foundation laid for future embeddable gallery widgets
- [ ] No disruption to current legitimate gallery functionality

## Problem Analysis

**Current Issues:**
- S3 bucket has public read access allowing direct hotlinking
- Server CORS policy allows all origins (`app.use(cors())`)
- Direct S3 URLs enable bandwidth abuse: `https://eventglimpse.s3.amazonaws.com/...`
- No referer restrictions or access controls
- Potential significant AWS costs from unauthorized usage

**Impact Assessment:**
- **Cost Risk**: High - Unlimited bandwidth usage by external sites
- **Security Risk**: Medium - Public access to all event images
- **Performance Risk**: Low - Current CDN performance maintained
- **User Experience Risk**: Low - No change to legitimate usage

## Technical Approach Research

### Option 1: Cloudflare Proxy with Hotlink Protection (RECOMMENDED)
**Implementation:** Route EventGlimpse through Cloudflare with built-in hotlink protection
**Features:**
- Native hotlink protection rules
- DDoS and bot protection
- Rate limiting and security analytics
- Global CDN performance
**Pros:** Professional protection, cost-effective ($0-20/month), easy setup, comprehensive security
**Cons:** External dependency, DNS changes required, less customization than server-side

### Option 2: S3 Bucket Policy with Referer Restrictions
**Implementation:** Update S3 bucket policy to only allow requests from eventglimpse.com
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::eventglimpse/*",
      "Condition": {
        "StringLike": {
          "aws:Referer": [
            "https://eventglimpse.com/*",
            "https://*.eventglimpse.com/*"
          ]
        }
      }
    }
  ]
}
```
**Pros:** Simple, immediate, cost-effective, minimal code changes
**Cons:** Referer headers can be spoofed, may break direct image access, some browsers/tools don't send referer

### Option 3: CloudFront Distribution with Custom Headers
**Implementation:** Route S3 through CloudFront with custom origin headers
**Pros:** Professional CDN, better performance, more security options, geo-distribution
**Cons:** Additional AWS costs, more complex setup, potential latency during setup

### Option 4: Proxy Images Through EventGlimpse Server
**Implementation:** Serve images through Express routes with access control
**Pros:** Full control, custom logic possible, can implement any restrictions
**Cons:** Increased server load, bandwidth costs shifted to app server, potential performance impact

### Option 5: S3 Presigned URLs with Time-based Access
**Implementation:** Generate time-limited signed URLs for image access
**Pros:** Highly secure, granular control, prevents long-term hotlinking
**Cons:** Complex implementation, URLs expire requiring refresh, breaks direct linking

## Recommended Approach: Cloudflare-First Strategy

**Phase 1:** Implement Cloudflare hotlink protection (immediate professional solution)
**Phase 2:** Add server-side image access controls for fine-grained permissions
**Phase 3:** Build embeddable widget system leveraging both Cloudflare and server controls

## EventGlimpse Integration

**Architecture Layers Affected:**
- **Infrastructure**: S3 bucket policy, potential CloudFront setup
- **Services**: New ImageAccessService for access control logic
- **Controllers**: Enhanced EventsController for image serving
- **Routes**: New protected image serving endpoints
- **Middleware**: CORS configuration updates
- **Database**: New tables for authorized domains and access logs

**Database Changes:**
```sql
-- Phase 2: Access control tables
CREATE TABLE authorized_domains (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    active BOOLEAN DEFAULT true
);

-- Phase 3: Embeddable widget tracking
CREATE TABLE embed_widgets (
    id SERIAL PRIMARY KEY,
    widget_id UUID UNIQUE DEFAULT gen_random_uuid(),
    event_uuid UUID REFERENCES events(uuid),
    authorized_domain_id INTEGER REFERENCES authorized_domains(id),
    widget_config JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    active BOOLEAN DEFAULT true
);

-- Access logging for monitoring
CREATE TABLE image_access_logs (
    id SERIAL PRIMARY KEY,
    photo_id UUID,
    event_uuid UUID,
    referer VARCHAR(500),
    user_agent VARCHAR(500),
    ip_address INET,
    access_type VARCHAR(50), -- 'direct', 'widget', 'hotlink_blocked'
    accessed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_authorized_domains_domain ON authorized_domains(domain);
CREATE INDEX idx_embed_widgets_event_uuid ON embed_widgets(event_uuid);
CREATE INDEX idx_image_access_logs_accessed_at ON image_access_logs(accessed_at);
```

**API Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/images/:eventUuid/:photoId/:size` | Protected image serving |
| GET | `/api/embed/widget/:widgetId` | Embeddable widget HTML/JS |
| POST | `/api/admin/domains` | Manage authorized domains |
| GET | `/api/admin/access-logs` | View access analytics |

## File Plan

**New Files:**
- `/server/services/ImageAccessService.js` - Core access control logic
- `/server/controllers/ImageController.js` - Protected image serving
- `/server/routes/images.js` - Image access routes
- `/server/routes/embed.js` - Embeddable widget routes
- `/server/middleware/imageAccess.js` - Access control middleware
- `/server/views/embed/widget.ejs` - Embeddable widget template
- `/db/15-image-protection.sql` - Database migration
- `/infra/s3-bucket-policy-update.json` - Updated bucket policy

**Modified Files:**
- `/server/server.js` - Update CORS config, add image routes
- `/server/services/s3Service.js` - Add protected URL generation
- `/server/controllers/EventsController.js` - Use protected image URLs
- `/infra/lambda-image-processor/S3-SETUP.md` - Updated setup instructions

## Cloudflare Integration Considerations

**DNS Configuration:**
- EventGlimpse.com nameservers point to Cloudflare
- Cloudflare proxies traffic to current hosting (maintain existing server setup)
- SSL/TLS certificates managed by Cloudflare (free)

**Cloudflare Rules Configuration:**
```
# Hotlink Protection Rule
If (http.referer ne "eventglimpse.com" and http.referer ne "*.eventglimpse.com" and http.request.uri.path contains "/images/")
Then Block

# Rate Limiting Rule  
If (http.request.uri.path contains "/images/")
Then Rate Limit: 100 requests per minute per IP

# Bot Protection Rule
If (cf.bot_management.score lt 30 and http.request.uri.path contains "/images/")
Then Managed Challenge
```

**Performance Benefits:**
- Global CDN caching reduces S3 bandwidth costs
- Image optimization through Cloudflare Polish (paid feature)
- Brotli compression for faster loading
- HTTP/3 and QUIC support for modern browsers

**Cost Analysis with Cloudflare:**
- **Free Plan**: Suitable for basic hotlink protection and DDoS protection
- **Pro Plan ($20/month)**: Adds Polish image optimization, advanced analytics
- **Business Plan ($200/month)**: Priority support, advanced WAF rules, custom SSL
- **Recommendation**: Start with Pro plan for image optimization benefits

## Implementation Phases

### Phase 1A: Cloudflare Protection (RECOMMENDED - 1 day)
**Goal:** Professional hotlink protection with comprehensive security

- [ ] **Set Up Cloudflare Account**
  - [ ] Add eventglimpse.com domain to Cloudflare
  - [ ] Update DNS nameservers to Cloudflare
  - [ ] Verify domain ownership and SSL setup
  - [ ] Test website functionality through Cloudflare

- [ ] **Configure Hotlink Protection**
  - [ ] Enable Cloudflare hotlink protection rules
  - [ ] Create custom rule: Block if referer not eventglimpse.com/*
  - [ ] Test protection blocks external embedding
  - [ ] Verify legitimate gallery access still works

- [ ] **Enable Security Features**
  - [ ] Configure rate limiting for image paths (/api/images/*, *.jpg, *.png)
  - [ ] Enable Bot Fight Mode for automated abuse detection
  - [ ] Set up security level and challenge page
  - [ ] Enable DDoS protection and firewall rules

- [ ] **Configure Analytics**
  - [ ] Set up Cloudflare Analytics dashboard
  - [ ] Configure security event notifications
  - [ ] Monitor blocked requests and abuse attempts
  - [ ] Document security metrics and alerts

**Test Criteria:** External sites cannot embed EventGlimpse images, bot traffic blocked, analytics show protection working

### Phase 1B: Alternative S3 Protection (If Cloudflare not preferred - 2-3 days)
**Goal:** Stop current hotlinking abuse using AWS-only solution

- [ ] **Update S3 Bucket Policy**
  - [ ] Create referer-restricted bucket policy
  - [ ] Test policy with EventGlimpse domain
  - [ ] Deploy policy to production bucket
  - [ ] Monitor CloudWatch logs for blocked requests

- [ ] **Update CORS Configuration**
  - [ ] Replace `app.use(cors())` with specific origin restrictions
  - [ ] Allow EventGlimpse domains only
  - [ ] Test gallery functionality still works
  - [ ] Update documentation

- [ ] **Add Basic Monitoring**
  - [ ] Create CloudWatch dashboard for S3 access metrics
  - [ ] Set up alerts for unusual traffic patterns
  - [ ] Document monitoring setup

**Test Criteria:** External sites cannot embed EventGlimpse images, legitimate gallery access works

### Phase 2: Enhanced Server Controls (3-4 days)
**Goal:** Add robust access control with fallback protection

- [ ] **Create Image Access Service**
  - [ ] Implement `ImageAccessService.js` with access control logic
  - [ ] Add referer validation, rate limiting
  - [ ] Create access logging functionality
  - [ ] Add unit tests for access control logic

- [ ] **Protected Image Routes**
  - [ ] Create `/server/routes/images.js` for protected serving
  - [ ] Implement `ImageController.js` with access controls
  - [ ] Add caching headers for performance
  - [ ] Handle different image sizes (thumb, display, original)

- [ ] **Database Migration**
  - [ ] Run migration to create access control tables
  - [ ] Seed authorized_domains with EventGlimpse domains
  - [ ] Set up proper indexes and constraints

- [ ] **Update Gallery Integration**
  - [ ] Modify EventsController to use protected image URLs
  - [ ] Update gallery templates to use new endpoints
  - [ ] Test all gallery functionality
  - [ ] Ensure backward compatibility

**Test Criteria:** Images served through protected routes, access logged, unauthorized access blocked

### Phase 3: Admin Controls & Analytics (2-3 days)
**Goal:** Provide tools for managing access and monitoring usage

- [ ] **Admin Dashboard**
  - [ ] Create authorized domains management interface
  - [ ] Add access logs viewing with filters
  - [ ] Implement domain validation and testing tools
  - [ ] Add usage analytics and charts

- [ ] **Enhanced Security**
  - [ ] Add rate limiting per IP/domain
  - [ ] Implement temporary access tokens for sharing
  - [ ] Add user-level domain authorization
  - [ ] Create admin role permissions

- [ ] **Monitoring & Alerts**
  - [ ] Implement real-time access monitoring
  - [ ] Add alerts for suspicious access patterns
  - [ ] Create bandwidth usage reporting
  - [ ] Set up automated security reports

**Test Criteria:** Admin can manage domains, view analytics, system detects abuse attempts

## Future Enhancement: Embeddable Widgets (Future Phases)

### Phase 4: Widget Infrastructure (Future)
- [ ] Design embeddable widget API
- [ ] Create JavaScript widget library
- [ ] Build widget configuration interface
- [ ] Implement pro user restrictions

### Phase 5: Widget Features (Future)  
- [ ] Gallery templates and themes
- [ ] Custom branding options
- [ ] Analytics for widget usage
- [ ] Mobile-responsive widgets

## Dependencies

**Infrastructure:**
- AWS S3 bucket access for policy updates
- CloudWatch access for monitoring setup
- Existing EventGlimpse domain configuration

**Development:**
- Database migration permissions
- Testing environment with S3 access
- Admin user account for testing controls

## Testing Strategy

### Security Testing
- [ ] Verify hotlinking is blocked from external domains
- [ ] Test referer spoofing attempts are handled
- [ ] Confirm direct S3 URLs are inaccessible
- [ ] Validate rate limiting works correctly

### Functionality Testing  
- [ ] All existing gallery features work unchanged
- [ ] Image loading performance is maintained
- [ ] Admin controls function properly
- [ ] Error handling for blocked access

### Performance Testing
- [ ] Image loading times remain acceptable
- [ ] Server load under protected image serving
- [ ] Database query performance with access logging
- [ ] CDN cache behavior with new routing

## Rollback Plan

**Phase 1 Rollback:**
- Revert S3 bucket policy to current public policy
- Restore original CORS configuration
- Remove monitoring dashboards

**Phase 2 Rollback:**
- Disable protected image routes
- Restore direct S3 URLs in templates  
- Remove database migration (if safe)
- Fall back to Phase 1 protection only

**Phase 3 Rollback:**
- Remove admin interfaces
- Disable advanced monitoring
- Maintain basic protection from Phase 2

## Cost Analysis

**Current State:**
- Unlimited bandwidth exposure to hotlinking
- Potential for significant unexpected AWS bills ($100s-$1000s/month)
- No visibility into unauthorized usage
- No DDoS or bot protection

**With Cloudflare Protection:**
- **Phase 1A (Cloudflare)**: $0-20/month (Free tier available, Pro recommended)
- **Phase 2**: Slight increase in server resources for enhanced access controls  
- **Phase 3**: Database storage for logs and analytics
- **Bandwidth Savings**: Cloudflare CDN reduces S3 egress costs
- **Overall**: Likely net cost reduction due to prevented abuse + CDN savings

**Alternative Phase 1B (S3-only)**: Minimal additional cost (CloudWatch monitoring)

**ROI Analysis:**
- **Investment**: $20/month Cloudflare Pro + ~40 hours development time
- **Savings**: Prevention of hotlinking abuse (potentially $50-500+/month)
- **Payback**: Immediate ROI if current abuse costs $20+/month
- **Added Value**: DDoS protection, global CDN, image optimization, analytics

## Security Considerations

**Threat Mitigation:**
- **Hotlinking Abuse**: Blocked via referer restrictions and protected routes
- **Bandwidth Theft**: Eliminated through access controls
- **Content Scraping**: Rate limiting and monitoring detect automated access
- **Domain Spoofing**: Server-side validation prevents simple spoofing

**Privacy:**
- Access logging captures minimal necessary data
- User consent maintained for legitimate access
- Admin controls respect user permissions

## Notes

- Implementation phases can be deployed independently
- Phase 1 provides immediate protection while Phase 2 develops
- Future widget system builds on access control foundation
- Monitor AWS costs closely during rollout
- Consider CloudFront upgrade for high-traffic scenarios

---

**Next Steps:**
1. Review and approve this plan with stakeholders
2. Begin Phase 1 implementation with S3 policy updates
3. Set up development environment for protected image serving
4. Create test scenarios for each phase validation