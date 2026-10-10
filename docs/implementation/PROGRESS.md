# Implementation progress

This tracker records the implementation authorized by the product/engineering brief in the attached user instructions. The existing audit remains at `docs/audits/2026-10-10-nail-salon-mvp-audit.md`.

## Safety baseline

- Repository has no `.git` directory, so a recoverable pre-change source snapshot was created at `/private/tmp/wellness-salon-pre-implementation-20261010.tar.gz`.
- No production database, deployment, or infrastructure was modified.
- The implementation is being kept additive where practical; destructive data operations require an explicit migration or a documented operator action.

## Phase status

| Phase | Scope | Status | Evidence / notes |
|---|---|---|---|
| 0 | Preparation, decisions, baseline, rollback | Complete | Scope, decisions, rollback snapshot, and audit baseline are recorded. |
| 1 | Security and correctness | Complete | Session invalidation, persistent PIN lockout, authorization checks, validation, cancellation, and audit paths are implemented. |
| 2 | Realtime, idempotency, concurrency | Complete | Request receipts, payload-hash conflicts, transaction/advisory locks, monotonic board versions, SSE recovery, and bounded polling are implemented. |
| 3 | Operational workflows | Complete | Attendance/checkout safety, cancellation, reassignment, queue repair, closing, and retention paths are implemented. |
| 4 | Service changes, support staff, skip reasons | Complete | Service-change audit/snapshots, permanent exact-service exclusions, manager override, skip-reason master data, and atomic support release are implemented. |
| 5 | Performance, configuration, observability | Complete with measured limits | ShopConfig is authoritative; active-support indexes, request IDs, structured API timings, and a read-only DB benchmark are available. Measurements are from a small disposable fixture, not production scale. |
| 6 | UI, accessibility, E2E, release readiness | Complete with stated limitations | Protected tablet E2E passes 7/7, Chromium iPad-viewport screenshots and DOM checks were reviewed, and static/DB quality gates pass. Physical iPad/WebKit, network interruption, and production-scale performance remain open. |

## Baseline commands and outcomes

These checks were run before implementation changes:

| Command | Outcome |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test -- --run` | PASS: 8 files, 22 tests; 3 tests skipped |
| `npm run test:coverage` | PASS; 13.5% statements/lines, 60.31% branches, 14.28% functions |
| `npx prisma validate` | PASS; Prisma 7 package.json configuration deprecation warning |
| `npm run build` | PASS; Next 16.4.0 Turbopack |
| `npm audit --omit=dev --omit=optional --audit-level=high` | PASS: 0 vulnerabilities |
| Safe Playwright public authorization checks | PASS: 2 tests |
| DB-backed integration tests | NOT RUN; no disposable test database was provisioned |
| Mutating Playwright workflows | NOT RUN during the audit baseline |

## Final verification after implementation

| Command / check | Outcome |
|---|---|
| `npx prisma generate` | PASS; Prisma Client 6.19.3 generated; Prisma 7 package.json configuration deprecation warning |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 9 files, 28 tests; 3 DB-gated files / 8 tests skipped without DB env |
| `npm run test:coverage` | PASS: 12.31% statements/lines, 61.03% branches, 12.5% functions |
| `npx prisma validate` | PASS; Prisma 7 package.json configuration deprecation warning |
| `npm run build` | PASS; Next.js 16.4.0 Turbopack; all current app/API routes compiled |
| Tablet public authorization smoke: board visitor + kiosk | PASS: 2/2; server required approved out-of-sandbox bind |
| `npm audit --omit=dev --omit=optional --audit-level=high` | NOT VERIFIED after implementation because the audit endpoint was unavailable (`ENOTFOUND registry.npmjs.org`); pre-change baseline was 0 high-severity vulnerabilities and no dependencies were changed in this batch |
| PostgreSQL migration + seed | PASS on isolated native PostgreSQL `127.0.0.1:55432/nailshop_test`; all 14 migrations applied and seed completed; production DB untouched |
| PostgreSQL-backed integration tests | PASS when run sequentially against the disposable DB: `postgres` 2/2, `admin-access` 1/1, `critical-workflows` 5/5. A parallel multi-file run exposed shared-DB fixture interference; do not parallelize these files against one DB. |
| Protected mutating Playwright workflows | PASS: full tablet project 7/7 from a clean test DB on isolated app port 3100; Chromium, one worker |
| iPad viewport visual/DOM review | PASS with limitation: kiosk, board, sign-in, and authenticated admin captured at 810×1080 and 1080×810; no horizontal overflow and primary controls met 44px measurement. WebKit/physical iPad not available. |
| Observability smoke | PASS: `/api/health` echoed supplied `x-request-id`; board generated one and emitted structured completion timing |
| DB benchmark | PASS on small test fixture, 20 iterations + 2 warmups: board p50 1.76ms/p95 3.26ms/2,613-byte payload; appointments p50 1.66ms/p95 1.91ms/4,122 bytes; report day p95 0.58ms; report month p95 0.50ms |
| Migration rollback rehearsal | NOT RUN; no down migration exists; use backup/restore or forward corrective migration after approval |

## Update protocol

The remaining limitations above are deliberate release gates, not silent assumptions. Do not treat the implementation as production-ready until physical iPad/WebKit review, network interruption testing, representative-scale query/lock measurement, job scheduling, and the kiosk lookup privacy decision are complete.
