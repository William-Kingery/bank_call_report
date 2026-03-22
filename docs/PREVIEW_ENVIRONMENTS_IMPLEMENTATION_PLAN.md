# Preview Environments Implementation Plan

This document is an execution-focused plan for adding ephemeral pre-merge preview environments for pull requests targeting `main`.

The goal is to give Codex a concrete implementation sequence for repository changes, while also calling out the GitHub and AWS setup that cannot be completed from the repo alone.

## Scope

- Create one preview environment per PR
- Deploy on PR open, synchronize, and reopen
- Post preview URLs back to the PR
- Destroy preview resources when the PR closes
- Keep preview cost and operational risk low

## Database Decision

Selected option: Option A, shared non-production database for preview environments.

Preview stacks should not create one RDS instance per PR.

Reasoning:

- Per-PR RDS is slow and expensive.
- The current stack provisions a database internally, which is not a good fit for fast ephemeral environments.
- A shared preview database lets the preview stack stay focused on frontend and API validation.

If strict per-PR data isolation is later required, that should be treated as a separate architecture change, not part of the first preview rollout.

## Current Blockers In The Repo

- The CDK app currently creates only one fixed stack ID: `BankCallReportStack`.
- App Runner service naming is hardcoded to `bank-call-report-api`.
- The stack currently provisions its own RDS instance and DB secret.
- The frontend still needs an API base URL at build time.
- The current stack uses retained resources that are acceptable for production but are not ideal for ephemeral environments.

## Target Design

Preview deployments should use a parameterized stack and stage model:

- Production stack: `BankCallReportStack`
- Preview stack pattern: `BankCallReportPreviewPr<PR_NUMBER>`
- Stage identifier passed into the CDK app so resource names can be derived deterministically
- Preview stacks use a shared non-prod database connection instead of creating a fresh RDS instance
- Preview workflow comments on the PR with `FrontendUrl`, `ApiUrl`, commit SHA, and timestamp

## Tasks Codex Can Execute In The Repo

### Phase 1: Refactor the CDK app for stage-aware stacks

- [ ] Update `infra/bin/bank-call-report.ts` so stack name, stage, and preview mode can be passed via context or environment.
- [ ] Extend stack props to include a stage identifier such as `prod` or `pr-123`.
- [ ] Derive resource names from the stage where explicit naming is required.
- [ ] Keep production defaults unchanged when no preview-specific inputs are supplied.

### Phase 2: Remove preview-specific naming conflicts

- [ ] Replace the hardcoded App Runner `serviceName` with a deterministic stage-based name.
- [ ] Verify the App Runner name stays within service naming limits.
- [ ] Keep the VPC connector name deterministic and unique per stack.
- [ ] Review any other explicitly named resources and make sure preview stacks do not collide with production.

### Phase 3: Implement Option A for preview database access

- [ ] Add stack configuration that allows production to create its own RDS instance.
- [ ] Add stack configuration that allows previews to use an externally provided database host, port, name, and secret instead.
- [ ] Make preview mode skip creation of RDS and its generated secret.
- [ ] Keep runtime environment variables and secret wiring compatible with both production and preview modes.

### Phase 4: Make frontend builds work for previews

- [ ] Build preview frontend assets against the preview API URL.
- [ ] Use the same two-pass approach as production if the preview API URL is not known before first deploy.
- [ ] Keep the preview build isolated from the production `client/out` artifact path if needed.

### Phase 5: Add GitHub Actions workflows

- [ ] Create `.github/workflows/preview-pr.yml`.
- [ ] Trigger on `pull_request` for `opened`, `synchronize`, and `reopened`.
- [ ] Derive preview stack name from the PR number.
- [ ] Configure OIDC AWS auth.
- [ ] Install dependencies in `client/`, `server/`, and `infra/`.
- [ ] Build and deploy the preview stack.
- [ ] Fetch `FrontendUrl` and `ApiUrl` outputs after deploy.
- [ ] Post or update a PR comment with the preview links.
- [ ] Add workflow `concurrency` so outdated preview deploys are canceled.

### Phase 6: Add teardown workflow

- [ ] Create `.github/workflows/destroy-preview.yml`.
- [ ] Trigger on `pull_request` `closed`.
- [ ] Derive the preview stack name from the PR number.
- [ ] Destroy the preview stack automatically.
- [ ] Make the destroy workflow resilient when the stack does not exist.

### Phase 7: Add guardrails

- [ ] Keep preview instance sizes and capacity small.
- [ ] Tag preview resources clearly so they are easy to identify in AWS.
- [ ] Add a future cleanup hook for stale preview resources if PR close events are missed.

## Tasks Requiring Human GitHub Or AWS Access

### GitHub repository setup

- [ ] Ensure PR workflows have:
  - `id-token: write`
  - `contents: read`
  - `pull-requests: write`
- [ ] Create repository variable `CDK_STACK_PREVIEW_PREFIX` if stack prefix override is needed.
- [ ] Confirm branch protection requires the preview workflow only after it is stable.

### AWS setup

- [ ] Update the GitHub OIDC trust policy to allow PR workflow contexts for this repository.
- [ ] Create or designate a shared non-production database for preview environments.
- [ ] Store preview database credentials in AWS Secrets Manager.
- [ ] Allow the GitHub deploy role to read the preview DB secret and deploy or destroy preview stacks.
- [ ] Confirm the role can assume the necessary CDK bootstrap roles in the preview account and region.

## Suggested Implementation Order For Codex

1. Refactor the CDK app to support stage-aware naming and stack selection.
2. Add preview mode that reuses a shared external database instead of provisioning RDS.
3. Add the preview deployment workflow.
4. Add the preview destroy workflow.
5. Add PR comment updates and concurrency controls.
6. Leave stale-resource cleanup as a follow-up task.

## Acceptance Criteria

- Opening or updating a PR to `main` creates or refreshes a preview environment.
- The PR receives a comment with working frontend and API URLs.
- Closing the PR destroys the preview stack automatically.
- Preview stacks do not collide with production resource names.
- Preview environments do not create a dedicated RDS instance per PR.

## Explicit Non-Goals For The First Preview Rollout

- Per-PR dedicated databases
- Cross-account preview promotion workflows
- Automatic data seeding per PR
- Full rollback orchestration
- Scheduled stale-preview cleanup in the first implementation

## Follow-Up Improvement After Preview Rollout

If preview environments become a core part of the team workflow, the next improvement should be to move the frontend away from a deploy-time API URL dependency. A stable preview API hostname pattern, or same-origin routing through CloudFront, would simplify both the preview and production workflows.
