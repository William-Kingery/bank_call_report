# GitHub Actions CI/CD Setup (Main Auto-Deploy + PR Preview Environments)

This document explains what is required to run a full CI/CD model for this repository using GitHub Actions:

- Merge to `main` -> automatic production deploy
- Pull request to `main` -> automatic preview environment URL
- PR close/merge -> automatic preview environment teardown

## Target Model

### Production

- Trigger: `push` to `main`
- Action: deploy `BankCallReportStack` via CDK
- Result: production frontend/API updated automatically

### Preview Environments

- Trigger: `pull_request` (`opened`, `synchronize`, `reopened`)
- Action: deploy isolated preview stack (one stack per PR)
- Result: PR comment with `FrontendUrl` and `ApiUrl`

- Trigger: `pull_request` (`closed`)
- Action: destroy that PR preview stack
- Result: no orphaned preview resources

## Current CDK Constraints To Address First

The current stack is close, but preview stacks require resource names to be unique by stack/PR.

Required before PR previews:

1. App Runner service naming must be unique per stack
- Current value is hardcoded: `serviceName: 'bank-call-report-api'`
- For preview stacks, this must include PR/stage (example: `bank-call-report-api-pr-123`)

2. VPC connector naming must be unique and deterministic per stack
- Ensure name length and allowed characters match App Runner limits

3. Decide preview database strategy
- Option A (recommended): shared non-prod DB for all previews
- Option B: one RDS instance per PR (expensive/slower)

4. Confirm frontend build flow in automation
- `client` uses static export and needs `NEXT_PUBLIC_API_BASE` at build time
- CI must set API URL before build (or do an initial deploy + rebuild + second deploy)

## AWS Requirements

## 1) CDK Bootstrap

Run once per target account/region:

```bash
cd infra
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

## 2) GitHub OIDC Trust (No Static AWS Keys)

Use GitHub Actions OIDC with an IAM role trusted by `token.actions.githubusercontent.com`.

Trust policy should restrict:

- repository (`sub`) to this repo
- branch for production deploys (`refs/heads/main`)
- PR contexts for preview workflows

Minimum trust conditions typically include:

- `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com`
- `token.actions.githubusercontent.com:sub` = repo-specific pattern

## 3) IAM Permissions For CI Role

CI role needs permissions to deploy/destroy this stack, including:

- CloudFormation
- S3 / CloudFront
- ECR (for Docker asset publish)
- App Runner
- EC2 (VPC, subnets, security groups used by stack)
- RDS
- Secrets Manager
- IAM `PassRole` for App Runner roles created/used by stack
- Logs (if needed by deploy tooling)

Use least-privilege and scope to stack/resource prefixes where practical.

## GitHub Repository Requirements

## 1) Repository Secrets / Variables

Set these in GitHub:

- `AWS_ROLE_ARN` (OIDC-assumable deployment role)
- `AWS_REGION` (for example `us-east-1`)

Optional:

- `CDK_STACK_PROD` (default: `BankCallReportStack`)
- `CDK_STACK_PREVIEW_PREFIX` (default: `BankCallReportPreviewPr`)

## 2) Branch Protection

Protect `main` with:

- required pull request
- required status checks
- optional manual approval gates (if desired)

## 3) Workflow Permissions

GitHub Actions workflow permissions should include:

- `id-token: write` (required for OIDC)
- `contents: read`
- `pull-requests: write` (for preview URL comments)

## Required Workflow Files

Create `.github/workflows/` and add these files:

1. `deploy-main.yml`
- Trigger: `push` on `main`
- Steps:
  - checkout
  - setup node
  - configure AWS credentials via OIDC
  - install deps (`client`, `server`, `infra`)
  - determine API URL for build (from stack output, fallback placeholder)
  - build client (`NEXT_PUBLIC_API_BASE=... npm run build`)
  - `cd infra && npx cdk deploy <prod-stack> --require-approval never`
  - optional: if API URL changed, rebuild and redeploy once more

2. `preview-pr.yml`
- Trigger: `pull_request` on `main` (`opened`, `synchronize`, `reopened`)
- Steps:
  - derive stack name: `<prefix>${{ github.event.number }}`
  - checkout + setup node + configure AWS credentials
  - install deps
  - build/deploy preview stack
  - fetch outputs (`FrontendUrl`, `ApiUrl`)
  - post/update PR comment with preview links

3. `destroy-preview.yml`
- Trigger: `pull_request` on `main` (`closed`)
- Steps:
  - derive stack name from PR number
  - assume AWS role
  - `cd infra && npx cdk destroy <preview-stack> --force`

## PR Comment Format (Recommended)

Include:

- Frontend URL
- API URL
- commit SHA
- deployment timestamp

This makes it easy to map preview environments to specific PR revisions.

## Cost and Safety Controls (Strongly Recommended)

1. Use shared non-prod DB for previews unless isolation is mandatory
2. Auto-destroy previews on PR close
3. Add scheduled cleanup job for stale preview stacks
4. Add `concurrency` keys in workflows to cancel superseded deploys
5. Keep preview capacity small to control cost

## Rollout Plan

1. Enable production auto-deploy first (`deploy-main.yml`)
2. Validate stable production deployments for several merges
3. Add preview create workflow
4. Add preview destroy workflow
5. Add stale-preview cleanup job

## Validation Checklist

- Merge to `main` triggers successful deploy automatically
- New PR gets preview links posted automatically
- PR update refreshes preview deployment
- PR close destroys preview stack
- No manual AWS key material stored in GitHub secrets
