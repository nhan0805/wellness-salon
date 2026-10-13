# Cloudflare Target Architecture

**Date:** 2026-10-13  
**Status:** Local Worker/D1 artifact and broad command smoke path are deployable in shape; production rollout remains blocked by interruption, concurrency, scheduler, capacity, and remote evidence.

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
        +--> D1: fresh production database, created only after approval
```

The intended first public endpoint is the default `workers.dev` hostname. A custom domain is out of scope for the initial migration. There is no persistent staging environment in this plan.

## Current versus target boundary

- `cloudflare.config.ts` defines the Worker name, compatibility date, `nodejs_compat`, assets, D1 binding `DB`/`wellness-salon`, inert scheduler variables, and `src/worker.ts` as the fetch/scheduled entrypoint.
- No remote D1 database exists. A separate local D1 migration has been applied only to disposable Wrangler state.
- `src/server/db.ts` selects the PostgreSQL client when the Cloudflare binding is absent and the generated D1 client/adapter when `DB` is present. The D1 path uses an explicit WASM compiler entrypoint and an application lease for the current compatibility smoke.
- `src/server/auth.ts` provides the Worker-compatible session boundary; it does not load Auth.js or any Node-only authentication package in the Worker bundle.
- Critical D1 write branches now cover kiosk check-in, staff actions, payment lifecycle, appointment mutations, reconciliation, closing, retention, and admin CRUD with guarded batches and replay receipts. The local lease remains for compatibility reads/fallbacks; batch coverage does not replace crash/interruption, full concurrency, remote, or capacity evidence.
- The current domain modules, queue state machines, idempotency contracts, audit records, staff/session guards, public-board redaction, SSE fallback, and BR-01–BR-06 behavior remain the behavioral reference.
- The PostgreSQL schema and migrations remain a reference path for the existing Docker runtime. They are not D1 migrations by filename substitution.

## Required production layers before deployment

1. A SQLite/D1 schema and fresh migration set with owner-approved numeric/date/enum/JSON representations. The current schema is an executable baseline, not the final money representation.
2. A D1 data-access layer that does not instantiate the PostgreSQL Prisma client in Worker routes.
3. Explicit batch-based command implementations and conflict/idempotency guards for critical mutations; the remaining gate is evidence under failure and concurrency, not only source presence.
4. A D1-compatible account/session/auth boundary with the same role and PIN semantics. The local implementation uses Web Crypto PBKDF2 and HS256 cookies; remote smoke evidence remains required.
5. Worker-runtime tests for health, services, kiosk check-in, board mutations, admin mutations, cron authorization, SSE/polling, and auth.
6. The owner-selected IANA timezone written to ShopConfig before closing and retention jobs are enabled.

## Deployment gate

Until every layer above is implemented and verified, production traffic must remain disabled. No command in this repository creates Cloudflare resources automatically.

