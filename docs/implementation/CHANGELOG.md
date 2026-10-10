# Implementation changelog

## 2026-10-10

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
- Final static gates passed: Prisma generate/validate, lint, typecheck, unit tests (28 passed, 8 DB-gated skips without DB env), coverage, production build, and full tablet E2E (7/7). Disposable DB integration and Chromium viewport QA passed; physical iPad/WebKit, network interruption, rollback rehearsal, and production-scale performance remain open.
- Provisioned only a disposable native PostgreSQL cluster at `127.0.0.1:55432/nailshop_test`; applied all 14 migrations and seeded it successfully. No Docker application container or production database was changed.
- Added `tests/integration/critical-workflows.test.ts` coverage for persistent skip exclusions/manager override, concurrent ACCEPT, checkout blocking/support release, cancellation idempotency, and audited service changes; the DB-gated files pass when run sequentially.
- Added protected tablet E2E coverage for kiosk → routed service → staff accept/finish → admin payment and admin cancellation. Full tablet project passed 7/7 from a clean test database.
- Added `x-request-id` propagation in `proxy.ts`, structured API timing logs in `src/server/observability.ts`, and instrumentation on board, kiosk check-in, payment, cancellation, and health routes.
- Added the lean board read include and `npm run benchmark:db`; small test fixture measured board p50 1.76ms/p95 3.26ms with a 2,613-byte payload. Production-scale measurement remains pending.
- Completed Chromium iPad-viewport screenshot/DOM review at 810×1080 and 1080×810 for kiosk, board, sign-in, and authenticated admin. No horizontal overflow was observed; primary controls measured at least 44px. Physical iPad/WebKit and network interruption review remain open.
