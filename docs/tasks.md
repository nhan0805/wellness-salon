# Tasks

Last updated: 2026-10-09

## Backlog

- Add a disposable PostgreSQL Playwright fixture for the complete kiosk → board → payment → reports journey.
- Add cleanup/retention jobs for expired verified sessions, command receipts, and audit data.
- Add scheduler retry/alerting guidance and a production deployment example once secrets/domain are approved.
- Add production TLS certificate/domain configuration after a human approval artifact.
- Reintroduce or attach repository Git metadata so branch, diff, and release history can be audited.

## Planned

- Recreate the Docker Compose stack from a host with Docker socket access.
- Verify Prisma migration/seed, `/api/health`, the closing endpoint, and the trigger script with the real PostgreSQL adapter.
- Run `RUN_DB_TESTS=true npm run test:coverage` and capture the result in the lifecycle report.
- Review production secret handling and ensure scheduler traffic uses a real secret manager.

## In progress

- Continue database-backed E2E coverage for station actions, payments, reporting, and the remaining admin workflows; the local Docker stack is healthy after the latest queue-card image build.

## Blocked

- Production TLS/domain/secret/merchant/deploy work is intentionally blocked on human approval gates.

## Completed
- [x] Split the Today’s turn board screen into Turn board and Staff attendance tabs, and made staff Check in/Check out actions prominent and touch-friendly.
- [x] Fixed the turn-board `Up next` display for multi-service appointments so all selected services, progress labels, and combined duration remain visible in one queue card.
- [x] Fixed mobile app/board topbar authentication actions so `Log in` and `Sign out` remain visible at narrow widths while secondary controls collapse to avoid overflow.
- [x] Refined "Edit Account" UI for better field alignment.
- [x] Unified sign-in flow with automatic role-based redirection.
- [x] Implemented interactive RolePreview dashboard for landing page.
- [x] Added Tip functionality to payments (Schema, Validation, API, UI).
- [x] Removed service category from the Prisma model, migration path, API contracts, seed data, admin catalog, and kiosk cards.
- [x] Made the turn board read-only view public; kept accept/skip/finish/check-in/out/add-support actions protected by station/admin authentication and staff PIN verification. Accept moves directly into service; there is no separate Start action.
- [x] Added multi-skill service requirements with a `ServiceSkill` migration, admin checkbox selection, all-skills routing, and unit/contract coverage.
- [x] Cleared the staff verification PIN when closing/reopening the modal, after submission, or when changing staff; disabled browser autocomplete for the PIN input.
- [x] Clarified which service each queue Accept/Skip action targets with visible action labels, highlighted next-service rows, and service-specific accessible button labels.
- [x] Fixed `Up next` responsive queue card layout so multi-service names do not collapse into narrow columns; assigned staff and action controls now have dedicated, responsive areas.
- [x] Made the dashboard `Open turns` KPI open the Payments screen directly with visible and keyboard-accessible action affordance.
- [x] Added dashboard KPI navigation to Reports, Queue, and filtered Completed Appointments screens.
- [x] Updated Admin Queue to show all services per appointment with individual and total durations.

- [x] Customer kiosk check-in flow with service catalog, validation, ticket code, assignment/waiting response.
- [x] Staff board with current/up-next queue, staff roster, SSE/polling refresh, verified actions, skip reasons, and rerouting.
- [x] Appointment/turn/attendance state machines and fair staff selection.
- [x] Admin appointment/payment/report surfaces and card/cash reconciliation.
- [x] PostgreSQL schema, migrations, seed catalog/users/staff, advisory-lock concurrency path.
- [x] Argon2id authentication/PINs, role guards, short-lived verified staff sessions, audit events, command receipts.
- [x] Docker standalone build, Compose Postgres/migrate/app services, optional nginx, health endpoint, and CI workflow.
- [x] Unit/integration test suite and documented lifecycle QA/E2E reports.
- [x] Closing-job endpoint, local trigger script, and runbook; script now fails on HTTP/timeout errors instead of reporting transport-only success.
- [x] Admin Attendance, Customers, Staff, and Services read/write modules with PostgreSQL persistence, validation, authorization, audit events, and responsive forms.
- [x] Admin management regression tests for validation, customer lifecycle, attendance, staff deactivation, and service archive/reactivation.
- [x] Playwright desktop/tablet suite updated to authenticate against configured PostgreSQL accounts, including Admin customer Add/Edit/Delete.
- [x] Staff edit modal New PIN input aligned with the other form fields; keep-current-PIN guidance is shown as its placeholder.
- [x] Removed manual staff initials entry and moved initials derivation into the server/domain layer.
- [x] Added PostgreSQL-backed Skills and Accounts admin screens with CRUD/lifecycle APIs, validation, audit events, confirmed-delete flow, payment preservation, and safe-delete/last-admin safeguards.
- [x] Repository project-memory files: state, requirements, architecture, tasks, decisions, changelog, and handoff.
