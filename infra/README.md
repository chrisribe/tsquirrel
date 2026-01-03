# Infrastructure

## AWS Lambda Image Processor

Lambda code lives in the main branch of this repo (shared resource).

**Lambda Code:**  
https://github.com/chrisribe/Eventglimpse/tree/main/infra/lambda-image-processor

**Shared Between:**
- mvp-friction-test branch (this branch - simplified MVP)
- main branch (original version)

Both use same S3 bucket (`eventglimpse`) and Lambda function.

## S3 Structure

```
eventglimpse/
├── uploads/     # Triggers Lambda
├── originals/   # Full-size processed
├── display/     # 800px web versions
└── thumbs/      # 200px thumbnails
```

## Deployment Docs

See `/docs/`:
- `DEPLOY.md` - How to deploy
- `INFRASTRUCTURE.md` - Architecture overview
- `TROUBLESHOOTING.md` - Common issues
