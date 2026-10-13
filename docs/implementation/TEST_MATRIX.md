# Implementation test matrix

Status values: `PASS`, `FAIL`, `NOT RUN`, `NOT IMPLEMENTED`, or `NEEDS BUSINESS DECISION`.

The automated unit/contract suite is intentionally fast and database-independent. The active database-backed gate is `npm run test:e2e:d1`: it creates disposable local D1 state, applies two migrations plus the 101-statement bootstrap, and runs the Worker artifact with one Playwright worker. The 2026-10-13 run passed 25/26 cases with one intentional desktop-project skip because the responsive queue test runs on the tablet project. Historical PostgreSQL scenarios are retained only as compatibility/rollback evidence and are not active CI tests.

## Core workflow matrix

| Area | Scenario | Status | Evidence / gap |
|---|---|---|---|
| Kiosk | Valid service selection creates one visit | PASS | Worker/D1 protected tablet E2E creates kiosk visits |
| Kiosk | Same customer intentionally checks in twice | PASS | Local D1 HTTP smoke verifies explicit same-day appointment creation |
| Kiosk | Same idempotency key retries | PASS | `tests/e2e/resilience.spec.ts` verifies one visit for repeated submissions |
| Kiosk | Same key with changed payload | NOT RUN | Request-hash conflict path implemented; needs DB/API integration assertion |
| Kiosk | Returning customer lookup shows approved full name | PASS | `tests/e2e/kiosk.spec.ts` verifies the saved name is displayed read-only on the second check-in |
| Attendance | Clock in, eligible for routing | PASS | Protected tablet E2E checks in Jenny and routes a Nail Art visit |
| Attendance | Checked-out staff cannot accept/enter service | PASS at D1 smoke path | Local D1 HTTP smoke verifies the active-turn checkout guard |
| Attendance | Assigned staff cannot manual or automatic checkout | PASS at D1 smoke path | Local D1 HTTP smoke verifies checkout blocking; automatic close remains covered by unit tests |
| Routing | Skill mismatch is never assigned | PASS in turn-routing unit coverage; DB flow NOT RUN | Required-skill intersection is covered in `tests/unit/turn-routing.test.ts` |
| Routing | Exact skipped technician remains excluded | PASS | Local D1 HTTP smoke verifies exclusion/reconcile and the audited override path |
| Routing | No eligible replacement leaves service waiting | PASS in routing unit behavior; DB persistence NOT RUN | No candidate returns waiting/no phantom assignment |
| Routing | Fairness after finish | PASS in turn-routing unit coverage | Fairness and stable-order modes covered |
| Staff actions | Repeated Accept/Finish/Skip taps | PARTIAL | Cancellation retry is covered; dedicated repeated ACCEPT/FINISH/SKIP API test remains |
| Staff actions | Concurrent Accept from two tablets | PARTIAL | D1 command guards are implemented; dedicated concurrent Worker assertion remains open |
| Support | Add support only when present/active/available | PASS | Local D1 HTTP smoke adds support and rejects checkout while active |
| Support | Primary Finish releases all participants | PASS | Local D1 HTTP smoke verifies support release after primary finish |
| Cancellation | Waiting/assigned cancellation | PASS | Local D1 cancellation smoke and protected management UI E2E pass |
| Cancellation | In-service cancellation requires manager/reason | PARTIAL | Protected admin UI cancellation passes; dedicated in-service role/reason matrix remains |
| Cancellation | Payment pending/completed cancellation rejected | PASS at state-machine/D1 path | Local D1 cancellation smoke exercises idempotency and terminal status; separate payment-pending rejection remains |
| Payments | Cancelled services excluded from payment items | PARTIAL | Code path and protected payment flow pass; dedicated multi-service payment fixture remains |
| Payments | Confirm final amount, card/cash tip, and cash details with shared keypad; no initial-confirm reason prompt | PARTIAL | Static type/lint/build checks pass and the modal/schema/service align; authenticated keypad interaction on physical iPad/WebKit remains a manual QA item |
| Payments | Adjustment/correction preserves reason and previous/current details | NOT RUN | Admin route and audit path are implemented; dedicated disposable DB/API assertion remains |
| Payments | Full/partial refund records an external action and caps refundable amount | NOT RUN | Admin route and payment-history projection are implemented; dedicated disposable DB/API assertion remains |
| Service change | Preview and apply active service change | PASS | Local D1 HTTP smoke verifies service replacement and snapshot audit |
| Service change | Unqualified active technician cannot continue | PASS at D1 smoke path | Local D1 smoke revalidates skills and preserves audit data |
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
| UI | Public board tablet view | PASS: included in Worker/D1 gate | Playwright Chromium tablet project passed |
| UI | Public kiosk tablet journey | PASS: included in Worker/D1 gate | Playwright Chromium tablet project passed |
| UI | iPad portrait and landscape layouts | PASS with limitation | Worker/D1 DOM regression at 810×1080 and 1080×810; physical iPad/WebKit not available |
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
| `npm test -- --run` | PASS: 51 passed, no database skips |
| `npm run test:e2e:d1` | PASS: 25 passed, 1 intentional project-specific skip across 26 Worker/D1 cases |
| `npm run test:coverage` | PASS: current tree 14.21% statements/lines, 69.29% branches, 22.95% functions; broad report, not a release threshold |
| `npx prisma validate` | PASS |
| `npm run build` | PASS |
| Public/protected Worker/D1 tablet Playwright suite | PASS: included in the canonical 25/26 gate, one worker |
| `npm run benchmark:db` | PASS: board p50 1.76ms/p95 3.26ms, appointments p50 1.66ms/p95 1.91ms, report day/month p95 0.58/0.50ms on small fixture |
| Representative benchmark (`scripts/seed-benchmark-fixture.ts` + `npm run benchmark:db`) | PASS: 20,000 disposable appointments; legacy history p50/p95 96.08/104.48ms with 1,515,072-byte payload, new 25-row page 5.16/6.34ms with 34,360-byte payload, board p50/p95 73.70/107.89ms, report day/month p95 5.32/16.27ms |
| Production-build HTTP smoke | PASS with scope limit: 3 concurrent clients × 10 cycles, 30/30 board requests HTTP 200, p50/p95 114.59/219.84ms; local loopback only |
| Historical disposable concurrent read/write load profile | PASS with scope limit; retained as legacy PostgreSQL compatibility evidence, not the active D1 gate |
| Historical authenticated HTTP load profile | PASS with scope limit; retained as legacy PostgreSQL compatibility evidence, not the active D1 gate |
| Kiosk returning-guest E2E | PASS: 2/2 — approved full-name recognition and read-only saved name |
| Browser resilience E2E | PASS: 3/3 — transient SSE recovery, board snapshot network interruption/Retry recovery, and same-key duplicate submission |
| Pool-constrained authenticated HTTP profile | PASS with scope limit: 3 role flows × 50 cycles, 350 operations, zero errors; Prisma `connection_limit=3`/`pool_timeout=5`; max observed 6 total/2 active DB connections; local disposable only |
| Request-ID/API timing smoke | PASS: health echoes supplied ID; board returns generated ID and structured timing log |
| `npm audit --omit=dev --omit=optional --audit-level=high` after implementation | NOT VERIFIED: registry DNS unavailable; pre-change baseline passed with 0 high-severity findings |

The active database-backed test requires only disposable local D1 state and the D1 test harness; it must never target a production database. `scripts/seed-benchmark-fixture.ts` and `scripts/load-profile.ts` are historical PostgreSQL compatibility benchmarks, not the current CI gate. The existing production D1 schema/data were preserved; the workers.dev deployment is recorded separately in the Cloudflare reports.
