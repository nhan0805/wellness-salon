# Implementation changelog

## 2026-10-11 follow-up

- Restored `ServiceCategory` as an explicit catalog taxonomy after the earlier category-free interim decision; added ordered/archive-safe category CRUD, migration backfill, Admin filtering, grouped kiosk presentation, and seeded categories.
- Added searchable service-icon selection and static timezone/currency option data so catalog/configuration labels remain deterministic across server and browser renders.
- Added an append-only `TurnEvent` ledger with actor and assigned-staff snapshots, reasons, migration backfill for legacy turns, and an Admin appointment turn-history view.
- Added payment history plus admin-only, retry-safe payment amount/method/tip adjustment, bookkeeping correction, and full/partial refund records backed by audit events. Refunds document an external merchant action and do not call a gateway.
- Added a compact Appointment action menu that keeps payment/history/change/reassign/override/cancel operations available without widening the appointments table.
- Re-verified Prisma generate/validate, lint, typecheck, 31 default tests with 9 DB-gated skips, coverage (24.88% statements/lines, 68.75% branches, 11.39% functions), and production build. Dedicated DB/E2E coverage for these follow-up paths remains open.

## 2026-10-10

- Separated Dashboard service revenue from tips, added total collected, and recalculated Card/Cash collection shares using actual collected amounts including tips; clarified payment confirmation and Customer History labels. Tip allocation to staff remains out of scope.
- Clarified the Dashboard payment KPI by replacing the mixed-unit Payment split card with a Payment methods card showing Card/Cash percentages, a 100% allocation bar, and both recorded amounts.
- Balanced the Payment methods percentage hierarchy so Card and Cash shares use the same responsive font size and visual importance.
- Consolidated the admin Reports destination into Dashboard: removed the separate Reports tab and merged the unique staff-attribution detail into the single Dashboard view while preserving the existing period filters, trend, reconciliation, and service breakdown data.
- Recorded the authorized BR-01 through BR-06 implementation scope.
- Recorded pre-change quality baseline and rollback snapshot.
- Added implementation tracker, decisions, test matrix, and release checklist.
- Added `CANCELLED` lifecycle handling, explicit service/visit cancellation, manager reassignment, queue reconciliation, and audit/version updates.
- Added idempotency receipts with request-hash conflict detection for kiosk and administrative mutations, plus transactional/advisory locking around check-in and staff actions.
- Added permanent exact-service skip exclusions, historical skip-reason snapshots, manager override, and routing support for the configured fair/stable ordering mode.
- Added attendance/session safety: database-backed PIN lockout, active-session revalidation/revocation, checkout blocking, timezone-aware closing, and protected retention cleanup.
- Added service-change audit snapshots, staff-skill revalidation, support-technician participation release timestamps, and no-independent-support-finish behavior.
- Added authoritative shop configuration for timezone/opening/closing/currency/session TTL/routing mode, with admin configuration and master-data UI.
- Added board SSE reconnect/backoff, bounded polling/version guards, public board redaction, kiosk abort/reset/error states, dynamic currency/configuration, focus-trapped dialogs, and cancelled-state visibility.
- Added CI/test-harness separation for `APPLICATION_DATABASE_URL` and `TEST_DATABASE_URL`, and expanded unit coverage for routing, reconciliation, validation, concurrency, and admin management.
- Removed the remaining hardcoded timezone/currency label from the sign-in visual so configuration is not misrepresented before an operational screen loads.
- Final static gates passed: Prisma generate/validate, lint, typecheck, unit tests (31 passed, 9 DB-gated skips without DB env), coverage, production build, and protected tablet E2E (7/7). Disposable DB integration and Chromium viewport QA passed; physical iPad/WebKit, network interruption, rollback rehearsal, and production-scale performance remain open.
- Provisioned only a disposable native PostgreSQL cluster at `127.0.0.1:55432/nailshop_test`; applied all 14 migrations and seeded it successfully. No Docker application container or production database was changed.
- Added `tests/integration/critical-workflows.test.ts` coverage for persistent skip exclusions/manager override, concurrent ACCEPT, checkout blocking/support release, cancellation idempotency, and audited service changes; the DB-gated files pass when run sequentially.
- Added protected tablet E2E coverage for kiosk → routed service → staff accept/finish → admin payment and admin cancellation. The protected tablet project passed 7/7 from a clean test database.
- Added `x-request-id` propagation in `proxy.ts`, structured API timing logs in `src/server/observability.ts`, and instrumentation on board, kiosk check-in, payment, cancellation, and health routes.
- Added the lean board read include and `npm run benchmark:db`; small test fixture measured board p50 1.76ms/p95 3.26ms with a 2,613-byte payload. Production-scale measurement remains pending.
- Completed Chromium iPad-viewport screenshot/DOM review at 810×1080 and 1080×810 for kiosk, board, sign-in, and authenticated admin. No horizontal overflow was observed; primary controls measured at least 44px. Physical iPad/WebKit and network interruption review remain open.
- Added `tests/e2e/resilience.spec.ts`: transient SSE failure recovers to Live and two concurrent kiosk submissions with one idempotency key return one appointment; both pass on the tablet project.
- Added the disposable-only `scripts/seed-benchmark-fixture.ts` and measured a 20,000-appointment fixture: board service-layer p50/p95 65.71/70.97ms, filtered history 93.16/98.82ms with a 1.51MB payload, report day/month p95 4.59/16.32ms. Primary board/date `EXPLAIN ANALYZE` used the existing index.
- Ran a production-build HTTP smoke with three concurrent clients for ten cycles: 30/30 board requests returned 200, p50/p95 114.59/219.84ms, and request IDs were echoed. This is a local loopback baseline, not a production SLO.
- Added server-side admin appointment history pagination and response projection: 25-row pages, server-side filters/summary aggregates, deterministic ordering, touch-safe pagination controls, and a disposable PostgreSQL integration test. On the 20,000-appointment fixture, the new page measured 34,360 bytes/p95 6.34ms versus the legacy full read at 1,515,072 bytes/p95 104.48ms. Physical iPad/WebKit and production traffic remain open.
- Added critical-path telemetry for rejected mutating commands, advisory-lock waits ≥10ms, board snapshot version/time, and closing/retention job outcomes. Added disposable-only `scripts/load-profile.ts` and `npm run load:profile`; 3 service-layer clients × 10 cycles completed 120 operations with zero errors, board p50/p95/p99 92.40/152.20/170.98ms, check-in write p50/p95/p99 37.38/78.53/128.86ms, and 7 advisory-lock waits ≥10ms (maximum 56.87ms). No production DB, deployment, infrastructure, authenticated HTTP/pool load, or physical devices were used.
- Added disposable-only authenticated HTTP profile `scripts/http-load-profile.ts` and `npm run load:http`; three role flows × ten cycles completed 70 HTTP operations with zero errors. Admin appointments, board, kiosk lookup, and kiosk check-in p95 values were 36.26ms, 30.20ms, 8.65ms, and 45.83ms respectively; max observed database activity was 13 connections/3 active. A second 50-cycle run with Prisma `connection_limit=3`/`pool_timeout=5` completed 350 operations with zero errors; check-in p50/p95/p99 was 10.41/45.44/50.12ms and max observed database activity was 6 connections/2 active. No staging/production network or production SLO claim is made.
- Recorded kiosk privacy decision A: returning guests may see the stored full name for confirmation. Added no-store/referrer protections, transparent kiosk copy, and returning-guest E2E coverage (2/2). Scheduler/alerting remains explicitly deferred.
- Added a deterministic board-network interruption/retry scenario to `tests/e2e/resilience.spec.ts`; the tablet project now passes 3/3 for SSE reconnect, board snapshot Retry recovery, and same-key kiosk retry. This is browser network emulation, not physical Wi-Fi testing.
