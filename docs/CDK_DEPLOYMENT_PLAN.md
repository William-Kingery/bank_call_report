# AWS CDK Deployment Plan

This is the canonical deployment runbook for the current CDK implementation.

## Current Progress

- [x] Created the IAM managed policy stack `DeveloperPolicy`
- [x] Configured a working AWS CLI deploy profile (`admin`)
- [x] Verified local AWS CLI, Node.js, npm, and CDK CLI
- [x] Installed dependencies in `client`
- [x] Installed dependencies in `server`
- [x] Installed dependencies in `infra`
- [x] Fixed the CDK entrypoint import in `infra/bin/bank-call-report.ts`
- [x] Updated the RDS MySQL engine version to `8.0.40` for `us-east-1`
- [x] Ensured Docker Desktop is running
- [x] Built `client/out` with a placeholder API URL
- [x] Ran `cdk bootstrap`
- [x] Ran the first successful `cdk deploy`
- [x] Captured stack outputs
- [x] Rebuilt frontend with the real `ApiUrl`
- [x] Ran the second `cdk deploy`
- [x] Switched App Runner from the empty stack-created database to the existing `usbanks` database
- [x] Validate frontend and API health
- [x] Verified FDIC data exists in the existing `usbanks` database

## Target Architecture

- `client` (Next.js static export) -> S3 + CloudFront
- `server` (Express API container) -> App Runner
- MySQL -> Amazon RDS
- Database credentials -> AWS Secrets Manager

## Prerequisites

Complete the following before you run `cdk bootstrap` or `cdk deploy`.

### 1. AWS account, region, and IAM access

- Do not use the AWS account root user for CDK deployments.
- Use a dedicated IAM identity for deployments. An IAM Identity Center-backed role is best if your organization already uses it. If not, use an IAM user with programmatic access and configure the AWS CLI with that access key.
- This CDK app defaults to `us-east-1` if you do not override the region. That default is set in `infra/bin/bank-call-report.ts`.

Recommended setup path for a brand-new account:

1. Sign in to the AWS console as an administrator.
2. Open IAM:
   - Console: <https://console.aws.amazon.com/iam/>
   - Docs: <https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html>
3. Create or identify a deployer identity:
   - Recommended if available: grant a role that the developer can assume locally.
   - Simple fallback: create an IAM user for deployment and create an access key for AWS CLI use.
4. Give that identity permissions for CDK bootstrapping and deployment.

Fastest path for initial setup:

- Attach the AWS managed policy `AdministratorAccess` to the deployment identity, use it for bootstrap + first deploy, then tighten permissions later if your organization requires that.

More controlled path:

- For `cdk bootstrap`, AWS documents this minimum bootstrap policy for the IAM identity performing the bootstrap:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": ["cloudformation:*", "ecr:*", "ssm:*", "s3:*", "iam:*"],
			"Resource": "*"
		}
	]
}
```

- After bootstrap, the deployer must be able to assume the CDK bootstrap roles. AWS documents the following policy for that:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "AssumeCDKRoles",
			"Effect": "Allow",
			"Action": "sts:AssumeRole",
			"Resource": "*",
			"Condition": {
				"StringEquals": {
					"iam:ResourceTag/aws-cdk:bootstrap-role": [
						"image-publishing",
						"file-publishing",
						"deploy",
						"lookup"
					]
				}
			}
		}
	]
}
```

- This specific stack creates resources in these AWS services: CloudFormation, IAM, S3, CloudFront, ECR assets, App Runner, EC2/VPC, RDS, and Secrets Manager. If your team does not allow `AdministratorAccess` on the CDK bootstrap execution role, your AWS admin must provide a custom execution policy that allows CloudFormation to create and update those services.

Useful AWS docs:

- CDK bootstrap permissions: <https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html>
- CDK deployment flow and bootstrap roles: <https://docs.aws.amazon.com/cdk/v2/guide/deploy.html>
- CDK security and role-assumption policy guidance: <https://docs.aws.amazon.com/cdk/v2/guide/best-practices-security.html>
- Configure security credentials for the CDK CLI: <https://docs.aws.amazon.com/cdk/v2/guide/configure-access.html>

### 2. Install AWS CLI locally

Official install docs:

- AWS CLI install guide: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
- `aws configure` reference: <https://docs.aws.amazon.com/cli/latest/reference/configure/>

macOS install example:

```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
aws --version
```

Configure credentials locally:

```bash
aws configure --profile bank-call-report
```

Enter:

- `AWS Access Key ID`: from the IAM user or role-backed access workflow
- `AWS Secret Access Key`: matching secret key
- `Default region name`: `us-east-1` unless your team intentionally deploys elsewhere
- `Default output format`: `json`

Use that profile in your shell:

```bash
export AWS_PROFILE=bank-call-report
aws sts get-caller-identity
aws configure list
```

If your company uses role assumption instead of long-lived IAM user keys, follow the role-based CLI setup here:

- <https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html>

### 3. Install Node.js 20+ and npm

- Official Node download page: <https://nodejs.org/en/download/>
- npm is installed with Node.js, so you normally do not install npm separately.

Verify:

```bash
node --version
npm --version
```

Use Node.js 20 or newer. If you want to stay closest to this repository's current infra toolchain, Node 20 LTS is a safe choice.

### 4. Install AWS CDK v2 CLI

Official docs:

- CDK prerequisites: <https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html>
- CDK getting started / CLI install: <https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html>
- CDK CLI reference: <https://docs.aws.amazon.com/cdk/v2/guide/cli.html>

Install globally:

```bash
npm install -g aws-cdk
cdk --version
```

Repo-specific note:

- `infra/package.json` currently uses CDK library version `2.177.0`.
- A newer global CDK CLI is usually fine, but if you want an exact match you can install `npm install -g aws-cdk@2.177.0`.

### 5. Install and start Docker locally

- Docker Desktop for Mac: <https://docs.docker.com/desktop/setup/install/mac-install/>
- Docker Desktop for Windows: <https://docs.docker.com/desktop/setup/install/windows-install/>

This repository builds the API container locally during `cdk deploy`, so Docker must be running before deployment.

Verify:

```bash
docker --version
docker info
```

### 6. Final local prerequisite check

Before moving to the one-time CDK setup below, confirm all of these succeed:

```bash
aws --version
aws sts get-caller-identity
node --version
npm --version
cdk --version
docker info
```

## One-Time Setup

1. Install dependencies:

```bash
cd client && npm ci
cd ../server && npm ci
cd ../infra && npm install
cd ..
```

Notes:

- `infra` currently does not include a `package-lock.json`, so `npm ci` will fail there. Use `npm install`.
- The `client` and `server` directories can continue using `npm ci` because they already have lockfiles.

2. Build the frontend once before synth/bootstrap:

```bash
cd client
NEXT_PUBLIC_API_BASE=https://placeholder.invalid npm run build
cd ../infra
```

This CDK app stages the frontend build output from `client/out`, so `cdk synth`, `cdk bootstrap`, and `cdk deploy` expect that directory to exist.

3. Bootstrap CDK in your target account/region:

```bash
cd infra
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
npx cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

If you are intentionally deploying to another region, replace `us-east-1` with that region in both your AWS CLI profile and the bootstrap command.

## First Deployment

1. If you have not already built the frontend with a placeholder API value, do it now:

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
- `infra/lib/bank-call-report-stack.ts` should use MySQL `8.0.40` in `us-east-1`. The previously pinned `8.0.39` is not currently available in that region and causes stack rollback.
