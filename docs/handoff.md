# Handoff

Last updated: 2026-10-14

## Runtime

Wellness Salon is a tablet-first operations app for one nail shop. The only supported runtime is a Cloudflare Worker backed by D1 (SQLite). Local development and E2E use a disposable local D1 database; the Worker `DB` binding is required and a missing binding is a startup/health failure.

The deployed Worker is `https://wellness.n8l.workers.dev`. The recorded version is `ca6490a9-345d-4a25-b69a-be93ecd6a8ce`; read-only health, catalog, board, and kiosk smoke passed. Remote auth, mutation, scheduler, capacity, and final production approval remain explicit gates. Local tests must never mutate remote D1.

## Current status

- Kiosk, public turn board, protected staff actions, admin queue/payment/reports, customer/staff/service/account management, appointment history, and audited payment correction/refund records are implemented.
- The Worker auth boundary uses Web Crypto PBKDF2/HS256 and D1-backed session/lockout state. Bootstrap credentials remain environment-only.
- Critical mutation paths use D1 batches, predicates, leases, command receipts, and audit rows. D1 is not treated as a rollback transaction boundary; interruption and concurrency evidence remain release gates.
- The canonical database-backed gate is `npm run test:e2e:d1`: build Worker artifact, apply D1 migrations, generate the 101-statement disposable bootstrap, and run the Worker Playwright suite.
- Previously recorded evidence includes 51/51 unit tests and 25/26 Worker/D1 cases, with one intentional desktop-project skip. Re-run the commands below after meaningful changes.

## Local workflow

```bash
npm install
npm run db:generate
npm run dev
```

Open `http://127.0.0.1:3001`. For the disposable full gate:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build:vinext
npm run test:e2e:d1
```

The local D1 configuration is `wrangler.local.jsonc`. Schema and migrations live under `prisma/d1/`; the generated client is `@prisma/d1-client`. The bootstrap generator is `scripts/seed-d1-bootstrap.ts`, and the closing helper is `scripts/trigger-closing.sh`.

## Important paths

- `src/server/db.ts` — Worker D1 binding, adapter, lease, and batch boundary.
- `src/server/auth.ts` and `src/server/security.ts` — Worker-compatible sessions, PBKDF2 verification, and D1 lockouts.
- `src/server/services/prisma-operations.ts` — D1 reads and guarded mutation orchestration.
- `src/server/services/admin-operations.ts` — D1-backed catalog, account, customer, staff, and configuration operations.
- `prisma/d1/schema.prisma` and `prisma/d1/migrations/` — the only schema/migration source of truth.
- `scripts/run-d1-e2e.mjs` and `playwright.d1.config.ts` — local Worker/D1 E2E harness.
- `wrangler.local.jsonc` and `wrangler.production.jsonc` — local/remote binding and deployment configuration.

## Environment and safety

Use `.env.example` as the variable inventory and keep actual `.env` values private. Do not print credentials, tokens, or the contents of `.env`. Local E2E uses disposable state and must not be pointed at production D1. Remote migration, secret changes, deploys, scheduler activation, and data recovery require explicit owner approval.

## Open gates

- Physical iPad/WebKit, real-network interruption, Dynamic Type/VoiceOver, and offline behavior.
- D1 interruption/failure-injection and broader concurrency evidence for queue, payment, closing, retention, and session paths.
- Deployed Worker authentication/mutation/SSE/scheduler smoke and Free-tier capacity observation.
- D1 export/restore rehearsal, production secret handling, domain/TLS, scheduler alerting, and final approval.

## Framework note

Read `AGENTS.md` before framework changes. This repository uses the installed Next.js guidance under `node_modules/next/dist/docs/`, but the application is built and verified through the Worker-compatible vinext path.
