# AWS Setup Guide for EventGlimpse

## Prerequisites

- AWS account with permissions to create IAM users, S3 buckets, and Lambda functions
- EventGlimpse application configured with PostgreSQL database

## Step 1: Create IAM User

**In AWS Console:**

1. Go to IAM → Users → Create User
2. **Username:** `eventglimpse-service`
3. **Permissions:** Attach policies directly
4. **Required policies:**
   - `AmazonS3FullAccess`
   - `AWSLambdaBasicExecutionRole`

## Step 2: Generate Access Keys

1. Go to your user → Security credentials → Create access key
2. **Use case:** Application running outside AWS
3. **Save Access Key ID and Secret Access Key securely**

## Step 3: Configure Environment

Update your EventGlimpse server `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# S3 Configuration  
S3_BUCKET_NAME=eventglimpse
```

## Step 4: Deploy Infrastructure

1. **Create S3 bucket:** Follow `S3-SETUP.md`
2. **Deploy Lambda function:** Use `npm run deploy`
3. **Create Sharp layer:** Use `npm run build:layer`

## Step 5: Verify Setup

Test the complete workflow:

1. **Upload photo** through EventGlimpse gallery
2. **Check S3** for files in uploads/ folder
3. **Verify Lambda** execution in CloudWatch logs
4. **Confirm processing** creates thumbs/, display/, originals/

## Current Working Configuration

- ✅ **IAM User:** eventglimpse-service with S3/Lambda access
- ✅ **S3 Bucket:** eventglimpse with selective public access
- ✅ **Lambda Function:** image-processor (Node.js 20.x)
- ✅ **Sharp Layer:** Linux binaries for image processing
- ✅ **EventGlimpse Integration:** Immediate upload display + background processing

## Security Notes

- Environment variables stored securely in `.env`
- S3 bucket policy allows public read only for processed images
- IAM user has minimal required permissions
- Upload folder remains private
