# Authentication Portability

**Date:** 2026-10-19
**Status:** Worker/D1 authentication path is locally verified and the deployed Worker passed admin login/session/logout plus authenticated read-only smoke. Business mutation and final production approval gates remain separate.

## Behavior preserved

- Role-aware access for admin, staff, and station surfaces.
- Signed, short-lived JWT sessions with database-backed active-user and session-version revalidation.
- Verified staff PIN/session checks for board mutations.
- Database-backed PIN and login lockout state.
- Generic credential errors, trusted-origin checks, auditability, and environment-only bootstrap credentials.

## Worker-compatible boundary

The Worker route at /api/auth/[...nextauth] now uses the local handleAuthRequest implementation rather than loading Auth.js at runtime. It supports session, CSRF, login/callback credentials, logout, role redirects, cookie expiry, and active-user/session-version checks without a Node-only dependency.

The session cookie is an HttpOnly, SameSite=Strict signed HS256 token. Production requires AUTH_SECRET with at least 32 characters and uses a secure cookie unless AUTH_COOKIE_SECURE=false is deliberately selected for a non-production test.

## Worker-safe password and PIN hashing

New credentials use Web Crypto PBKDF2-HMAC-SHA-256:

~~~text
pbkdf2-sha256$310000$<base64url salt>$<base64url digest>
~~~

The Worker can verify this format without native modules or dynamic WASM compilation. Existing Argon2id PHC hashes remain readable for account migration and should be rotated when each account next changes its password or PIN. New bootstrap credentials use PBKDF2; no native Argon2 package is required.

tests/unit/security.test.ts covers matching and non-matching PBKDF2 secrets and malformed hashes. The local D1 HTTP smoke and deployed read-only smoke verified successful login, session retrieval, logout, and generic failure handling without printing credentials.

## Fresh D1 bootstrap

npm run db:seed:d1:sql runs scripts/seed-d1-bootstrap.ts. It requires owner-supplied environment values, validates the IANA timezone and four-digit staff PIN, emits only idempotent SQL, and intentionally creates no demo appointments or imported production data. Review the generated SQL file before applying it with Wrangler.

The complete beginner sequence for a new Cloudflare account is in the [Word deployment guide](DEPLOY_NEW_CLOUDFLARE_ACCOUNT_GUIDE.docx). It keeps bootstrap credentials in interactive local environment variables, writes the SQL artifact outside the repository, and applies it only to the newly reviewed remote D1 database.

Never put AUTH_SECRET, passwords, PINs, database credentials, or API tokens in repository files or command output. Use Wrangler's secure secret flow for runtime secrets after the production approval gate.

## Release gate

The local Worker/D1 auth boundary is no longer the blocker, the required Worker secret names are present, and authenticated read-only smoke passes against the deployed Worker. Keep the supervised-pilot gate until critical D1 mutation paths have explicit interruption/concurrency evidence and the owner approves production operation.
