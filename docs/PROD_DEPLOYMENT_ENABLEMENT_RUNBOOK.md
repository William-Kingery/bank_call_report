# Production Deployment Enablement Runbook

This runbook covers the manual GitHub and AWS setup required to enable the production deployment workflow in [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml).

Use this document after the workflow file is merged.

## What The Workflow Does

- Triggers on `push` to `main`
- Queues production deploys so only one runs at a time
- Reads the current production `ApiUrl` from CloudFormation
- Builds the static frontend against that API URL, or `https://placeholder.invalid` on the first deploy
- Runs `cdk deploy`
- Rebuilds and redeploys once if the `ApiUrl` changes
- Runs smoke checks against the final frontend URL and `/api/health`

## Required GitHub Repository Configuration

Create the following repository variables:

| Name | Required | Notes |
| --- | --- | --- |
| `AWS_REGION` | Yes | Production AWS region. Use `us-east-1` unless you intentionally deploy elsewhere. |
| `AWS_ROLE_ARN` | Yes | IAM role that GitHub Actions assumes through OIDC. |
| `CDK_STACK_PROD` | No | Defaults to `BankCallReportStack`. |
| `EXISTING_DB_HOST` | Yes | Production database host used by the API runtime. |
| `EXISTING_DB_PORT` | No | Defaults to `3306`. |
| `EXISTING_DB_NAME` | No | Defaults to `usbanks`. |

Create the following repository secrets:

| Name | Required | Notes |
| --- | --- | --- |
| `EXISTING_DB_USER` | Yes | Production database username. |
| `EXISTING_DB_PASSWORD` | Yes | Production database password. |

Recommended GitHub settings:

- Protect `main` with pull requests before enabling the workflow.
- Do not add this workflow as a required status check until the first successful production run completes.
- Keep Actions permissions enabled for the repository.

## Required AWS Setup

### 1. Bootstrap CDK in the target account and region

Run this once in the production account:

```bash
cd infra
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
npx cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

If production is not in `us-east-1`, replace that region consistently in both the bootstrap command and the repository variable.

### 2. Create the GitHub OIDC deploy role

The role must trust GitHub's OIDC provider and restrict access to this repository's `main` branch.

Minimum trust-policy shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

### 3. Grant the deploy role the required permissions

The role must be able to:

- call CloudFormation for stack reads and updates
- publish CDK assets to the bootstrap bucket and ECR
- create and update S3, CloudFront, App Runner, EC2, Secrets Manager, IAM, and RDS resources used by the stack
- pass any IAM roles created for App Runner
- assume or use the CDK bootstrap roles

If you are enabling this quickly and do not yet have a least-privilege policy prepared, use a broad deployment role for bootstrap and first enablement, then tighten it afterward.

### 4. Confirm production database reachability and credentials

Before the first GitHub-driven deploy:

- verify the values for `EXISTING_DB_HOST`, `EXISTING_DB_PORT`, and `EXISTING_DB_NAME`
- verify the credentials in `EXISTING_DB_USER` and `EXISTING_DB_PASSWORD`
- confirm the deployed API is expected to use that database

## First Enablement Sequence

1. Merge the workflow and docs without bundling unrelated app changes.
2. Configure the repository variables and secrets listed above.
3. Bootstrap CDK in the production account and region.
4. Create the OIDC deploy role and set `AWS_ROLE_ARN`.
5. Confirm the current production stack exists and is healthy.
6. Push a small no-risk commit to `main`, or merge the workflow branch to `main`, to trigger the first run.
7. Watch the workflow through completion and record the final `FrontendUrl` and `ApiUrl`.
8. After the first clean run, add branch protection required checks if desired.

## Minimal-Downtime Rollout Plan

This workflow is designed for minimal downtime, not guaranteed zero downtime.

Current constraints:

- The frontend is a static export and needs `NEXT_PUBLIC_API_BASE` at build time.
- The App Runner service URL can only be known from stack outputs.
- If a deploy changes the App Runner `ApiUrl`, the workflow must run a second deploy so the frontend picks up the new backend URL.

Use this rollout sequence:

1. Enable the workflow during a low-traffic window.
2. Merge only workflow and documentation changes first.
3. Keep `concurrency.cancel-in-progress` disabled so a new push cannot interrupt an active production deploy.
4. Let the workflow build against the existing `ApiUrl` when the stack already exists.
5. Avoid infrastructure changes that are likely to replace the App Runner service during peak traffic until a stable API hostname exists.
6. Treat any deploy that changes `ApiUrl` as a low-traffic-window operation, because the frontend must be redeployed immediately afterward.

Operational fallback:

- If the workflow fails before `cdk deploy`, production should remain unchanged.
- If the workflow fails after the first `cdk deploy` and the `ApiUrl` changed, redeploy the last known good commit manually using the existing CDK runbook in [`docs/CDK_DEPLOYMENT_PLAN.md`](./CDK_DEPLOYMENT_PLAN.md).
- If smoke checks fail after deployment, revert the offending change in `main` and rerun deployment from the reverted commit.

## Validation Checklist After Each Production Deploy

- Confirm the GitHub Actions job finished successfully.
- Open the `FrontendUrl` from stack outputs.
- Check `${ApiUrl}/api/health` and confirm it reports `server: ok` and `database: connected`.
- Verify authentication still works from the deployed frontend.
- Verify at least one core data flow in the UI.

## Follow-Up Improvement To Reduce Risk Further

The biggest remaining downtime risk is the deploy-time dependency on the App Runner service URL.

The clean fix is to introduce a stable API hostname or route API traffic through CloudFront so the frontend no longer needs a second deploy when the backend URL changes.
