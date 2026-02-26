# Bank Call Report Explorer

A full-stack web app for exploring FDIC call report trends by bank name.  
Search institutions by `NAMEFULL`, select a bank, and view quarterly performance, asset-quality, and capital metrics.

## What this app does

- Autocomplete search by bank name (`NAMEFULL`)
- Loads bank-level time series by `CERT`
- `Performance` tab: Liabilities, Equity, ROE, ROA (latest quarter)
- `Asset Quality` tab: criticized/classified assets mix + quarterly trend + table
- `Capital` tab: key capital/loan ratio trends across recent quarters
- Toggleable quarter windows (`Latest 9 Qtrs` / `Latest 4 Qtrs`)

## Tech stack

- Frontend: Next.js 14, React 18
- Backend: Node.js, Express 4
- Database: MySQL (`mysql2/promise`)

## Repository layout

```text
.
├── client/   # Next.js frontend
└── server/   # Express API + MySQL integration
```

## Scripts

### Server (`server/package.json`)

- `npm run dev` - start with nodemon
- `npm start` - start with node

### Client (`client/package.json`)

- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm start` - run production server

## Prerequisites

- Node.js 18+ (recommended: 20 LTS)
- npm 9+
- MySQL 8+ with FDIC data loaded

## Quick start

1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

2. Configure server environment variables

Create `server/.env`:

```env
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database
```

3. Configure client API base (optional)

By default, the client calls `http://localhost:4000`.  
If needed, create `client/.env.local`:

```env
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

4. Run the backend

```bash
cd server
npm run dev
```

5. Run the frontend

```bash
cd client
npm run dev
```

6. Open the app

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/api/health`

## API endpoints

### Health

- `GET /`
  - Basic server status message
- `GET /api/health`
  - Checks server + database connectivity

### Data

- `GET /search?query=<text>`
  - Returns up to 20 matching institutions from `fdic_structure`
  - Query length under 2 chars returns an empty result set
- `GET /charts?cert=<number>`
  - Returns institution profile + quarterly time-series points
  - 400 on invalid `cert`
  - 404 when bank is not found

### Schema helpers

- `GET /schema/tables`
- `GET /schema/table/:tableName`
- `GET /schema/keys`

Useful for inspecting what is loaded in the active MySQL schema.

## Required database tables

The current API queries these tables:

- `fdic_structure`
- `fdic_fts`
- `fdic_rat`

Minimum fields referenced:

- `fdic_structure`: `CERT`, `NAMEFULL`, `CITY`, `STATENAME`, `ZIPCODE`, `CALLYM`
- `fdic_fts`: `CERT`, `CALLYM`, `ASSET`, `EQ`, `CCIDOUBT`
- `fdic_rat`: `CERT`, `CALLYM`, `ROE`, `ROA`, `EQTANQTA`, `LNCIT1R`, `LNCONT1R`, `LNHRSKR`, `LNCDT1R`

## Development notes

- CORS is currently restricted to `http://localhost:3000` in `server/index.js`
- Backend startup verifies DB connectivity (`SELECT 1`) before listening
- Client debounce for search is 300ms

## Troubleshooting

- `Failed to connect to MySQL database` on startup:
  - Verify `server/.env` and DB credentials
  - Confirm MySQL is running and reachable from your machine
- Empty search results:
  - Ensure `fdic_structure` has data
  - Search with at least 2 characters
- Client cannot reach API:
  - Confirm server is running on port `4000`
  - Check `NEXT_PUBLIC_API_BASE` in `client/.env.local`
