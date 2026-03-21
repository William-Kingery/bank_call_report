# Post-Deployment Iteration Plan

This document lists the next areas to address after initial infrastructure is live and the application is deployed.

Use it as a phased backlog for hardening, scaling, and operational maturity.

## Iteration 1 (Immediate Hardening: Week 1)

## 1) Security Baseline

- Enforce least-privilege IAM for all deployment/runtime roles
- Enable AWS Config + Security Hub + GuardDuty
- Turn on CloudTrail in all regions
- Confirm Secrets Manager rotation plan for DB credentials
- Add AWS WAF in front of CloudFront

Exit criteria:

- Security scanning enabled in AWS and producing findings
- No plaintext secrets in repo, CI logs, or app config
- WAF attached to frontend distribution

## 2) TLS, Domains, and Access Controls

- Move from default service URLs to custom domains
- Issue/validate ACM certs and enforce HTTPS only
- Restrict CORS to approved production and preview domains
- Restrict RDS access only to required security groups/subnets

Exit criteria:

- Custom domains are active for frontend and API
- Security group ingress rules are minimized and documented

## 3) Observability Baseline

- Define structured logging format for API
- Create CloudWatch dashboards for latency, error rate, and saturation
- Add alarms for:
  - App Runner 5xx or elevated latency
  - RDS CPU, storage, and connection pressure
  - Failed health checks

Exit criteria:

- Dashboard and alarm set exist and are tested
- On-call destination configured (email/Slack/PagerDuty)

## Iteration 2 (Reliability and Release Safety: Weeks 2-4)

## 1) CI/CD Guardrails

- Require tests and lint checks before merge to `main`
- Add deployment rollback procedure
- Add deployment concurrency controls to avoid overlapping deploys
- Add stale preview environment cleanup job

Exit criteria:

- Failed checks block merge
- Rollback runbook exists and has been tested once

## 2) Backup and Recovery

- Validate RDS automated backups and retention policy
- Define and test restore procedure to a new instance
- Document RTO and RPO targets

Exit criteria:

- Successful restore drill completed
- RTO/RPO documented and agreed

## 3) Data Operations

- Formalize FDIC data load/update process (schedule + validation)
- Add data quality checks for required tables (`fdic_structure`, `fdic_fts`, `fdic_rat`)
- Alert on missing or stale data loads

Exit criteria:

- Data freshness SLA defined and monitored
- Data validation failures trigger alerts

## Iteration 3 (Scaling and Performance: Month 2+)

## 1) API and Database Performance

- Add indexes based on query plan analysis for `/search` and `/charts`
- Add query latency instrumentation
- Tune App Runner instance size and concurrency from real traffic
- Evaluate RDS class/storage scaling policy

Exit criteria:

- p95 latency targets defined and met
- Capacity plan documented for expected growth

## 2) Caching Strategy

- Add CloudFront cache policy tuning for static assets
- Consider API response caching for expensive, read-heavy endpoints
- Add invalidation/versioning strategy for frontend deploys

Exit criteria:

- Measurable reduction in origin/API load from caching

## 3) Load and Resilience Testing

- Run baseline and stress tests against API
- Simulate dependency failures (DB unavailable, slow queries)
- Verify system behavior under degraded conditions

Exit criteria:

- Load test report with bottlenecks and remediation actions
- Resilience gaps prioritized in backlog

## Iteration 4 (Governance and Cost Optimization)

## 1) Cost Management

- Add AWS Budgets and cost anomaly detection
- Tag all resources by environment, owner, and cost center
- Right-size App Runner and RDS based on utilization trends

Exit criteria:

- Monthly budget alerts are active
- All production resources are properly tagged

## 2) Compliance and Audit Readiness

- Document data classification and retention requirements
- Add access review cadence for AWS and GitHub permissions
- Ensure audit trail retention and retrieval process is defined

Exit criteria:

- Security and access review checklist run on schedule
- Audit evidence can be produced quickly

## 3) Operational Runbooks

- Create runbooks for:
  - incident response
  - database restore
  - failed deployment rollback
  - scaling events
- Assign ownership for each runbook

Exit criteria:

- Runbooks are published and reviewed by engineering team

## Ongoing KPIs To Track

- Deployment frequency
- Change failure rate
- Mean time to recovery (MTTR)
- API p50/p95 latency
- Error rate by endpoint
- RDS utilization (CPU, memory proxy, connections, storage)
- Monthly cloud cost vs budget

## Suggested Next Implementation Order

1. Security baseline + WAF + least-privilege IAM
2. Monitoring/alerts + incident routing
3. CI/CD guardrails + rollback testing
4. Backup/restore drill
5. Query/index optimization + load testing
6. Cost and governance automation
