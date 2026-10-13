# Cloudflare Target Architecture

**Date:** 2026-10-13  
**Status:** The Worker/D1 artifact and canonical E2E path are verified, and the first workers.dev deployment is live; production traffic rollout remains blocked by interruption, concurrency, scheduler, capacity, and remote evidence.

## Target runtime

```text
Browser / tablet
        |
        v
Cloudflare Worker (vinext fetch handler)
        |-- static assets / rendered routes
        |-- API handlers
        |-- Web Crypto PBKDF2 + HS256 signed session boundary
        |-- D1 adapter and explicit write orchestration
        |-- bounded SSE/polling responses
        |
        +--> D1: existing `wellness-salon` remote database (preserved in this deployment)
```

The intended first public endpoint is the default `workers.dev` hostname. A custom domain is out of scope for the initial migration. There is no persistent staging environment in this plan.

## Current versus target boundary

- `cloudflare.config.ts` defines the Worker name, compatibility date, `nodejs_compat`, assets, D1 binding `DB`/`wellness-salon`, inert scheduler variables, and `src/worker.ts` as the fetch/scheduled entrypoint.
- The remote `wellness-salon` D1 database exists and was verified read-only before deployment; no remote migration, reset, or data import was run as part of this deployment. Separate local migrations remain the repeatable disposable test state.
- `src/server/db.ts` selects the PostgreSQL client when the Cloudflare binding is absent and the generated D1 client/adapter when `DB` is present. The D1 path uses an explicit WASM compiler entrypoint and an application lease for the current compatibility smoke.
- `src/server/auth.ts` provides the Worker-compatible session boundary; it does not load Auth.js or any Node-only authentication package in the Worker bundle.
- Critical D1 write branches now cover kiosk check-in, staff actions, payment lifecycle, appointment mutations, reconciliation, closing, retention, and admin CRUD with guarded batches and replay receipts. The local lease remains for compatibility reads/fallbacks; batch coverage does not replace crash/interruption, full concurrency, remote, or capacity evidence.
- The current domain modules, queue state machines, idempotency contracts, audit records, staff/session guards, public-board redaction, SSE fallback, and BR-01–BR-06 behavior are exercised against D1 by the active local E2E gate.
- The PostgreSQL schema and migrations remain a legacy compatibility/rollback path for the existing Docker runtime. They are not D1 migrations by filename substitution and are not the active behavioral test target.

## Required production layers before traffic cutover

1. A SQLite/D1 schema and fresh migration set with owner-approved numeric/date/enum/JSON representations. The current schema is executable and locally verified, but not the final money representation.
2. A D1 data-access layer that does not instantiate the PostgreSQL Prisma client in Worker routes. Implemented and locally verified; remote artifact smoke remains required.
3. Explicit batch-based command implementations and conflict/idempotency guards for critical mutations. Implemented locally; the remaining gate is evidence under failure and concurrency, not source presence alone.
4. A D1-compatible account/session/auth boundary with the same role and PIN semantics. Implemented locally with Web Crypto PBKDF2 and HS256 cookies; remote smoke evidence remains required.
5. Worker-runtime tests for health, services, kiosk check-in, board mutations, admin mutations, cron authorization, SSE/polling, and auth. The local gate is implemented as `npm run test:e2e:d1`; remote coverage remains required.
6. The owner-selected IANA timezone written to ShopConfig before closing and retention jobs are enabled.

## Deployment gate

Until every layer above is implemented and verified, production traffic cutover must remain disabled. The initial workers.dev deployment is reachable for supervised verification; no command in this repository creates additional Cloudflare resources automatically.

