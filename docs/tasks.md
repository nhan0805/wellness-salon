# Tasks

Last updated: 2026-10-13

## Backlog

- Complete physical iPad/WebKit, distance readability, Dynamic Type/VoiceOver, real Wi-Fi interruption, offline submission, and modal interaction review.
- Measure staging/deployed connection-pool, lock-wait, network, and representative-history behavior; document backup/restore rollback.
- Fill the remaining scenario gaps: repeated staff actions, in-service/payment-pending cancellation boundaries, session revalidation, stale board versions, and broader closing/retention coverage.
- Add scheduler retry/alerting guidance and a production deployment example once the deferred operations decision and secrets/domain are approved.
- Add production TLS certificate/domain configuration after a human approval artifact.
- Add remaining Worker/D1 coverage for service-category lifecycle, payment adjustment/correction/refund history, and appointment turn history.
- Complete D1 rollback/interruption tests and settle the final exact money representation; the critical command branches already use explicit `batch()`/guard/receipt semantics.
- Broaden tests for the custom Worker account/session boundary, Worker cron authorization, realtime recovery, timezone/DST behavior, and deployed Free-tier capacity.
- Reintroduce or attach repository Git metadata so branch, diff, and release history can be audited.

## Planned

- Run the physical tablet and real-network run sheet from `docs/implementation/TABLET_QA_PLAN.md`.
- From a Docker-enabled host, verify Compose health, `/api/health`, the closing endpoint, and the trigger script without printing `.env`.
- Run `npm run test:e2e:d1` in CI/locally as the canonical database-backed gate; do not reintroduce PostgreSQL-only test setup into the active pipeline.
- Review production secret handling and ensure scheduler traffic uses a real secret manager.
- Keep the local D1 workflow repeatable with `npm run test:e2e:d1`, `wrangler.local.jsonc`, the fresh migrations, and disposable bootstrap; do not create or reset additional remote resources without approval.

## In progress

- Close physical-device, deployed-network, scheduler, and production-approval gates; keep the application at supervised-pilot status until those checks are complete.

## Blocked

- Production TLS/domain/merchant, traffic-cutover, and rollback work remains blocked on human approval gates; the initial workers.dev deployment is already recorded.
- D1 production cutover remains blocked on transaction/rollback, money, auth, full concurrency, and deployed Worker evidence; the local lease smoke and scoped workers.dev smoke are not release approval.

## Completed
- [x] Completed the approved BR-01 through BR-06 hardening scope: exact-service skip exclusions/override, attendance safety, idempotent same-day visits, cancellation, audited service changes, and atomic support release.
- [x] Added session-version revalidation, database-backed PIN lockout, verified-session revocation, request-hash conflict detection, board version/reconnect/polling recovery, explicit queue repair, and critical-path telemetry.
- [x] Added server-side appointment history pagination/projection and disposable benchmark, service-layer load, authenticated HTTP, and pool-constrained load scripts.
- [x] Historical legacy PostgreSQL migration/DB checks were recorded separately; they are not the active handoff gate.
- [x] Canonical Worker/D1 E2E gate passed: local migrations + 101-statement bootstrap, 25 passed and 1 intentional project skip across 26 Playwright cases.
- [x] Static test gate passed: `npm test -- --run` returned 51/51 tests with no database skips.
- [x] Protected tablet E2E passed 7/7; returning-guest kiosk passed 2/2; browser resilience passed 3/3; Chromium portrait/landscape review passed with the physical-device limitation recorded.
- [x] Fresh static gates passed: lint, typecheck, 51 tests with no skips, Prisma validate, Next production build, vinext compatibility scan, Worker build, and Cloudflare deploy dry-run.
- [x] Added the separate D1 schema/migration and repeatable local Worker/D1 E2E gate: health/catalog/board/pages, authentication, kiosk check-in, idempotent replay, staff/admin workflows, payment flows, resilience, and the iPad queue layout regression. Local test state is disposable.
- [x] Vinext/Cloudflare Build Output passes with the D1 binding and explicit query-compiler WASM asset; the first workers.dev deployment and scoped read-only smoke are recorded in the Cloudflare reports.
- [x] Restored the service-category taxonomy with ordered/archivable categories, migration backfill, Admin CRUD, category filtering, grouped kiosk presentation, and searchable service-icon selection.
- [x] Added append-only `TurnEvent` history with actor/staff snapshots and an Admin appointment turn-history view.
- [x] Added Admin payment history plus audited, idempotent adjustment/correction/refund commands; refunds record an external terminal action and do not process card data.
- [x] Added the compact Appointment action menu for payment, history, change-service, reassignment, skip override, and cancellation actions.
- [x] Split the Today’s turn board screen into Turn board and Staff attendance tabs, and made staff Check in/Check out actions prominent and touch-friendly.
- [x] Fixed the turn-board `Up next` display for multi-service appointments so all selected services, progress labels, and combined duration remain visible in one queue card.
- [x] Fixed mobile app/board topbar authentication actions so `Log in` and `Sign out` remain visible at narrow widths while secondary controls collapse to avoid overflow.
- [x] Refined "Edit Account" UI for better field alignment.
- [x] Unified sign-in flow with automatic role-based redirection.
- [x] Implemented interactive RolePreview dashboard for landing page.
- [x] Added Tip functionality to payments (Schema, Validation, API, UI).
- [x] Superseded the interim category-free catalog decision with `ServiceCategory` migrations, API contracts, admin management, and kiosk grouping.
- [x] Made the turn board read-only view public; kept accept/skip/finish/check-in/out/add-support actions protected by station/admin authentication and staff PIN verification. Accept moves directly into service; there is no separate Start action.
- [x] Added multi-skill service requirements with a `ServiceSkill` migration, admin checkbox selection, all-skills routing, and unit/contract coverage.
- [x] Cleared the staff verification PIN when closing/reopening the modal, after submission, or when changing staff; disabled browser autocomplete for the PIN input.
- [x] Clarified which service each queue Accept/Skip action targets with visible action labels, highlighted next-service rows, and service-specific accessible button labels.
- [x] Fixed `Up next` responsive queue card layout so multi-service names do not collapse into narrow columns; assigned staff and action controls now have dedicated, responsive areas.
- [x] Made the dashboard `Open turns` KPI open the Payments screen directly with visible and keyboard-accessible action affordance.
- [x] Added dashboard KPI navigation to Reports, Queue, and filtered Completed Appointments screens.
- [x] Updated Admin Queue to show all services per appointment with individual and total durations.
- [x] Restored standalone PWA metadata for iPad testing, kept the login form visible inside the installed app, and rebuilt/health-checked the Docker production container without exposing seed credentials.

- [x] Customer kiosk check-in flow with service catalog, validation, ticket code, assignment/waiting response.
- [x] Staff board with current/up-next queue, staff roster, SSE/polling refresh, verified actions, skip reasons, and rerouting.
- [x] Appointment/turn/attendance state machines and fair staff selection.
- [x] Admin appointment/payment/report surfaces and card/cash reconciliation.
- [x] PostgreSQL schema, migrations, seed catalog/users/staff, advisory-lock concurrency path.
- [x] Argon2id authentication/PINs, role guards, short-lived verified staff sessions, audit events, command receipts.
- [x] Docker standalone build, Compose Postgres/migrate/app services, optional nginx, health endpoint, and CI workflow.
- [x] Unit/contract test suite and documented Worker/D1 lifecycle QA/E2E reports.
- [x] Closing-job endpoint, local trigger script, and runbook; script now fails on HTTP/timeout errors instead of reporting transport-only success.
- [x] Admin Attendance, Customers, Staff, and Services read/write modules with PostgreSQL persistence, validation, authorization, audit events, and responsive forms.
- [x] Admin management regression tests for validation, customer lifecycle, attendance, staff deactivation, and service archive/reactivation.
- [x] Playwright Worker/D1 desktop/tablet suite authenticates against disposable D1 bootstrap accounts, including Admin customer Add/Edit/Delete.
- [x] Staff edit modal New PIN input aligned with the other form fields; keep-current-PIN guidance is shown as its placeholder.
- [x] Removed manual staff initials entry and moved initials derivation into the server/domain layer.
- [x] Added PostgreSQL-backed Skills and Accounts admin screens with CRUD/lifecycle APIs, validation, audit events, confirmed-delete flow, payment preservation, and safe-delete/last-admin safeguards.
- [x] Repository project-memory files: state, requirements, architecture, tasks, decisions, changelog, and handoff.
