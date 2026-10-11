# Implementation progress

This tracker records the implementation authorized by the product/engineering brief in the attached user instructions. The existing audit remains at `docs/audits/2026-10-10-nail-salon-mvp-audit.md`.

## Safety baseline

- Repository has no `.git` directory, so a recoverable pre-change source snapshot was created at `/private/tmp/wellness-salon-pre-implementation-20261010.tar.gz`; the current pushed snapshot uses attached metadata at `/private/tmp/wellness-salon-git`.
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
| 5 | Performance, configuration, observability | Complete with representative measured limits | ShopConfig is authoritative; active-support indexes, request IDs, structured API timings, critical-path rejection/lock/sync/job telemetry, a lean board read model, repeatable benchmark/load scripts, and a 20,000-appointment disposable fixture are available. A local Prisma `connection_limit=3` profile is measured; deployed pool/network/SLO measurements remain open. |
| 6 | UI, accessibility, E2E, release readiness | Complete with stated limitations | Protected tablet E2E passes 7/7, kiosk returning-guest E2E passes 2/2, resilience E2E passes 3/3 including deterministic board-network interruption/retry, Chromium iPad-viewport screenshots/DOM checks were reviewed, and static/DB quality gates pass. Physical iPad/WebKit, live Wi-Fi, and offline submission remain open. |

## 2026-10-11 follow-up

The current tree adds category-aware service catalog management, searchable service icons, append-only turn-event history, payment history, audited payment adjustment/correction/refund commands, and the compact appointment action menu. Static gates pass after the follow-up; dedicated disposable DB/E2E coverage for these new paths remains a backlog item. The earlier 2026-10-10 hardening phases and their evidence remain valid for the code paths they cover.

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
| `npm test -- --run` | PASS: 11 files, 31 tests; 3 DB-gated files / 9 tests skipped without DB env |
| `npm run test:coverage` | PASS: current rerun 24.88% statements/lines, 68.75% branches, 11.39% functions |
| `npx prisma validate` | PASS; Prisma 7 package.json configuration deprecation warning |
| `npm run build` | PASS; Next.js 16.4.0 Turbopack; all current app/API routes compiled |
| Tablet public authorization smoke: board visitor + kiosk | PASS: 2/2; server required approved out-of-sandbox bind |
| `npm audit --omit=dev --omit=optional --audit-level=high` | NOT VERIFIED after implementation because the audit endpoint was unavailable (`ENOTFOUND registry.npmjs.org`); pre-change baseline was 0 high-severity vulnerabilities and no dependencies were changed in this batch |
| PostgreSQL migration + seed | PASS on isolated native PostgreSQL `127.0.0.1:55432/nailshop_test`; all 14 migrations applied and seed completed; production DB untouched |
| PostgreSQL-backed integration tests | PASS when run sequentially against the disposable DB: `postgres` 3/3 (including paginated history), `admin-access` 1/1, `critical-workflows` 5/5. A parallel multi-file run exposed shared-DB fixture interference; do not parallelize these files against one DB. |
| Protected mutating Playwright workflows | PASS: protected tablet project 7/7 from a clean test DB on isolated app port 3100; Chromium, one worker |
| iPad viewport visual/DOM review | PASS with limitation: kiosk, board, sign-in, and authenticated admin captured at 810×1080 and 1080×810; no horizontal overflow and primary controls met 44px measurement. WebKit/physical iPad not available. |
| Observability smoke | PASS: `/api/health` echoed supplied `x-request-id`; board generated one and emitted structured completion timing |
| DB benchmark | PASS on small test fixture, 20 iterations + 2 warmups: board p50 1.76ms/p95 3.26ms/2,613-byte payload; appointments p50 1.66ms/p95 1.91ms/4,122 bytes; report day p95 0.58ms; report month p95 0.50ms |
| Representative DB benchmark | PASS on disposable 20,000-appointment fixture: board p50/p95 73.70/107.89ms with 3,899-byte payload; legacy filtered history 96.08/104.48ms with 1,515,072-byte payload; new 25-row history page 5.16/6.34ms with 34,360-byte payload; report day/month p95 5.32/16.27ms |
| Production-build HTTP smoke | PASS with scope limit: three concurrent clients × ten cycles, 30/30 board requests HTTP 200, p50/p95 114.59/219.84ms; request IDs echoed |
| Disposable concurrent read/write load profile | PASS with scope limit: three service-layer clients × ten cycles, 120 operations, zero errors; board p50/p95/p99 92.40/152.20/170.98ms, check-in write 37.38/78.53/128.86ms; seven advisory-lock waits ≥10ms, maximum 56.87ms |
| Authenticated HTTP load profile | PASS with scope limit: three role flows × ten cycles, 70 HTTP operations, zero errors; management/board/kiosk reads and kiosk writes returned expected statuses; p95 36.26ms for admin appointments, 30.20ms for board, and 45.83ms for check-in; max observed DB connections 13, active 3 |
| Kiosk returning-guest E2E | PASS: 2/2 on production build/local disposable DB; approved full-name lookup is displayed read-only and the customer can continue without re-entering the name |
| Browser resilience E2E | PASS: `tests/e2e/resilience.spec.ts` 3/3; transient SSE disconnect and board snapshot network interruption recovered to Live, and same idempotency key returned one appointment |
| Pool-constrained authenticated HTTP profile | PASS with scope limit: production build + disposable PostgreSQL with Prisma `connection_limit=3`/`pool_timeout=5`; 350 operations, zero errors, max observed 6 total/2 active DB connections; deployed network/SLO not established |
| Migration rollback rehearsal | NOT RUN; no down migration exists; use backup/restore or forward corrective migration after approval |

## Update protocol

The remaining limitations above are deliberate release gates, not silent assumptions. Do not treat the implementation as production-ready until physical iPad/WebKit/live Wi-Fi review and staging/deployed connection-pool/network SLO measurement are complete. Kiosk full-name behavior is approved and tested. Job scheduling/alerting is explicitly deferred by product decision. Representative reads, authenticated local HTTP, the pool-constrained local profile, critical-path telemetry, the disposable concurrent profile, and browser network emulation are complete but do not establish a production SLO.
