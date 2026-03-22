# Infrastructure Cost Estimate

Estimate date: March 21, 2026

This document estimates the monthly AWS cost for the current infrastructure at roughly 10 daily users.

These estimates are directional, not invoice-accurate. They are intended to help decide whether the current architecture is proportionate to expected usage and where the biggest savings are.

## Scope

This estimate covers three scenarios:

1. Current stack as coded
2. Current architecture after removing the unused in-stack RDS
3. Production plus one active preview environment using the selected shared DB strategy

## Key Finding

The current stack provisions an RDS instance, but the application runtime is configured to use an external database via `EXISTING_DB_HOST`.

That means the current design can pay for:

- one RDS instance created by the CDK stack
- plus a separate external database the application actually uses

In practical terms, the biggest likely waste is an unused RDS instance.

## Assumptions

- Region: `us-east-1`
- Month length: 720 hours
- Traffic level: about 10 daily users, about 300 visits per month
- Static delivery: about 30,000 CloudFront HTTPS requests and about 3 GB/month transfer out
- API usage: light, with one App Runner instance handling all requests
- No free tier credits, promotional credits, or enterprise discounts applied
- ECR storage and CloudWatch logs are small and treated as low single-digit line items

## Resource Signals From The Repo

- App Runner is sized at `1 vCPU / 2 GB`: [`infra/lib/bank-call-report-stack.ts`](/Users/joshuakraszeski/repos/bank_call_report/infra/lib/bank-call-report-stack.ts)
- Three Secrets Manager secrets are created in the stack: [`infra/lib/bank-call-report-stack.ts`](/Users/joshuakraszeski/repos/bank_call_report/infra/lib/bank-call-report-stack.ts)
- The app requires external DB env vars: [`infra/bin/bank-call-report.ts`](/Users/joshuakraszeski/repos/bank_call_report/infra/bin/bank-call-report.ts)
- The App Runner service reads `props.existingDbHost` instead of the in-stack RDS endpoint: [`infra/lib/bank-call-report-stack.ts`](/Users/joshuakraszeski/repos/bank_call_report/infra/lib/bank-call-report-stack.ts)
- The stack still creates an RDS instance anyway: [`infra/lib/bank-call-report-stack.ts`](/Users/joshuakraszeski/repos/bank_call_report/infra/lib/bank-call-report-stack.ts)

## Pricing Inputs Used

- AWS App Runner pricing: provisioned memory is billed at `$0.007 / GB-hour`, and active instances are billed at `$0.064 / vCPU-hour` and `$0.007 / GB-hour` in `us-east-1`
- AWS Secrets Manager pricing: `$0.40 / secret / month` and `$0.05 / 10,000 API calls`
- Amazon ECR private storage example: `$0.10 / GB-month`
- Amazon S3 Standard request examples: `GET` at `$0.0004 / 1,000 requests`, `PUT` at `$0.005 / 1,000 requests`
- Amazon CloudFront examples commonly use `$0.085 / GB` for data transfer in North America and `$0.01 / 10,000 HTTPS requests`

For RDS, the exact `db.t4g.micro` price is not exposed clearly in the rendered pricing page content available here, so the RDS monthly number below is an inference based on the current Amazon RDS for MySQL pricing model and a typical `us-east-1` small single-AZ MySQL estimate with 20 GiB of general-purpose SSD storage.

## Scenario 1: Current Stack As Coded

Interpretation:

- The CDK stack deploys S3, CloudFront, App Runner, Secrets Manager, and an RDS instance.
- The app also still requires an external DB to exist, because the runtime uses `EXISTING_DB_HOST`.

### Stack-Deployed Cost

| Service | Monthly estimate |
| --- | ---: |
| App Runner provisioned memory floor | $10.08 |
| App Runner active compute at this traffic | $0.05 to $0.20 |
| Secrets Manager, 3 secrets | $1.20 to $1.25 |
| RDS MySQL `db.t4g.micro` + 20 GiB storage | $15.00 to $18.00 |
| CloudFront + S3 at light traffic | $0.20 to $0.40 |
| ECR + CloudWatch logs | $0.20 to $0.50 |
| **Estimated stack total** | **$26.73 to $30.43** |

### Practical All-In Cost

If the external DB the app actually uses is another small managed MySQL instance, add approximately:

- external DB: `$15.00 to $18.00 / month`

That gives a practical all-in estimate of:

- **$41.73 to $48.43 / month**

### Readout

This is the most expensive scenario because it likely pays for two databases while only using one.

## Scenario 2: Remove The Unused In-Stack RDS

Interpretation:

- Keep the external DB the app already depends on.
- Remove the RDS instance and related unused DB-generation path from the application stack.

### App Stack Cost

| Service | Monthly estimate |
| --- | ---: |
| App Runner provisioned memory floor | $10.08 |
| App Runner active compute at this traffic | $0.05 to $0.20 |
| Secrets Manager, 2 to 3 secrets depending on final cleanup | $0.80 to $1.25 |
| CloudFront + S3 at light traffic | $0.20 to $0.40 |
| ECR + CloudWatch logs | $0.20 to $0.50 |
| **Estimated stack total after cleanup** | **$11.33 to $12.43** |

### Practical All-In Cost

Add the external database that the app still uses:

- external DB: `$15.00 to $18.00 / month`

Result:

- **$26.33 to $30.43 / month**

### Readout

This is the cheapest practical production setup if you continue to use the external DB.

## Scenario 3: Production + One Active Preview Environment Using Option A

Interpretation:

- Production uses the optimized app stack from Scenario 2
- One preview environment is active continuously for a full month
- Preview environments use the selected shared non-production DB strategy, so no dedicated per-preview RDS is created

### Estimated Monthly Cost

| Service group | Monthly estimate |
| --- | ---: |
| Production app stack | $11.33 to $12.43 |
| One always-on preview app stack | $11.33 to $12.43 |
| Shared external DB | $15.00 to $18.00 |
| **Estimated total** | **$37.66 to $42.86** |

### If Preview Environments Are Truly Ephemeral

If preview environments are created only while a PR is active and are torn down outside working hours, the preview cost should usually be much lower than the full-time estimate above.

A reasonable working estimate for a part-time preview environment is:

- preview stack cost: **about $4 to $7 / month on average**

That would put the combined production + preview estimate closer to:

- **about $30 to $37 / month**

## Findings

1. At 10 daily users, the bill is dominated by fixed monthly infrastructure, not traffic volume.
2. App Runner sets a real baseline cost even when traffic is minimal because one provisioned container stays warm.
3. The current code appears to pay for an RDS instance that the running app does not use.
4. The selected shared-DB preview strategy is cost-efficient compared with one database per PR.
5. Preview environments are affordable only if they stay ephemeral. Leaving one up 24/7 roughly doubles the app-stack portion of the bill.

## Suggested Next Steps

1. Remove the in-stack RDS resource if the application is meant to use an external database permanently.
2. Remove any now-unused generated DB secret and any unused database wiring that remains after that cleanup.
3. Add cost allocation tags for `environment`, `owner`, and `service` before enabling preview environments.
4. Configure preview workflows to auto-destroy on PR close and consider a stale-preview cleanup job.
5. Consider downsizing or pausing non-production App Runner services if previews will be sparse.
6. If cost minimization matters more than always-warm latency, evaluate whether App Runner is still the right fit for this usage pattern.
7. Confirm exact RDS pricing with the AWS Pricing Calculator before using this estimate for budgeting approval.

## Sources

- AWS App Runner pricing: https://aws.amazon.com/apprunner/pricing/
- Amazon RDS for MySQL pricing: https://aws.amazon.com/rds/mysql/pricing/
- AWS Secrets Manager pricing: https://aws.amazon.com/secrets-manager/pricing/
- Amazon ECR pricing: https://aws.amazon.com/ecr/pricing/
- Amazon S3 pricing: https://aws.amazon.com/s3/pricing
- Amazon CloudFront pricing: https://aws.amazon.com/cloudfront/pricing/
- AWS CloudFront pricing examples from AWS docs: https://docs.aws.amazon.com/solutions/latest/cloud-migration-factory-on-aws/cost.html
- AWS S3 pricing examples from AWS docs: https://docs.aws.amazon.com/solutions/latest/live-streaming-on-aws-with-amazon-s3/cost-example-1.html
