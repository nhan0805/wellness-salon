# Cloudflare Target Architecture

**Date:** 2026-10-17
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
- The remote `wellness-salon` D1 database exists and now records migrations `0001` through `0004`; the 2026-10-17 apply preserved existing data and did not reset or import production data. Separate local migrations remain the repeatable disposable test state.
- `src/server/db.ts` requires the Cloudflare `DB` binding and initializes the generated D1 client/adapter. The path uses an explicit WASM compiler entrypoint and an application lease for critical write sections.
- `src/server/auth.ts` provides the Worker-compatible session boundary; it does not load Auth.js or any Node-only authentication package in the Worker bundle.
- Critical D1 write branches now cover kiosk check-in, staff actions, payment lifecycle, appointment mutations, reconciliation, closing, retention, and admin CRUD with guarded batches and replay receipts. Batch coverage does not replace crash/interruption, full concurrency, remote, or capacity evidence.
- The current domain modules, queue state machines, idempotency contracts, audit records, staff/session guards, public-board redaction, SSE fallback, and BR-01–BR-06 behavior are exercised against D1 by the active local E2E gate.

## Required production layers before traffic cutover

1. A SQLite/D1 schema and fresh migration set with owner-approved numeric/date/enum/JSON representations. The current schema is executable and locally verified, but not the final money representation.
2. A D1 data-access layer that does not instantiate a non-Worker database client in Worker routes. Implemented and locally verified; remote artifact smoke remains required.
3. Explicit batch-based command implementations and conflict/idempotency guards for critical mutations. Implemented locally; the remaining gate is evidence under failure and concurrency, not source presence alone.
4. A D1-compatible account/session/auth boundary with the same role and PIN semantics. Implemented locally with Web Crypto PBKDF2 and HS256 cookies; remote smoke evidence remains required.
5. Worker-runtime tests for health, services, kiosk check-in, board mutations, admin mutations, cron authorization, SSE/polling, and auth. The local gate is implemented as `npm run test:e2e:d1`; remote coverage remains required.
6. The owner-selected IANA timezone written to ShopConfig before closing and retention jobs are enabled.

## Deployment gate

Until every layer above is implemented and verified, production traffic cutover must remain disabled. The initial workers.dev deployment is reachable for supervised verification; no command in this repository creates additional Cloudflare resources automatically.

