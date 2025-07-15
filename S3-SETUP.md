# S3 Bucket Setup for EventGlimpse

## Required Bucket

You need to create **1 S3 bucket** for the EventGlimpse image processing workflow:

- **`eventglimpse`** - Single bucket with organized folders

## Setup Steps

### 1. Create EventGlimpse Bucket

**In AWS Console:**
1. Go to S3 → Create bucket
2. **Bucket name:** `eventglimpse` (must be globally unique, add suffix if needed)
3. **Region:** Choose your preferred region (e.g., us-east-1)
4. **Block Public Access:** Uncheck "Block all public access" ⚠️
   - Check "I acknowledge..." warning
   - We need selective public access for photo viewing
5. **Versioning:** Disabled (default)
6. **Encryption:** Server-side encryption with Amazon S3 managed keys (default)
7. Click **Create bucket**

### 2. Configure Bucket Policy

**Add selective public read policy:**

1. Go to your bucket → Permissions
2. Scroll to **Bucket policy** → Edit
3. Paste this policy (replace `YOUR-BUCKET-NAME` with your actual bucket name):

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
        "arn:aws:s3:::YOUR-BUCKET-NAME/thumbs/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/display/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/originals/*"
      ]
    }
  ]
}
```

4. Click **Save changes**

### 3. Configure Lambda Trigger

**Set up S3 event trigger for uploads:**

1. Go to your bucket → Properties
2. Scroll to **Event notifications** → Create event notification
3. **Name:** `lambda-image-processor`
4. **Prefix:** `uploads/` (only trigger on uploads folder)
5. **Event types:** Check "All object create events"
6. **Destination:** Lambda function
7. **Lambda function:** Select your deployed EventGlimpse image processor
8. Click **Save changes**

## Bucket Structure

After setup, your single bucket will organize photos like this:

**eventglimpse bucket:**
```
uploads/                    # Private folder (Lambda input)
├── event-uuid-1/
│   ├── photo-id-1.jpg
│   └── photo-id-2.jpg

thumbs/                     # Public folder (200px images)
├── event-uuid-1/
│   ├── photo-id-1.jpg
│   └── photo-id-2.jpg

display/                    # Public folder (800px images)  
├── event-uuid-1/
│   ├── photo-id-1.jpg
│   └── photo-id-2.jpg

originals/                  # Public folder (original images)
├── event-uuid-1/
│   ├── photo-id-1.jpg
│   └── photo-id-2.jpg
```

## Security Notes

- ✅ **uploads/ folder:** Private (only your app can write/read)
- ✅ **thumbs/, display/, originals/ folders:** Public read (users can view images)
- ✅ **Lambda automatically deletes from uploads/ after processing**
- ✅ **Single bucket with encryption at rest**
- ✅ **Folder-level permissions for precise access control**

## Next Steps

1. Update your EventGlimpse app with bucket names
2. Configure AWS credentials for your server
3. Deploy Lambda function with S3 trigger
4. Test the complete workflow

## Troubleshooting

**Common Issues:**
- **Bucket name must be globally unique** - Add your region/org suffix if taken
- **Lambda permission errors** - Ensure Lambda execution role has S3 access
- **CORS issues** - Add CORS policy if serving images to web apps from different domains
- **uploads/ folder not triggering Lambda** - Check event notification prefix is set to `uploads/`
