# Bank Call Report Explorer

A full-stack web app for exploring FDIC call report trends by bank name.

## What this app does

- Search institutions by full or partial `NAMEFULL`
- Select a bank by `CERT`
- View quarterly performance, asset-quality, and capital metrics
- Toggle quarter windows (`Latest 9 Qtrs` / `Latest 4 Qtrs`)

## Tech stack

- Frontend: Next.js 14, React 18
- Backend: Node.js, Express 4
- Database: MySQL (`mysql2/promise`)
- Infrastructure: AWS CDK (S3/CloudFront, App Runner, RDS, Secrets Manager)

## Repository layout

```text
.
├── client/   # Next.js frontend
├── server/   # Express API + MySQL integration
├── infra/    # AWS CDK infrastructure
└── docs/     # User and deployment documentation
```

## Local development quick start

1. Install dependencies:

```bash
cd server && npm install
cd ../client && npm install
```

2. Configure server environment variables in `server/.env`:

```env
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database
CORS_ORIGIN=http://localhost:3000
```

3. (Optional) configure client API base in `client/.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

4. Run backend:

```bash
cd server
npm run dev
```

5. Run frontend:

```bash
cd client
npm run dev
```

6. Open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/api/health`

## API endpoints

- `GET /`
- `GET /api/health`
- `GET /search?query=<text>`
- `GET /charts?cert=<number>`
- `GET /schema/tables`
- `GET /schema/table/:tableName`
- `GET /schema/keys`

## Required database tables

- `fdic_structure`
- `fdic_fts`
- `fdic_rat`

## AWS CDK deployment

The current infrastructure implementation is in `infra/` and deploys:

- `client` static export -> S3 + CloudFront
- `server` container -> App Runner
- MySQL -> Amazon RDS
- DB credentials -> AWS Secrets Manager

Use the deployment runbook in [`infra/README.md`](./infra/README.md) and the root deployment checklist below:

1. Install dependencies (`client`, `server`, `infra`)
2. Run `cd infra && npx cdk bootstrap` (one-time per account/region)
3. Build frontend with temporary API URL
4. Deploy with `cd infra && npx cdk deploy`
5. Rebuild frontend with real `ApiUrl` output and deploy again
6. Load FDIC data into RDS

## Additional docs

- User guide: [`docs/README.md`](./docs/README.md)
- AWS hosting approach: [`docs/AWS_HOSTING_APPROACH.md`](./docs/AWS_HOSTING_APPROACH.md)
- GitHub Actions CI/CD plan: [`docs/GITHUB_ACTIONS_CICD_SETUP.md`](./docs/GITHUB_ACTIONS_CICD_SETUP.md)
- Post-deploy iteration roadmap: [`docs/POST_DEPLOY_ITERATIONS.md`](./docs/POST_DEPLOY_ITERATIONS.md)
