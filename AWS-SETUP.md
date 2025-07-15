# AWS Setup Guide for EventGlimpse

## Prerequisites

You need an AWS account and proper permissions to create S3 buckets and Lambda functions.

## Step 1: Create IAM User for EventGlimpse

**In AWS Console:**

1. Go to IAM → Users → Create User
2. **Username:** `eventglimpse-service`
3. **Permissions:** Attach policies directly
4. **Policies to attach:**
   - `AmazonS3FullAccess` (for S3 operations)
   - `AWSLambdaBasicExecutionRole` (for Lambda logs)

## Step 2: Generate Access Keys

1. Go to your new user → Security credentials
2. **Create access key** → Application running outside AWS
3. **Copy the Access Key ID and Secret Access Key**
4. ⚠️ **Save these securely - you won't see the secret again!**

## Step 3: Update Your .env File

Replace the placeholder values in your `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1                          # Your preferred region
AWS_ACCESS_KEY_ID=AKIA...                     # From Step 2
AWS_SECRET_ACCESS_KEY=abcd1234...             # From Step 2

# S3 Bucket Configuration
S3_BUCKET_NAME=eventglimpse-your-suffix       # Must be globally unique
```

## Step 4: Test AWS Credentials

Run this in your terminal to verify credentials work:

```bash
# Install AWS CLI (if not already installed)
# Then test:
aws s3 ls --region us-east-1
```

## Step 5: Create S3 Bucket

Follow the `S3-SETUP.md` guide to create your bucket with the name from your `.env` file.

## Security Notes

- ✅ **Never commit .env to git** (already in .gitignore)
- ✅ **Use least privilege** - only give necessary permissions
- ✅ **Rotate keys regularly** in production
- ✅ **Consider IAM roles** for production deployments

## For Development

Your EventGlimpse app will now:
- Upload photos to S3 `uploads/` folder
- Store metadata in PostgreSQL
- Generate URLs for processed images
- (Lambda processing happens after AWS deployment)
