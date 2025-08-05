# S3 Bucket Setup for EventGlimpse

## Required Bucket

Create **1 S3 bucket** for the EventGlimpse image processing workflow:

- **`eventglimpse`** - Single bucket with organized folder structure

## Setup Steps

### 1. Create EventGlimpse Bucket

**In AWS Console:**
1. Go to S3 → Create bucket
2. **Bucket name:** `eventglimpse` (must be globally unique, add suffix if needed)
3. **Region:** us-east-1 (or your preferred region)
4. **Block Public Access:** Uncheck "Block all public access" ⚠️
   - Check "I acknowledge..." warning
   - Needed for public photo viewing
5. **Versioning:** Disabled (default)
6. **Encryption:** Server-side encryption with Amazon S3 managed keys (default)
7. Click **Create bucket**

### 2. Configure Bucket Policy

**Add selective public read policy:**

1. Go to your bucket → Permissions → Bucket policy → Edit
2. Paste this policy (replace `eventglimpse` with your actual bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadProcessedImages",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::eventglimpse/thumbs/*",
        "arn:aws:s3:::eventglimpse/display/*",
        "arn:aws:s3:::eventglimpse/originals/*",
        "arn:aws:s3:::eventglimpse/qr-codes/*"
      ]
    }
  ]
}
```

**⚠️ IMPORTANT:** 
- Replace `eventglimpse` with your **exact bucket name**
- Check that **Block Public Access** settings allow this policy
- Verify the file path matches the policy (case-sensitive)

3. Click **Save changes**

### 3. Configure Lambda Event Trigger

**Set up S3 event notification:**

1. Go to your bucket → Properties → Event notifications
2. **Create event notification**
3. **Name:** `lambda-image-processor`
4. **Prefix:** `uploads/`
5. **Event types:** "All object create events"
6. **Destination:** Lambda function
7. **Lambda function:** `image-processor`
8. **Save changes**

## Bucket Structure

Your bucket will automatically organize photos:

```
eventglimpse/
├── uploads/                # Input (EventGlimpse app uploads here)
│   └── {event-uuid}/
│       └── {photo-id}.{ext}
├── thumbs/                 # Output (150x150 thumbnails)
│   └── {event-uuid}/
│       └── {photo-id}.{ext}
├── display/                # Output (800px max display size)
│   └── {event-uuid}/
│       └── {photo-id}.{ext}
├── originals/              # Output (optimized originals)
│   └── {event-uuid}/
│       └── {photo-id}.{ext}
└── qr-codes/               # QR codes for gallery sharing
    └── {event-uuid}.png
```

## Verification

Test your setup:

1. **Upload test:** EventGlimpse should upload to `uploads/` folder
2. **Lambda trigger:** Check CloudWatch logs for Lambda execution
3. **Processing:** Verify thumbs/display/originals folders are created
4. **Public access:** Test image URLs are publicly accessible

## Current Working Configuration

- ✅ Bucket: `eventglimpse`
- ✅ Lambda function: `image-processor` 
- ✅ Trigger: S3 ObjectCreated on `uploads/` prefix
- ✅ Processing: Sharp layer creates 3 image sizes
- ✅ Gallery: EventGlimpse displays uploaded images immediately, processed versions on refresh
