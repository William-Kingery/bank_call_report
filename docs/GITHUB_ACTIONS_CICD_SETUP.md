# GitHub Actions CI/CD Overview

This document is the high-level index for GitHub Actions-based deployment in this repository.

Detailed implementation planning now lives in two separate runbooks:

- Production auto-deploy plan: [`docs/PROD_GITHUB_ACTIONS_DEPLOYMENT_PLAN.md`](./PROD_GITHUB_ACTIONS_DEPLOYMENT_PLAN.md)
- Preview environments plan: [`docs/PREVIEW_ENVIRONMENTS_IMPLEMENTATION_PLAN.md`](./PREVIEW_ENVIRONMENTS_IMPLEMENTATION_PLAN.md)

## Deployment Model

### Production

- Trigger: `push` to `main`
- Result: automatic deployment of the production stack
- Canonical runbook: [`docs/PROD_GITHUB_ACTIONS_DEPLOYMENT_PLAN.md`](./PROD_GITHUB_ACTIONS_DEPLOYMENT_PLAN.md)

### Preview Environments

- Trigger: `pull_request` `opened`, `synchronize`, and `reopened`
- Result: one ephemeral preview environment per PR with URLs posted back to the PR
- Teardown trigger: `pull_request` `closed`
- Canonical runbook: [`docs/PREVIEW_ENVIRONMENTS_IMPLEMENTATION_PLAN.md`](./PREVIEW_ENVIRONMENTS_IMPLEMENTATION_PLAN.md)

## Shared Decisions

- Use GitHub OIDC for AWS authentication. Do not store long-lived AWS keys in GitHub.
- Bootstrap CDK in the target AWS account and region before enabling workflows.
- Add workflow `concurrency` controls to prevent overlapping deploys.
- Treat production and preview deployments as separate rollout phases.
- Preview environments use Option A: a shared non-production database, not one RDS instance per PR.

## Related Documents

- Manual CDK deploy runbook: [`docs/CDK_DEPLOYMENT_PLAN.md`](./CDK_DEPLOYMENT_PLAN.md)
- Post-deploy backlog and hardening work: [`docs/POST_DEPLOY_ITERATIONS.md`](./POST_DEPLOY_ITERATIONS.md)

## Canonical Source Of Truth

Use this document as an entry point only.

- For production GitHub Actions implementation details, follow [`docs/PROD_GITHUB_ACTIONS_DEPLOYMENT_PLAN.md`](./PROD_GITHUB_ACTIONS_DEPLOYMENT_PLAN.md).
- For preview environment implementation details, follow [`docs/PREVIEW_ENVIRONMENTS_IMPLEMENTATION_PLAN.md`](./PREVIEW_ENVIRONMENTS_IMPLEMENTATION_PLAN.md).
- For manual first-time CDK setup and local deployment steps, follow [`docs/CDK_DEPLOYMENT_PLAN.md`](./CDK_DEPLOYMENT_PLAN.md).
