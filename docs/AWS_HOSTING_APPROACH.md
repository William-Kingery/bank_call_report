# AWS Hosting Proposal (Simple + Production-Ready)

## Recommendation

Use this architecture:

- Frontend (`client`, Next.js): **AWS Amplify Hosting**
- Backend (`server`, Express API): **AWS App Runner**
- Database (MySQL): **Amazon RDS for MySQL**
- Secrets: **AWS Secrets Manager**
- DNS + TLS: **Route 53 + ACM**

This is the best simple approach for this app because it avoids Kubernetes/ECS complexity, keeps operations light, and cleanly maps to your existing split between `client` and `server`.

## Why this is the best simple fit

- Your app is already split into frontend + API + MySQL.
- Amplify makes Next.js deployment straightforward from Git.
- App Runner runs your Node API as a managed service with auto deploy, health checks, and scaling.
- RDS gives reliable managed MySQL without self-hosting a database.
- You can ship quickly with minimal DevOps overhead.

## Target architecture

1. User opens app at `app.yourdomain.com` (Amplify).
2. Next.js frontend calls API at `api.yourdomain.com` (App Runner).
3. App Runner connects privately to RDS MySQL in a VPC.
4. App Runner reads DB credentials from Secrets Manager.

## Implementation plan

## 1) Prepare environment/config

- In API (`server`), set production env vars:
  - `PORT` (App Runner sets this automatically; keep fallback)
  - `DB_HOST`
  - `DB_PORT`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_NAME`
- In frontend (`client`), set:
  - `NEXT_PUBLIC_API_BASE=https://api.yourdomain.com`

## 2) Provision database (RDS MySQL)

- Create MySQL RDS instance in private subnets.
- Apply security group rules:
  - Allow inbound `3306` only from App Runner VPC connector SG.
- Load FDIC tables/data:
  - `fdic_structure`
  - `fdic_fts`
  - `fdic_rat`

## 3) Deploy backend on App Runner

- Option A: Deploy from source repo (fastest to start).
- Option B: Deploy from container image (more control).
- Configure:
  - Health check path: `/api/health`
  - Environment variables from Secrets Manager
  - VPC connector to reach private RDS
  - CORS origin to your Amplify domain

## 4) Deploy frontend on Amplify

- Connect GitHub repo and select `client/` as app root.
- Build settings:
  - Install: `npm ci`
  - Build: `npm run build`
- Set `NEXT_PUBLIC_API_BASE` to your App Runner API URL.
- Add custom domain (`app.yourdomain.com`) with managed cert.

## 5) Add domain + TLS

- Route 53 records:
  - `app.yourdomain.com` -> Amplify
  - `api.yourdomain.com` -> App Runner custom domain
- Use ACM-managed certificates for both domains.

## 6) Harden before production

- Enable automated RDS backups.
- Turn on App Runner logs/metrics and CloudWatch alarms.
- Restrict DB inbound strictly to App Runner SG.
- Keep secrets in Secrets Manager (not plaintext env in repo).
- Add basic rate limiting at API layer if needed.

## Cost-conscious starting profile

- Amplify Hosting: small monthly cost for low traffic.
- App Runner: pay for active service + requests.
- RDS: start with small instance (e.g., burstable class), scale up later.

If you need to minimize cost further for non-production, use smaller instance classes and stop non-essential environments outside working hours.

## Minimal code changes needed

1. Make API CORS origin configurable via env (instead of hardcoded localhost).
2. Ensure API reads all DB config from env (already supported).
3. Set `NEXT_PUBLIC_API_BASE` in Amplify environment settings.

## Alternative (even simpler, but less robust)

Single EC2 instance running:

- Next.js app
- Express API
- MySQL (or external DB)

This is simpler initially but not recommended for production due to higher ops burden, weaker scaling, and greater failure blast radius.

## Summary

For this codebase, **Amplify + App Runner + RDS** is the best balance of:

- Fast setup
- Low operational overhead
- Production-grade reliability
- Clean separation between frontend, API, and data
