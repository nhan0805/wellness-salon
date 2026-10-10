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
| Attendance | Clock in, eligible for routing | PASS | Protected tablet E2E checks in Jenny and routes a Nail Art visit |
| Attendance | Checked-out staff cannot accept/start | PASS at critical DB path | `critical-workflows.test.ts` verifies active-turn checkout is rejected and attendance remains present |
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
| Service change | Preview and apply active service change | PASS | Critical PostgreSQL workflow verifies service replacement and old snapshot audit |
| Service change | Unqualified active technician cannot continue | PASS at critical DB path | Critical service-change fixture revalidates skills and preserves audit data |
| Session | Deactivated account loses access without JWT expiry | NOT RUN | Session-version revalidation implemented; needs auth integration test |
| Session | Verified staff session can be revoked | NOT RUN | Revocation check implemented; needs auth integration test |

## Resilience and UI matrix

| Area | Scenario | Status | Evidence / gap |
|---|---|---|---|
| Realtime | SSE reconnects after disconnect | NOT RUN | Reconnect/backoff code is present; browser network simulation is pending |
| Realtime | Stale board snapshot is ignored | NOT RUN | Monotonic version guard is present; browser/API version assertion is pending |
| Realtime | Polling fallback remains bounded | NOT RUN | Five-second cap and abort/order guards are code-reviewed; timing test is pending |
| UI | Public board tablet view | PASS: included in full 7/7 tablet suite | Playwright Chromium tablet project passed |
| UI | Public kiosk tablet journey | PASS: included in full 7/7 tablet suite | Playwright Chromium tablet project passed |
| UI | iPad portrait and landscape layouts | PASS with limitation | Screenshot/DOM review at 810×1080 and 1080×810; physical iPad/WebKit not available |
| UI | Modal focus trap, Escape, and focus restore | NOT RUN | Shared hook implemented; interaction test is pending |
| UI | Touch targets and disabled states | PASS with limitation | DOM measurement found primary interactive controls ≥44px in reviewed screens; physical/touch hardware pending |
| UI | Kiosk keyboard/refresh/interrupted submission | NOT RUN | Abort/reset/idempotency handling is implemented; browser interruption test is pending |
| UI | Loading, empty, error, and stale sync states | NOT RUN | Implemented in affected surfaces; comprehensive browser assertions are pending |

## Automated quality gates

| Command | Outcome |
|---|---|
| `npx prisma generate` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test -- --run` | PASS: 28 passed, 8 DB-gated tests skipped without DB env |
| `npm run test:coverage` | PASS: 12.31% statements/lines, 61.03% branches, 12.5% functions |
| `npx prisma validate` | PASS |
| `npm run build` | PASS |
| Public/protected tablet Playwright suite | PASS: 7/7 on clean seeded test DB, one worker |
| `npm run benchmark:db` | PASS: board p50 1.76ms/p95 3.26ms, appointments p50 1.66ms/p95 1.91ms, report day/month p95 0.58/0.50ms on small fixture |
| Request-ID/API timing smoke | PASS: health echoes supplied ID; board returns generated ID and structured timing log |
| `npm audit --omit=dev --omit=optional --audit-level=high` after implementation | NOT VERIFIED: registry DNS unavailable; pre-change baseline passed with 0 high-severity findings |

Database-backed tests require a disposable PostgreSQL instance and `TEST_DATABASE_URL`; they must never target the application database. Run the three DB-gated files sequentially against one test database or give each worker an isolated database. No production database, schema, or deployment was changed during this implementation.
