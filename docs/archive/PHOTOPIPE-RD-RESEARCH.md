# PhotoPipe R&D Research Guide

## Research Tasks to Validate Core Claims

### 1. Market Gap Validation

**Claim:** "Nobody combines upload + resize + store + detect + CDN in one API"

**Research Tasks:**

```
□ Cloudinary
  - Visit: cloudinary.com/documentation
  - Check: Can you do face detection in same API call as upload/resize?
  - Document: Yes/No + what you need to do instead
  - Cost: What's the detection add-on cost?

□ Imgix
  - Visit: imgix.com
  - Check: Can Imgix store your uploads or do detection?
  - Document: Storage model + detection capabilities
  - Note: "Bring Your Own Storage" - user must manage S3 separately?

□ AWS Rekognition
  - Visit: aws.amazon.com/rekognition
  - Check: Does it resize images? Store them? Deliver via CDN?
  - Document: What AWS services you need to stitch together
  - Estimate: How many services needed? (S3, Lambda, CloudFront, API Gateway)

□ Google Vision API
  - Visit: cloud.google.com/vision
  - Check: Same questions as Rekognition
  - Document: Storage + resize + CDN needed separately?

□ Alternatives (search for "image processing API"):
  - ImageKit.io
  - Transloadit
  - Smartcrop API
  - Document each for: resize? store? detect? one API?
```

**Success Criteria:** Can you find ONE service that does all 5 (upload, resize, store, detect, CDN) in unified API?

---

### 2. Developer Pain Points

**Claim:** "Every photo app rebuilds the same pipeline"

**Research Tasks:**

```
□ GitHub Search
  - Search: "multer s3 lambda resize"
  - Search: "image processing pipeline aws"
  - Count: How many projects doing similar architecture?
  - Pattern: Are they all solving same problem separately?

□ Stack Overflow Questions
  - Search: "How to resize images on S3 upload"
  - Search: "AWS Lambda image processing"
  - Search: "Node.js photo upload resize store"
  - Pattern: What's the most common answer? (Lambda + S3)

□ Talk to 5 Developers
  - "Have you built a photo upload feature?"
  - "What was annoying about the implementation?"
  - "Would you use a single API instead?"
  - Document: Specific pain points mentioned (costs, complexity, uptime, etc)
```

**Success Criteria:** 4+ projects/devs confirm they rewrote resize + storage logic themselves.

---

### 3. Niche Market Validation

**Claim:** "Race photo tagging, wedding photography are paying niches"

**Research Tasks:**

```
□ Race Photo Industry
  - Search: "race photo download service"
  - Visit: Running USA, marathon websites
  - Find: 5 examples of race photography services
  - Interview: 1 race photographer - do they tag photos? How?
  - Questions:
    - How do they currently handle bib number tagging?
    - Do they charge runners for photos?
    - Would they pay to automate tagging?
    - Estimated price they'd pay?

□ Wedding Photography
  - Search: "wedding photo management software"
  - Find: 5 platforms (ShootDotEdit, Pic-Time, etc)
  - Check: Do they offer auto-organization by people/objects?
  - Interview: 1 wedding photographer
    - How long does photo delivery take?
    - Do clients ever re-organize/re-tag?
    - Would auto face-grouping save them time?

□ Construction/Real Estate
  - Search: "construction photo management software"
  - Find: 3-5 tools (e.g., PastureMap, Photo Booth)
  - Check: What's the pain point they solve?
  - Question: Is it storage, organization, or timestamping?

□ Insurance Claims
  - Search: "insurance adjuster photo app"
  - Find: 3-5 tools
  - Check: Do any OCR claim numbers/dates from photos?
  - Question: Would auto-OCR be valuable?
```

**Success Criteria:** Find 2+ niches where:
- Photos are taken in volume
- Current solution is manual/slow
- Customer would pay $30+/month to automate

---

### 4. Competitive Pricing Research

**Claim:** Pricing tiers ($29/$99/$299) are defensible

**Research Tasks:**

```
□ Cloudinary Pricing
  - Visit: cloudinary.com/pricing
  - Document: What you get at each tier
  - Note: Detection/AI pricing if separate
  - Calculate: Cost for 10K images/month with faces detected

□ AWS Pricing (DIY stack)
  - S3 storage: $0.023/GB
  - Lambda: $0.20 per 1M requests
  - Rekognition: $0.10 per image for face detection
  - CloudFront: $0.085/GB bandwidth
  - Calculate: Cost for 10K images/month with detection

□ Imagekit Pricing
  - Visit: imagekit.io/pricing
  - Document: What's included, what costs extra

□ Other SaaS Benchmarks
  - Search: "SaaS pricing B2B API" for comparables
  - Pattern: What's typical % margin on $99/month tier?
```

**Success Criteria:** Can you find what AWS costs for equivalent of $99 tier? Is there room for margin?

---

### 5. Technical Feasibility

**Claim:** "4-6 weeks to MVP API using existing EventGlimpse code"

**Research Tasks:**

```
□ EventGlimpse Code Audit
  - [ ] Lambda function runtime - how many lines?
  - [ ] EXIF extraction - reusable?
  - [ ] S3 integration - how much refactoring needed?
  - [ ] Database schema - extensions needed?
  - Estimate: How many of those lines are business logic vs plumbing?

□ API Gateway Research
  - Visit: aws.amazon.com/apigateway
  - Document: Can you do auth (API keys) easily?
  - Question: How much code is "wrapping" Lambda vs new?

□ Webhook Implementation
  - Search: "Node.js webhook retry library"
  - Find: 3-5 npm packages (Bull, RabbitMQ, etc)
  - Estimate: Implementation complexity (hours)

□ Detection Service Integration
  - AWS Rekognition docs: How many lines to call it?
  - Textract (OCR) docs: Same question
  - Pattern: Are these 5-line integrations or 50-line ones?

□ Calculate: True effort
  - List each component (API layer, auth, webhooks, detection, SDKs)
  - Estimate hours for each
  - Reality check: Is 4-6 weeks (160-240 hours) reasonable?
```

**Success Criteria:** Detailed breakdown showing where time actually goes.

---

### 6. Customer Discovery

**Claim:** "Wedding photographers, race organizers will pay for this"

**Research Tasks:**

```
□ Cold Email 5 Wedding Photographers
  - Find email from wedding photography websites
  - Script: "I'm researching photo management pain points"
  - Ask:
    - How long after a wedding do you deliver proofs?
    - What's your biggest time sink in delivery?
    - Would you pay $50/month to auto-group photos by person?
  - Document: Responses

□ Cold Email 5 Race Organizers
  - Find from running/triathlon race websites
  - Script: "Researching how race photographers handle bib tagging"
  - Ask:
    - How many photos per race?
    - How do runners find their photos?
    - Do you manually tag bib numbers or pay someone?
    - What would you pay to automate bib detection?
  - Document: Responses

□ Reddit/Facebook Groups
  - r/photography - "photo management pain points"
  - Photography facebook groups - lurk, find real problems
  - Document: Top 3 repeated pain points
```

**Success Criteria:** 3+ people saying "I would use this" and price point they'd accept.

---

### 7. Competitive Threats

**Claim:** "Switching costs are high once integrated"

**Research Tasks:**

```
□ Cloudinary Lock-in
  - Research: How hard is it to migrate FROM Cloudinary?
  - Question: Do they have export APIs?
  - Document: What would make leaving expensive?

□ AWS Lock-in
  - If someone uses Rekognition, can they switch to Google Vision?
  - Question: Is detection API locked to one vendor?

□ Your Moat
  - If you build, what makes someone NOT copy you in 3 months?
  - Document: Your defensibility
  - Reality check: Is it technical or market-based?
```

**Success Criteria:** Clear answer to "why won't Cloudinary add detection API?"

---

## Summary: Research Priorities

### High Priority (Do First)
1. Market gap validation - Can you find one service doing all 5?
2. Talk to 5 developers - Real pain points
3. One niche validation - Race photos or weddings? Real demand?

### Medium Priority (Do Second)
4. Pricing research - Is $99/month defensible?
5. Technical feasibility - Really 4-6 weeks?
6. Customer discovery - Would they actually pay?

### Low Priority (Do After Initial Validation)
7. Competitive threats analysis

---

## Key Questions to Answer

| Question | Current Assumption | Research Answer | Validate? |
|----------|-------------------|-----------------|-----------|
| Gap exists? | Nobody does all 5 | ☐ Search confirms | ☐ |
| Developers suffer? | Everyone rebuilds | ☐ 5 devs confirm | ☐ |
| Market exists? | Niches will pay | ☐ Found 2+ niches | ☐ |
| Viable pricing? | $99/month margin OK | ☐ AWS costs show | ☐ |
| Technical viable? | 4-6 weeks possible | ☐ Breakdown shows | ☐ |
| Customers exist? | People will buy | ☐ 3+ said "yes" | ☐ |

**Go/No-Go Decision:** If you can validate 5 out of 6 above, PhotoPipe is worth building.

---

## Resources to Use

### Free Tools
- GitHub code search (github.com/search)
- Stack Overflow search (stackoverflow.com)
- Pricing page screenshots (cloudinary.com, imgix.com)
- AWS calculator (calculator.aws)
- Reddit/HN search for discussions

### Paid Research (Optional)
- G2 reviews for photo software
- Industry reports on photography market
- Trend analysis tools

### Direct Contact
- Email photographers/race organizers (15 min each)
- Schedule 3x "quick chat" calls with developers (30 min each)
- Cost: ~4 hours of your time

---

## Timeline

**Realistic R&D:** 20-30 hours over 2-3 weeks

- 5 hours: Market gap research
- 5 hours: Developer interviews
- 5 hours: Niche discovery
- 5 hours: Pricing + technical validation
- 5-10 hours: Customer discovery calls

**Then:** Make go/no-go decision on PhotoPipe pivot.
