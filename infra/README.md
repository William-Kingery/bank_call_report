# Bank Call Report CDK Infra

This CDK app provisions a lightweight deployment path for the current codebase:

- `client` static export -> S3 + CloudFront
- `server` container -> AWS App Runner
- MySQL -> Amazon RDS
- Credentials -> AWS Secrets Manager

## Prerequisites

- AWS account + IAM permissions for CDK deploys
- `cdk bootstrap` completed in target account/region
- Node 20+

## Quick deploy

1. Build frontend static assets:

```bash
cd ../client
NEXT_PUBLIC_API_BASE=https://placeholder.invalid npm run build
```

2. Deploy infrastructure:

```bash
cd ../infra
npm ci
npx cdk deploy
```

3. Use stack outputs:

- `FrontendUrl` is the CloudFront URL
- `ApiUrl` is the App Runner URL

4. Rebuild frontend with the real API URL and redeploy:

```bash
cd ../client
NEXT_PUBLIC_API_BASE=<ApiUrl output> npm run build
cd ../infra
npx cdk deploy
```

## Notes

- RDS is created with `RemovalPolicy.SNAPSHOT` to avoid accidental data loss.
- API CORS origin is set to the CloudFront domain by default.
- Load your FDIC data into the generated RDS instance before using `/search` and `/charts`.

## Optional context

You can override defaults via CDK context:

```bash
npx cdk deploy -c dbName=bank_call_report -c frontendBuildPath=../client/out
```
