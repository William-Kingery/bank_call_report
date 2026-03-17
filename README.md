# Bank Call Report

This repository includes an AWS CDK implementation for a lightweight production deployment:

- `client` (Next.js static export) -> S3 + CloudFront
- `server` (Express API container) -> App Runner
- MySQL database -> Amazon RDS
- Database credentials -> AWS Secrets Manager

## What Is Already Implemented

- CDK app entrypoint: `infra/bin/bank-call-report.ts`
- CDK stack resources: `infra/lib/bank-call-report-stack.ts`
- API image build for App Runner: `server/Dockerfile`
- Frontend static export support: `client/next.config.js`
- API CORS env support: `server/index.js` (`CORS_ORIGIN`)

## Prerequisites

- AWS account with permissions for CDK, CloudFront, S3, App Runner, VPC, RDS, IAM, and Secrets Manager
- AWS CLI configured locally (`aws configure`)
- Node.js 20+
- npm
- AWS CDK v2 CLI

Install CDK CLI if needed:

```bash
npm install -g aws-cdk
```

## Next Steps To Set Up CDK Deployment

1. Install dependencies for the app and infrastructure:

```bash
cd client && npm ci
cd ../server && npm ci
cd ../infra && npm ci
cd ..
```

2. Bootstrap CDK in your target account/region (one-time per account/region):

```bash
cd infra
npx cdk bootstrap
```

3. Build frontend assets with a temporary API value for first deploy:

```bash
cd ../client
NEXT_PUBLIC_API_BASE=https://placeholder.invalid npm run build
```

4. Deploy the stack:

```bash
cd ../infra
npx cdk deploy
```

5. Capture stack outputs after deploy:

- `FrontendUrl` (CloudFront URL)
- `ApiUrl` (App Runner URL)
- `DatabaseEndpoint`
- `DatabaseSecretArn`

6. Rebuild the frontend with the real API URL and redeploy:

```bash
cd ../client
NEXT_PUBLIC_API_BASE=<ApiUrl from stack output> npm run build
cd ../infra
npx cdk deploy
```

7. Validate the deployment:

- Open `FrontendUrl` in a browser
- Check backend health: `<ApiUrl>/api/health`
- Confirm API-to-database connectivity returns `database: connected`

## Data Loading Requirement

The application expects FDIC tables/data in RDS:

- `fdic_structure`
- `fdic_fts`
- `fdic_rat`

Load this data into the RDS instance before using search/charts endpoints.

## Optional CDK Context Overrides

You can override defaults at deploy time:

```bash
npx cdk deploy -c dbName=bank_call_report -c frontendBuildPath=../client/out
```

## Common Operations

Deploy updates:

```bash
cd infra
npx cdk deploy
```

Preview changes before deploy:

```bash
cd infra
npx cdk diff
```

Tear down stack (keeps DB snapshot):

```bash
cd infra
npx cdk destroy
```

## Notes

- RDS uses snapshot retention on deletion (`RemovalPolicy.SNAPSHOT`).
- App Runner CORS origin is configured from the CloudFront domain by CDK.
- If you add a custom domain later, update frontend env and CORS values accordingly.
