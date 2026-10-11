# Implementation test matrix

Status values: `PASS`, `FAIL`, `NOT RUN`, `NOT IMPLEMENTED`, or `NEEDS BUSINESS DECISION`.

The automated unit suite is intentionally fast and database-independent. PostgreSQL scenarios were run against the isolated native test database at `127.0.0.1:55432/nailshop_test`; DB-gated Vitest files must run sequentially (or use one isolated database per worker) because they share mutable fixtures. No production database was used.

## Core workflow matrix

| Area | Scenario | Status | Evidence / gap |
|---|---|---|---|
| Kiosk | Valid service selection creates one visit | PASS | Full tablet E2E creates kiosk visits; PostgreSQL idempotency fixture also creates visits |
| Kiosk | Same customer intentionally checks in twice | PASS | `tests/integration/postgres.test.ts` verifies two explicit same-day appointment IDs |
| Kiosk | Same idempotency key retries | PASS | `tests/integration/postgres.test.ts` verifies both calls return the same appointment and one row |
| Kiosk | Same key with changed payload | NOT RUN | Request-hash conflict path implemented; needs DB/API integration assertion |
| Kiosk | Returning customer lookup shows approved full name | PASS | `tests/e2e/kiosk.spec.ts` verifies the saved name is displayed read-only on the second check-in |
| Attendance | Clock in, eligible for routing | PASS | Protected tablet E2E checks in Jenny and routes a Nail Art visit |
| Attendance | Checked-out staff cannot accept/enter service | PASS at critical DB path | `critical-workflows.test.ts` verifies active-turn checkout is rejected and attendance remains present |
| Attendance | Assigned staff cannot manual or automatic checkout | PASS at critical DB path | Critical fixture verifies checkout blocking; automatic close remains covered by unit tests |
| Routing | Skill mismatch is never assigned | PASS in turn-routing unit coverage; DB flow NOT RUN | Required-skill intersection is covered in `tests/unit/turn-routing.test.ts` |
| Routing | Exact skipped technician remains excluded | PASS | Critical PostgreSQL workflow verifies exclusion survives reconcile and only audited override restores eligibility |
| Routing | No eligible replacement leaves service waiting | PASS in routing unit behavior; DB persistence NOT RUN | No candidate returns waiting/no phantom assignment |
| Routing | Fairness after finish | PASS in turn-routing unit coverage | Fairness and stable-order modes covered |
| Staff actions | Repeated Accept/Finish/Skip taps | PARTIAL | Cancellation retry is covered; dedicated repeated ACCEPT/FINISH/SKIP API test remains |
| Staff actions | Concurrent Accept from two tablets | PASS | Critical PostgreSQL workflow: exactly one of two concurrent accepts succeeds |
| Support | Add support only when present/active/available | PASS | Critical PostgreSQL workflow adds support and rejects checkout while active |
| Support | Primary Finish releases all participants | PASS | Critical PostgreSQL workflow verifies `releasedAt` and support availability after primary finish |
| Cancellation | Waiting/assigned cancellation | PASS | Critical DB cancellation and protected management UI E2E pass |
| Cancellation | In-service cancellation requires manager/reason | PARTIAL | Protected admin UI cancellation passes; dedicated in-service role/reason matrix remains |
| Cancellation | Payment pending/completed cancellation rejected | PASS at state-machine/critical path | Critical cancellation fixture exercises idempotency and terminal status; separate payment-pending rejection remains |
| Payments | Cancelled services excluded from payment items | PARTIAL | Code path and protected payment flow pass; dedicated multi-service payment fixture remains |
| Payments | Adjustment/correction preserves reason and previous/current details | NOT RUN | Admin route and audit path are implemented; dedicated disposable DB/API assertion remains |
| Payments | Full/partial refund records an external action and caps refundable amount | NOT RUN | Admin route and payment-history projection are implemented; dedicated disposable DB/API assertion remains |
| Service change | Preview and apply active service change | PASS | Critical PostgreSQL workflow verifies service replacement and old snapshot audit |
| Service change | Unqualified active technician cannot continue | PASS at critical DB path | Critical service-change fixture revalidates skills and preserves audit data |
| Session | Deactivated account loses access without JWT expiry | NOT RUN | Session-version revalidation implemented; needs auth integration test |
| Session | Verified staff session can be revoked | NOT RUN | Revocation check implemented; needs auth integration test |
| Catalog | Admin category CRUD/archive and active-service archive guard | NOT RUN | Category migration, API, and UI are implemented; dedicated DB/API coverage remains |
| History | Appointment turn history preserves actor/staff snapshots and reasons | NOT RUN | `TurnEvent` migration/API/UI are implemented; dedicated DB/API/browser coverage remains |

## Resilience and UI matrix

| Area | Scenario | Status | Evidence / gap |
|---|---|---|---|
| Realtime | SSE reconnects after transient disconnect | PASS | `tests/e2e/resilience.spec.ts` aborts the first SSE request, observes `Reconnecting`, then observes `Live` after reconnect |
| Realtime | Tablet recovers after an emulated board-network interruption | PASS | Tablet project blocks `/api/board`, observes the recoverable error and `Retry`, restores the route, and observes `Live`; this is browser network emulation, not physical Wi-Fi |
| Realtime | Stale board snapshot is ignored | NOT RUN | Monotonic version guard is present; browser/API version assertion is pending |
| Realtime | Polling fallback remains bounded | PARTIAL | Five-second cap and abort/order guards are code-reviewed; live network/tab-suspension timing remains pending |
| UI | Public board tablet view | PASS: included in full 7/7 tablet suite | Playwright Chromium tablet project passed |
| UI | Public kiosk tablet journey | PASS: included in full 7/7 tablet suite | Playwright Chromium tablet project passed |
| UI | iPad portrait and landscape layouts | PASS with limitation | Screenshot/DOM review at 810×1080 and 1080×810; physical iPad/WebKit not available |
| UI | Modal focus trap, Escape, and focus restore | NOT RUN | Shared hook implemented; interaction test is pending |
| UI | Touch targets and disabled states | PASS with limitation | DOM measurement found primary interactive controls ≥44px in reviewed screens; physical/touch hardware pending |
| UI | Kiosk keyboard/refresh/interrupted submission | PARTIAL | Same-key concurrent retry passes in `tests/e2e/resilience.spec.ts`; physical keyboard, refresh during mutation, and offline submission remain pending |
| UI | Loading, empty, error, and stale sync states | NOT RUN | Implemented in affected surfaces; comprehensive browser assertions are pending |

## Automated quality gates

| Command | Outcome |
|---|---|
| `npx prisma generate` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test -- --run` | PASS: 31 passed, 9 DB-gated tests skipped without DB env |
| `npm run test:coverage` | PASS: current rerun 24.88% statements/lines, 68.75% branches, 11.39% functions |
| `npx prisma validate` | PASS |
| `npm run build` | PASS |
| Public/protected tablet Playwright suite | PASS: 7/7 on clean seeded test DB, one worker |
| `npm run benchmark:db` | PASS: board p50 1.76ms/p95 3.26ms, appointments p50 1.66ms/p95 1.91ms, report day/month p95 0.58/0.50ms on small fixture |
| Representative benchmark (`scripts/seed-benchmark-fixture.ts` + `npm run benchmark:db`) | PASS: 20,000 disposable appointments; legacy history p50/p95 96.08/104.48ms with 1,515,072-byte payload, new 25-row page 5.16/6.34ms with 34,360-byte payload, board p50/p95 73.70/107.89ms, report day/month p95 5.32/16.27ms |
| Production-build HTTP smoke | PASS with scope limit: 3 concurrent clients × 10 cycles, 30/30 board requests HTTP 200, p50/p95 114.59/219.84ms; local loopback only |
| Disposable concurrent read/write load profile | PASS with scope limit: 3 service-layer clients × 10 cycles, 120 operations, zero errors; board p50/p95/p99 92.40/152.20/170.98ms, check-in write 37.38/78.53/128.86ms; 7 advisory-lock waits ≥10ms, max 56.87ms; disposable local PostgreSQL only |
| Authenticated HTTP load profile | PASS with scope limit: 3 role flows × 10 cycles, 70 operations, zero errors; admin/board/kiosk reads plus kiosk writes; max observed DB connections 13, active 3; local disposable only |
| Kiosk returning-guest E2E | PASS: 2/2 — approved full-name recognition and read-only saved name |
| Browser resilience E2E | PASS: 3/3 — transient SSE recovery, board snapshot network interruption/Retry recovery, and same-key duplicate submission |
| Pool-constrained authenticated HTTP profile | PASS with scope limit: 3 role flows × 50 cycles, 350 operations, zero errors; Prisma `connection_limit=3`/`pool_timeout=5`; max observed 6 total/2 active DB connections; local disposable only |
| Request-ID/API timing smoke | PASS: health echoes supplied ID; board returns generated ID and structured timing log |
| `npm audit --omit=dev --omit=optional --audit-level=high` after implementation | NOT VERIFIED: registry DNS unavailable; pre-change baseline passed with 0 high-severity findings |

Database-backed tests require a disposable PostgreSQL instance and `TEST_DATABASE_URL`; they must never target the application database. Run the three DB-gated files sequentially against one test database or give each worker an isolated database. `scripts/seed-benchmark-fixture.ts` and `scripts/load-profile.ts` are for disposable benchmark databases only. No production database, schema, or deployment was changed during this implementation.
