# Handoff

Last updated: 2026-10-10

## Project summary

Nail Shop Management is a Next.js 16 tablet-first operations app for one nail shop. It supports a guest kiosk, staff turn board, admin queue/payment/reports, and PostgreSQL-backed durability.

## Current status

- V1 implementation is present and builds successfully.
- `npm run lint`, `npm run typecheck`, `npm test`, `npx prisma validate`, and `npm run build` pass in this workspace.
- The iPad-first redesign is complete across Admin, Turn board, and kiosk: touch targets, responsive layouts, safe-area/reduced-motion rules, live refresh feedback, skip-reason controls, and Lucide icon consistency were verified in the in-app browser.
- The board no longer exposes a separate `START` action. Accept moves the assigned service directly into service through `ACCEPTED`; the legacy `STARTED` appointments/state are removed by migration.
- Kiosk check-in and payment confirmation now use durable idempotency receipts, customer phones have a normalized unique identity column, and staff ownership/deactivation guards protect active turns.
- The default host test run passes 22 tests and skips 3 PostgreSQL-gated tests; the Docker-network run with `RUN_DB_TESTS=true` remains the required durable-data verification path.
- Admin Appointments date filters now apply immediately without an `Apply date` button. Parent dashboard polling no longer replaces a manually loaded Day, Month, or valid Range scope with today's rows; stale date requests are ignored.
- Playwright is configured for database-backed desktop/tablet tests with station/admin sign-in and Admin customer Add/Edit/Delete; it needs a seeded PostgreSQL environment and an allowed local listener.
- Docker was rebuilt with the root `.env` file using `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`; PostgreSQL and the app are healthy and the migration service completed successfully. The restricted shell still cannot probe the published port directly.
- Migration `20261010160000_remove_legacy_started_turn_state` removed the old `A003`/`A005` appointment data and the `STARTED` PostgreSQL enum value. `ACCEPTED` remains the active turn marker after Accept.
- PWA and browser icon metadata now use the same rounded-square PNG artwork at 192px and 512px; the manifest/icon URLs are versioned to avoid retaining the prior circular mask treatment.
- The PWA/browser artwork now uses the official Lucide `Sparkles` paths with new `icon-sparkles-192.png` and `icon-sparkles-512.png` URLs; reinstall an existing PWA if the operating system still shows its cached icon.
- The turn board queue now uses a filled blue `Accept` CTA with an icon, a visible `Waiting` badge for unassigned turns, and higher-contrast status badges across the board.
- The turn board `Up next` queue now renders the complete ordered service bundle for multi-service appointments, with `Done`/`Next`/`Queued` labels and the combined duration.
- Today’s turn board is split into `Turn board` and `Staff attendance` tabs; attendance actions are prominent labeled Check in/Check out buttons and still open the protected staff verification modal.
- The staff verification modal clears the PIN on close, successful/failed submit, and staff change; the PIN field also opts out of browser autocomplete to avoid stale values reappearing.
- Queue actions now show the exact service beside each Accept/Skip pair; the next service row is highlighted and the buttons have service-specific accessible labels.
- `Up next` cards now use a responsive grid: the service bundle gets the main content width, assigned staff stays in a compact side panel, and Accept/Skip controls move into a labeled footer so multi-service names do not wrap into narrow columns.
- The dashboard `Open turns` KPI is now a keyboard-accessible action that switches directly to the Payments screen; its card shows an `Open payments` affordance and keeps the pending-payment count in the supporting text.
- Dashboard KPI navigation now routes Revenue and Payment split to Reports, Open turns to Queue, and Completed turns to Appointments with a visible All/Completed filter.
- Admin Queue now renders the complete ordered service bundle for each active appointment, including each service duration and the combined duration, instead of only the current/primary service.
- The latest queue-card image build completed and the stale app container was removed; Compose was recreated successfully with both `docker-app-1` and PostgreSQL healthy, and `/api/health` returned `status: ok`.
- Services now use the `ServiceSkill` join table. The admin service form supports multiple required skills, and routing requires all selected skills while preserving check-in, availability, and fairness priority.
- Mobile app and turn-board topbars keep `Log in` and `Sign out` visible at narrow widths; secondary Admin/status controls collapse to preserve header space.
- There is no `.git` directory in the workspace, so do not infer branch, diff, or commit history.

## Recently completed work

- Fixed multi-service appointment cards so `Up next` no longer hides all but the currently routed service.
- Fixed the responsive app/board authentication actions so mobile users can still see and use `Log in` or `Sign out` without header overflow.
- Added repository-level project memory and synchronized the README index.
- Documented requirements, architecture, decisions, task status, changelog, known risks, and next actions.
- Hardened the closing-job trigger script to fail on HTTP/timeout errors and added endpoint/secret/timeout overrides.
- Updated the local runbook to explain scheduler usage and the difference between container restart and Compose recreation.
- Implemented the admin Attendance, Customers, Staff, and Services modules end to end with PostgreSQL persistence, validation, authorization, audit events, responsive forms, and safe lifecycle rules.
- Added real session-clearing sign-out buttons for Admin and Station; admin pages and mutations remain protected while the board read-only view/API are public.
- Aligned the optional New PIN field in the staff edit modal with the other inputs by moving the keep-current-PIN guidance into the placeholder, keeping the two field blocks the same height.
- Removed manual Initials entry from the staff form; staff initials are now derived server-side from the name and remain available to the board/avatar surfaces.
- Added Skills and Accounts management screens with `/api/admin/skills` and `/api/admin/accounts`, Argon2id password handling, audit events, safe skill deletion, and last-admin/current-session protection.
- Refined the Account management modal with a wider desktop shell, balanced Email/Role layout, full-width password row, concise copy, and non-interactive heading focus styling.
- Added confirmed Account deletion with a database-backed DELETE route, audit event, station-session cleanup, current/last-admin protection, and payment-row preservation.
- Updated the Admin Queue Assigned column to show database-backed staff names and initials with a stronger visual hierarchy instead of raw staff IDs.
- Fixed the shared sign-in panel markup and aligned the Admin entry point with the shared sign-in form so the production Next.js build accepts both sign-in pages.
- Fixed PostgreSQL integration-test cleanup so temporary kiosk appointments release staff availability; verified Linda has no active assignment and is now `AVAILABLE`.
- Made the Board navigation role-aware: staff/station sessions no longer see the `Admin` link, while admin sessions retain it; the Board API now returns the authenticated viewer role for this decision.
- Standardized the PWA, browser, Apple, and in-app brand icons on one rounded-square artwork set and removed the `any maskable` SVG entry that caused inconsistent platform masking.
- Renamed the app metadata and installed PWA display name to `Wellness Salon` and bumped the manifest URL version for client refresh.
- Fixed the KPI seed script's Prisma types so Docker's generated-client build passes consistently.
- Added the iPad phase implementation, normalized-phone migration, mutation retry hardening, and the no-separate-Start lifecycle decision.
- Added admin adapter regression tests for validation, customer CRUD, attendance, staff deactivation, and service archive/reactivation.
- Added a Playwright Admin customer Add/Edit/Delete flow and verified the full 8-test desktop/tablet suite.
- Refined "Edit Account" UI by converting the Role hint from footer text to a Badge alongside the label, improving field alignment.
- Unified sign-in flow: Removed separate admin sign-in route, implemented a single `/sign-in` entry point with automatic role-based redirection (Admin $\rightarrow$ /admin, Station $\rightarrow$ /board) via the root page.
- Transformed the landing page dashboard preview from a static image into an interactive `RolePreview` component with switchable tabs (Overview, Queue, Payments, Services).
- Implemented a "Tip" system for payments: added a `tip` column to the database, updated validation schemas, and added a tip input field in the Admin payment confirmation modal.
- Added the `20261008190000_service_multiple_skills` migration, service multi-skill admin controls, and all-skills routing coverage.
- Removed service categories from the service model, migration path, seed data, API contracts, admin service table/form, and kiosk cards; service cards now use a shared presentation.
- Made `/board`, `GET /api/board`, and `GET /api/sse/board` public for a shared display; unauthenticated viewers see the queue with redacted guest labels and no action controls, while staff mutations still require station/admin auth and PIN verification.
- Synchronized the unauthenticated board header with the home header: both now use the quiet `Log in` action with the same icon treatment.
- Documented that the board polls the public board API every 3 seconds, so new kiosk check-ins appear automatically without a full-page reload.

## Files changed in the latest task

- `public/icons/icon-sparkles.svg`
- `public/icons/icon-sparkles-192.png`
- `public/icons/icon-sparkles-512.png`
- `public/manifest-v1.json`
- `app/layout.tsx`
- `README.md`
- `scripts/trigger-closing.sh`
- `docs/runbook/LOCAL.md`
- `docs/project_state.md`
- `docs/requirements.md`
- `docs/architecture.md`
- `docs/tasks.md`
- `docs/decisions.md`
- `docs/changelog.md`
- `docs/handoff.md`
- `src/components/admin-management.tsx`
- `src/domain/staff.ts`
- `src/components/admin-access.tsx`
- `src/server/admin-auth.ts`
- `src/server/services/admin-operations.ts`
- `app/api/admin/skills/route.ts`
- `app/api/admin/accounts/route.ts`
- `app/api/admin/attendance/route.ts`
- `app/api/admin/customers/route.ts`
- `app/api/admin/staff/route.ts`
- `app/api/admin/services/route.ts`
- `src/domain/types.ts`
- `src/server/validation.ts`
- `src/server/services/prisma-operations.ts`
- `app/(admin)/admin/page.tsx`
- `app/globals.css`
- `app/(board)/board/page.tsx`
- `src/components/sign-in-panel.tsx`
- `app/admin/sign-in/page.tsx`
- `tests/integration/postgres.test.ts`
- `app/api/board/route.ts`
- `app/api/sse/board/route.ts`
- `app/(board)/layout.tsx`
- `app/(board)/board/page.tsx`
- `tests/unit/admin-management.test.ts`
- `tests/integration/admin-access.test.ts`
- `tests/e2e/admin-records.spec.ts`
- `tests/e2e/authorization.spec.ts`
- `src/components/role-preview.tsx`
- `app/page.tsx`
- `prisma/schema.prisma`
- `prisma/migrations/20261008180000_remove_service_category/migration.sql`

## Important context

- Read `AGENTS.md` before framework code changes. This repository uses the installed Next.js guide under `node_modules/next/dist/docs/`; App Router conventions apply.
- Read all seven project-memory files before starting a new task, then read the relevant lifecycle artifact under `docs/lifecycle/`.
- PostgreSQL is the only runtime; `DATABASE_URL` is required and missing/unavailable database state is surfaced as a health/configuration failure.
- Compose uses PostgreSQL 16, a `migrate` service, an `app` service, and an optional `nginx` proxy profile. After changing Compose environment values, run `up -d --build` so the container is recreated; `restart` does not apply new environment values.
- Seed credentials and the closing secret are read from `.env`; they are never hardcoded in the repository.
- `POST /api/jobs/closing` accepts a matching `x-cron-secret` or an admin session in every runtime.
- The database routing lock is transaction-scoped and keyed by shop plus business date; add tenant identity if multi-tenancy is introduced.

## Outstanding work

1. Run the closing trigger against the healthy PostgreSQL stack and capture the response.
2. Run `RUN_DB_TESTS=true npm run test:coverage` against a disposable PostgreSQL database.
3. Expand Playwright to cover station auth, staff PIN/session, skip/reroute, finish, admin payment, report reconciliation, staff/service management, and Skills/Accounts CRUD.
4. Complete TLS/domain/secret/scheduler/deploy approval gates before production claims.

## Known issues and risks

- E2E requires a runtime that permits the local server listener; the current approved run passed all 8 desktop/tablet tests.
- The unprivileged shell cannot connect directly to the published localhost port; use Docker's health status or the in-app browser for runtime checks.
- Dashboard and report values are database projections for the selected business date; Queue and Payments remain scoped to the current business date.
- In-memory PIN lockout is process-local; production horizontal scaling would need a shared rate-limit/lockout store.
- SSE database mode sends snapshots/keepalives but does not yet have a cross-instance event bus.
- Production scheduler, TLS, merchant terminal, and destructive migration decisions are intentionally human gates.

## Recommended next commands

From a host with Docker access:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
curl -fsS http://localhost:3000/api/health
RUN_DB_TESTS=true npm run test:coverage
CRON_SECRET="<value from .env>" zsh scripts/trigger-closing.sh
```

Then run the E2E suite in an environment that permits Playwright to start `127.0.0.1:3000` and update `docs/lifecycle/E2E-report-v1.md` with the current result.

## Notes for the next AI agent

Do not start by rewriting the application. First read `project_state.md`, `requirements.md`, `architecture.md`, `tasks.md`, `decisions.md`, `changelog.md`, and this file. Preserve unrelated working-tree files, use `apply_patch` for edits, and update the relevant memory documents before ending the task. If a request changes architecture or requirements, add an ADR/change entry in the same task.
