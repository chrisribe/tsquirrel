# EventGlimpse Lambda Image Processor

AWS Lambda function for processing uploaded images from EventGlimpse events. Automatically creates thumbnail, display, and optimized original versions when photos are uploaded to S3.

> **⚠️ Security Note**: Replace `YOUR_ACCOUNT_ID` with your actual AWS account ID in all commands below. Never commit real account IDs to public repositories.

## Prerequisites

- AWS Account with proper permissions
- S3 bucket configured for EventGlimpse
- Docker (for building layers with Linux binaries)

📋 **Setup Guides:**
- [AWS Setup Guide](./AWS-SETUP.md) - Configure AWS credentials and permissions
- [S3 Setup Guide](./S3-SETUP.md) - Create and configure S3 bucket with triggers

## Architecture

- **Trigger**: S3 ObjectCreated events on `uploads/` folder
- **Processing**: Sharp library for image resizing and optimization
- **Output**: Creates 3 versions in separate S3 folders:
  - `thumbs/` - Small thumbnails (150x150)
  - `display/` - Medium display size (800px max)
  - `originals/` - Optimized originals (quality 90%)

## Files

- `index.js` - Main Lambda function handler
- `package.json` - Function dependencies (AWS SDK v3)
- `build.js` - Creates deployment package
- `build-layer.js` - Creates Lambda layers with native dependencies
- `test-event-s3-put.json` - Sample S3 event for testing

## Setup

### 1. Build Lambda Layer
```bash
# Build Sharp layer with Linux binaries (requires Docker)
npm run build-layer

# Or build with Windows binaries (for testing only)
npm run build-layer-windows

# Build both layer and function
npm run build-all
```

### 2. Deploy Layer
```bash
aws lambda publish-layer-version \
  --layer-name sharp-layer \
  --zip-file fileb://dist/sharp-layer.zip \
  --compatible-runtimes nodejs20.x
```

### 3. Build Function Package
```bash
npm run build
```

### 4. Deploy Function

**First time setup:**
```bash
aws lambda create-function \
  --function-name image-processor \
  --runtime nodejs20.x \
  --role arn:aws:iam::YOUR_ACCOUNT_ID:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://dist/lambda-package.zip \
  --layers arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:layer:sharp-layer:4 \
```

**Update existing function (most common):**
```bash
# Just update the code
aws lambda update-function-code \
  --function-name image-processor \
  --zip-file fileb://dist/lambda-package.zip
```

**Update layer version:**
```bash
# When you need a new layer version
aws lambda update-function-configuration \
  --function-name image-processor \
  --layers arn:aws:lambda:us-east-1:YOUR_ACCOUNT_ID:layer:sharp-layer:5
```

### 5. Configure S3 Trigger
```bash
aws s3api put-bucket-notification-configuration \
  --bucket eventglimpse \
  --notification-configuration file://s3-notification.json
```

## Layer Builder Options

The build scripts support different configurations:

```bash
# Sharp layer with Docker (Linux binaries) - DEFAULT
npm run build-layer

# Sharp layer with Windows binaries (testing only)
npm run build-layer-windows

# Build everything (layer + function)
npm run build-all

# Custom layer name (manual command)
node build-layer.js --name utils

# Custom layer with Docker
node build-layer.js --name ffmpeg --docker
```

## Testing

Test the function locally:
```bash
aws lambda invoke \
  --function-name image-processor \
  --payload file://test-event-s3-put.json \
  response.json
```

## Environment Variables

- `AWS_REGION` - AWS region (default: us-east-1)
- `S3_BUCKET_NAME` - S3 bucket name (default: eventglimpse)

## Image Processing

Input: `uploads/{event-uuid}/{photo-id}.{ext}`
Output:
- `thumbs/{event-uuid}/{photo-id}.{ext}` (150x150)
- `display/{event-uuid}/{photo-id}.{ext}` (800px max)
- `originals/{event-uuid}/{photo-id}.{ext}` (optimized)

## Dependencies

- **Runtime**: Node.js 20.x
- **Layer**: Sharp (native image processing)
- **AWS SDK**: v3 (S3 operations)
- **Package Size**: ~50KB (function), ~23MB (layer)