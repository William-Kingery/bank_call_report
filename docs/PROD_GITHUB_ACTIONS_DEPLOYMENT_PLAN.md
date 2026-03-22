# Production GitHub Actions Deployment Plan

This document is an execution-focused plan for deploying the production application to AWS automatically after a merge into `main`.

The goal is to give Codex a task list that can be implemented directly in the repository, while clearly separating external GitHub and AWS setup that requires human access.

## Scope

- Trigger deployment on `push` to `main`
- Build the static frontend
- Deploy the CDK stack to the production AWS account/region
- Rebuild and redeploy once if the API URL changes after deploy
- Add basic smoke checks so the workflow fails fast on broken production releases

## Current Constraints

- The frontend is a static Next.js export and needs `NEXT_PUBLIC_API_BASE` at build time.
- The current API URL is only known after the stack exists because it comes from the App Runner service output.
- The CDK stack expects `client/out` to exist before `cdk synth` or `cdk deploy`.
- There are currently no GitHub Actions workflow files in the repo.
- There are currently no lint or test scripts that can serve as strong required status checks.

## Recommended Design

Use a two-pass production deployment workflow:

1. Look up the current production `ApiUrl` from the existing CloudFormation stack.
2. Build the frontend against that URL, or a placeholder if the stack does not exist yet.
3. Deploy the production stack with CDK.
4. Read the post-deploy `ApiUrl`.
5. If the `ApiUrl` changed, rebuild the frontend with the new URL and run a second deploy.
6. Smoke-check the deployed frontend and API health endpoint.

This avoids blocking on a stable custom domain now, while still making the current architecture deployable from GitHub Actions.

## Assumptions

- Production stack name remains `BankCallReportStack`.
- Production region remains `us-east-1` unless explicitly overridden.
- The team will use GitHub OIDC instead of long-lived AWS access keys.
- Docker is available on the GitHub Actions runner used for `cdk deploy`.

## Tasks Codex Can Execute In The Repo

### Phase 1: Add workflow scaffolding

- [ ] Create `.github/workflows/deploy-prod.yml`.
- [ ] Configure trigger: `push` on `main`.
- [ ] Add `concurrency` so only one production deployment runs at a time.
- [ ] Set workflow permissions:
  - `id-token: write`
  - `contents: read`

### Phase 2: Standardize install and build steps

- [ ] Use `actions/setup-node` with Node 20.
- [ ] Run `npm ci` in `client/`.
- [ ] Run `npm ci` in `server/`.
- [ ] Run `npm ci` in `infra/`.
- [ ] Add explicit caching only if it does not make the workflow harder to debug.

### Phase 3: Add AWS auth and CDK deploy flow

- [ ] Use `aws-actions/configure-aws-credentials` with OIDC.
- [ ] Read stack outputs for the existing production stack before build.
- [ ] Set `NEXT_PUBLIC_API_BASE` from the current `ApiUrl`, with `https://placeholder.invalid` as the first-deploy fallback.
- [ ] Build the frontend in `client/` so `client/out` exists before CDK runs.
- [ ] Run `cd infra && npx cdk deploy BankCallReportStack --require-approval never`.
- [ ] Read stack outputs again after deploy.
- [ ] Compare pre-deploy and post-deploy `ApiUrl`.
- [ ] If the API URL changed, rebuild the frontend and run a second `cdk deploy`.

### Phase 4: Add smoke validation

- [ ] Read `FrontendUrl` and `ApiUrl` from stack outputs.
- [ ] Run an HTTP check against `FrontendUrl`.
- [ ] Run an HTTP check against `<ApiUrl>/api/health`.
- [ ] Fail the workflow if either endpoint is not healthy.

### Phase 5: Make the workflow maintainable

- [ ] Add clear step names so failures are easy to diagnose in GitHub Actions.
- [ ] Keep stack name and region configurable through repository variables.
- [ ] Add comments only where the workflow logic is non-obvious.

## Tasks Requiring Human GitHub Or AWS Access

### GitHub repository setup

- [ ] Create repository variable `AWS_REGION`.
- [ ] Create repository variable `CDK_STACK_PROD` if the default stack name should be overrideable.
- [ ] Create repository secret or variable `AWS_ROLE_ARN` for the deploy role.
- [ ] Protect `main` with required pull requests.
- [ ] Add required status checks after the workflow is stable.

### AWS setup

- [ ] Bootstrap CDK in the production account and region.
- [ ] Create an IAM role trusted by GitHub OIDC.
- [ ] Restrict the trust policy to this repository and `refs/heads/main`.
- [ ] Allow the GitHub deploy role to assume or use the CDK bootstrap roles.
- [ ] Ensure the role has permissions for CloudFormation, S3, CloudFront, ECR asset publishing, App Runner, EC2, RDS, Secrets Manager, and IAM `PassRole`.

## Suggested Implementation Order For Codex

1. Add `deploy-prod.yml` with checkout, Node setup, AWS auth, install, build, deploy, and smoke-check steps.
2. Validate the workflow syntax locally as far as possible.
3. Keep the first version minimal and production-only.
4. Do not combine preview-environment work into the initial production deployment workflow.

## Acceptance Criteria

- A merge into `main` triggers exactly one production deployment workflow.
- The workflow can deploy a first-time stack using a placeholder frontend API URL.
- The workflow can redeploy the frontend if the App Runner `ApiUrl` changes.
- The workflow fails if the frontend or API health check fails.
- No long-lived AWS credentials are stored in the repository.

## Explicit Non-Goals For This Phase

- Preview environments
- Scheduled cleanup jobs
- Full rollback automation
- Custom production domains
- A same-origin `/api` routing redesign

## Follow-Up Improvement After Initial Rollout

The best long-term simplification is to introduce a stable API hostname or route API traffic through CloudFront. Once the frontend no longer needs a deploy-time App Runner URL, the two-pass production deploy can be replaced with a single deterministic build-and-deploy workflow.
