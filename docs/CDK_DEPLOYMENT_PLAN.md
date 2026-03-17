# AWS CDK Deployment Plan

This is the canonical deployment runbook for the current CDK implementation.

## Target Architecture

- `client` (Next.js static export) -> S3 + CloudFront
- `server` (Express API container) -> App Runner
- MySQL -> Amazon RDS
- Database credentials -> AWS Secrets Manager

## Prerequisites

- AWS account + IAM permissions for CDK deploys
- AWS CLI configured locally (`aws configure`)
- Node.js 20+
- npm
- AWS CDK v2 CLI
- Docker running locally (required for API image asset build)

Install CDK CLI if needed:

```bash
npm install -g aws-cdk
```

## One-Time Setup

1. Install dependencies:

```bash
cd client && npm ci
cd ../server && npm ci
cd ../infra && npm ci
cd ..
```

2. Bootstrap CDK in your target account/region:

```bash
cd infra
npx cdk bootstrap
```

## First Deployment

1. Build frontend with a placeholder API value:

```bash
cd ../client
NEXT_PUBLIC_API_BASE=https://placeholder.invalid npm run build
```

2. Deploy infrastructure:

```bash
cd ../infra
npx cdk deploy
```

3. Capture stack outputs:

- `FrontendUrl`
- `ApiUrl`
- `DatabaseEndpoint`
- `DatabaseSecretArn`

## Finalize Frontend API Wiring

Rebuild the frontend using the real API URL, then deploy again:

```bash
cd ../client
NEXT_PUBLIC_API_BASE=<ApiUrl from stack output> npm run build
cd ../infra
npx cdk deploy
```

## Validate Deployment

1. Open `FrontendUrl` in a browser.
2. Check backend health at `<ApiUrl>/api/health`.
3. Confirm response shows database connectivity.

## Data Load Requirement

The app requires FDIC data in the deployed RDS instance before `/search` and `/charts` are useful:

- `fdic_structure`
- `fdic_fts`
- `fdic_rat`

## Common Operations

Preview infrastructure changes:

```bash
cd infra
npx cdk diff
```

Deploy updates:

```bash
cd infra
npx cdk deploy
```

Destroy stack (RDS snapshot retained):

```bash
cd infra
npx cdk destroy
```

## Optional CDK Context Overrides

```bash
npx cdk deploy -c dbName=bank_call_report -c frontendBuildPath=../client/out
```

## Notes

- RDS deletion is configured to keep a snapshot.
- App Runner CORS origin is set from the CloudFront domain by CDK.
- If you add custom domains, update frontend API base and CORS configuration accordingly.
