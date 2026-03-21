# Authentication Plan

This is the proposed runbook for adding basic authentication to the current site without building a full user-management product.

## Recommendation

Use this authentication model:

- Frontend (`client`, Next.js static export): authenticated pages + login form
- Backend (`server`, Express API): login, logout, session validation middleware
- Database (existing MySQL): `app_users` table for users
- Session model: signed session token stored in a secure cookie
- Password storage: `bcrypt` hashed passwords only

This is the best simple fit for the current app because it adds a real login boundary without introducing password reset flows, profile settings, OAuth providers, or a separate identity platform.

## Scope

Include:

- Login page
- Logout action
- Route protection for authenticated app pages
- Server-side session validation
- Admin-created users in the database
- Role field if you want future admin-only features

Do not include:

- User signup
- Password reset
- Change password UI
- Email verification
- MFA
- Social login

## Why this is the best simple fit

- The app already has a single backend API where auth checks can live.
- The site does not need public user onboarding.
- A database-backed user table is enough for a small controlled user list.
- Cookie-based sessions are simpler operationally than adding Cognito or Auth0 right now.
- This approach keeps the authentication surface small and easy to audit.

## Target authentication flow

1. User opens the site.
2. If there is no valid session, the frontend shows the login screen.
3. User submits email/username + password to the API.
4. API verifies the password hash in MySQL.
5. API sets a secure session cookie and returns authenticated user metadata.
6. Frontend loads protected app data only after session validation succeeds.
7. Logout clears the session cookie and returns the user to the login screen.

## Recommended implementation

## 1) Database schema

Add an `app_users` table in the existing `usbanks` database.

Suggested columns:

- `id`
- `email` or `username`
- `password_hash`
- `role`
- `is_active`
- `created_at`
- `updated_at`
- `last_login_at`

Optional:

- `display_name`

Keep passwords out of plaintext forever. Store only bcrypt hashes.

## 2) Session strategy

Use a signed token in an HTTP-only cookie.

Recommended behavior:

- `Secure`
- `HttpOnly`
- `SameSite=None` while frontend and API are on different domains
- short expiration, for example 8 to 24 hours

Because the current deployment uses separate domains (`cloudfront.net` and `awsapprunner.com`), the frontend requests must send credentials and the API must allow credentialed CORS.

## 3) Backend changes

Add routes such as:

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

Add middleware:

- `requireAuth`

Apply `requireAuth` to app data routes that should not be public.

The server should:

- look up the user by email or username
- reject inactive users
- compare the submitted password with `bcrypt.compare`
- issue the session cookie
- return a minimal user payload

## 4) Frontend changes

Add:

- login page or login state in the main app shell
- auth context or session state
- initial session check on app load
- logout control

Protected pages should:

- call `/auth/me` on load
- show a loading state while session status is unknown
- redirect or swap to login UI if unauthenticated
- fetch app data only after auth succeeds

## 5) CORS and cookie handling

For the current deployment model, the API must:

- allow the frontend origin exactly
- allow credentials
- support cookie-based requests from the frontend

The frontend must use:

- `credentials: 'include'`

If you later move to custom domains like `app.yourdomain.com` and `api.yourdomain.com`, cookie handling becomes cleaner and should be revisited.

## 6) User provisioning

Do not build a signup flow.

Instead:

- create users directly in MySQL
- hash passwords before insert
- optionally provide a small local admin script for creating and disabling users

That script is enough for the current scope and keeps auth administration off the public site.

## Environment/config

Add backend env vars such as:

- `SESSION_SECRET`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=None`
- `AUTH_COOKIE_NAME`
- existing DB vars already in use

If needed later:

- `AUTH_SESSION_TTL_HOURS`

## Suggested rollout plan

1. Add `app_users` schema and seed one admin/test user.
2. Add backend login/logout/session routes.
3. Add auth middleware and protect data endpoints.
4. Add frontend login flow and session bootstrap.
5. Verify login locally against `usbanks`.
6. Deploy to App Runner.
7. Validate cookie/session behavior in the deployed environment.

## Minimal code changes needed

1. Add `bcrypt` and a session-signing library on the backend.
2. Add auth routes and auth middleware in `server`.
3. Add login UI and session state handling in `client`.
4. Update frontend fetch calls to include credentials.
5. Update CORS config to explicitly support authenticated frontend requests.

## Risks and tradeoffs

- Cookie auth across `cloudfront.net` and `awsapprunner.com` requires careful cookie settings.
- Protecting all data endpoints will change current public behavior.
- If route protection is partial, sensitive data can still leak through old endpoints.
- Long-lived sessions increase risk if a cookie is stolen.

## Recommendation for this repo

Start with:

- one `app_users` table
- bcrypt password hashes
- cookie session auth
- no signup/reset/settings UI
- all main data routes protected

That gives you a clean, controlled authentication layer with minimal product scope.
