# Project state

Last updated: 2026-10-10

## Current project goal

Deliver a tablet-first nail-shop operations system that connects customer self-check-in, a staff turn board, admin payment confirmation, and end-of-day reporting in one codebase.

## Current milestone

V1 functional baseline and the iPad-first redesign are implemented. The repository remains in production-data hardening: every operational surface must use PostgreSQL, credentials must come from deployment secrets, and database-backed checks must be completed on the deployment host.

## Current sprint

Tablet workflow polish, durable mutation retries, and deployment verification.

## Current task

Complete the shared pastel/iPad interaction pass across Admin, Turn board, and kiosk while preserving the PostgreSQL workflow and removing the separate Start action.

## Last completed work
- Fixed Admin Appointments date-scope history being reset to today's rows by the parent polling refresh; Day and Month now auto-load on selection, Range auto-loads once both dates are valid, and the explicit `Apply date` button is removed.
- Split Today’s turn board into `Turn board` and `Staff attendance` tabs, with prominent labeled Check in/Check out actions for staff attendance.
- Fixed multi-service `Up next` cards so the board shows every selected service with its progress and combined duration instead of only the currently routed service.
- Fixed the mobile app and turn-board topbars so `Log in` and `Sign out` remain visible at narrow widths; secondary Admin/status controls collapse to avoid header overflow.
- Fixed the protected board action modal so PIN input is never retained between modal sessions or staff changes, and disabled browser autocomplete for that sensitive field.
- Clarified multi-service queue actions by pairing every Accept/Skip action with a visible service name and highlighting the currently next service.
- Redesigned the `Up next` queue card layout so multi-service names remain readable and each service action is grouped in a clear responsive footer instead of competing for the same horizontal row.
- Made the dashboard `Open turns` KPI open the Payments screen directly, with an explicit visible action hint and accessible button label.
- Added KPI navigation for Revenue/Payment split → Reports, Open turns → Queue, and Completed turns → Appointments with the Completed filter selected.
- Expanded the Admin Queue service column to display the full ordered service bundle and total duration for each customer.
- Fixed closing review to keep staff attached to `IN_SERVICE` or `PAYMENT_PENDING` appointments checked in until payment is completed; manual checkout now enforces the same rule.
- Refined "Edit Account" UI by converting the Role hint from footer text to a Badge alongside the label, improving field alignment.
- Unified sign-in flow: Removed separate admin sign-in route, implemented a single `/sign-in` entry point with automatic role-based redirection (Admin -> /admin, Station -> /board) via the root page.
- Transformed the landing page dashboard preview from a static image into an interactive `RolePreview` component with switchable tabs (Overview, Queue, Payments, Services).
- Implemented a "Tip" system for payments: added a `tip` column to the database, updated validation schemas, and added a tip input field in the Admin payment confirmation modal.
- Removed service categories from the service domain, admin service form/table, kiosk presentation, seed data, Prisma schema, and API contracts; added a forward migration that drops the legacy column and enum.
- Made the turn board publicly viewable without sign-in while keeping staff mutations protected by station/admin auth and staff PIN verification; added coverage for the public board view.
- Increased turn-board action/status visibility: `Accept` is now a filled blue CTA, unassigned turns show a `Waiting` badge, and shared status badges use stronger contrast and borders.
- Added multi-skill service routing: `ServiceSkill` stores one-or-more requirements, service management edits them as a checkbox set, and assignment requires every skill before applying check-in/availability/fairness ordering.

- Implemented kiosk, board, admin, sign-in, API route handlers, domain state machines, fairness routing, reconciliation, and PostgreSQL services.
- Implemented PostgreSQL/Prisma schema, versioned migrations, idempotent seed data, Auth.js credentials, Argon2id hashing, verified staff sessions, audit events, command receipts, and advisory-lock routing.
- Added Docker multi-stage build, PostgreSQL/migration/app Compose services, optional nginx proxy, health endpoint, CI workflow, unit/integration tests, and Playwright E2E coverage.
- Added the closing-job trigger script and local runbook instructions.
- Added this project-memory documentation set and linked it from `README.md`.
- Replaced the Admin Attendance, Customers, Staff, and Services placeholders with validated PostgreSQL read/write workflows, responsive forms, safe lifecycle actions, and regression tests.
- Added real Auth.js sign-out controls for Admin and the shared Station device; navigation no longer leaves the session cookie active.
- Normalized the optional New PIN field in the staff edit modal: the keep-current-PIN guidance is now the placeholder so the two inputs have the same overall height.
- Removed the manual Initials field from staff management; the API now derives display initials from the staff name while retaining the database column for board/avatar compatibility.
- Added database-backed Skills and Accounts management screens, including skill usage counts, account roles/password reset, audit events, and safe lifecycle guards.
- Refined the Account edit modal with a balanced responsive field layout, concise helper copy, full-width password row, and accessible focus handling for the dialog heading.
- Added confirmed account deletion with audit logging, station-session cleanup, current/last-admin protection, and payment-row preservation with deleted-account reference cleanup.
- Updated the Admin Queue Assigned column to use database-backed staff names and initials with a clearer visual hierarchy instead of raw staff IDs.
- Fixed the shared sign-in panel markup and aligned the Admin entry point with the shared sign-in form so the production Next.js build accepts both sign-in pages.
- Fixed PostgreSQL integration-test cleanup so temporary kiosk appointments release staff availability; verified Linda has no active assignment and is now `AVAILABLE`.
- Made the Board navigation role-aware: staff/station sessions no longer see the `Admin` link, while admin sessions retain it; the Board API now returns the authenticated viewer role for this decision.
- Standardized the PWA, browser, Apple, and in-app brand icons on one rounded-square artwork set; versioned the manifest and icon URLs so installed clients can refresh the corrected assets.
- Renamed the app metadata and installed PWA display name to `Wellness Salon` to match the app's visible brand and bumped the manifest URL cache version.
- Replaced the PWA/browser icon artwork with the official Lucide `Sparkles` icon and new `icon-sparkles-*` asset URLs.
- Fixed the KPI seed script's Prisma types so the Docker production build remains reproducible after client generation.
- Completed the iPad-first design pass: shared touch sizing, pastel status treatment, safe-area/reduced-motion rules, responsive queue cards, live refresh affordances, and audited Lucide icon usage across the three operational surfaces.
- Removed the separate board `START` action; Accept transitions directly into service through `ACCEPTED`, and the legacy `STARTED` appointments/state are removed by migration.
- Added normalized phone identity migration, kiosk/payment command-receipt replay keys, staff assignment guards, and a safe staff deactivation guard for active turns.

## Build and test status

Latest targeted verification on 2026-10-10: `npm run lint`, `npm run typecheck`, `npm test`, `npx prisma validate`, and `npm run build` pass after the iPad redesign and workflow hardening. Docker Compose was rebuilt/recreated; `docker-app-1` and PostgreSQL are healthy, migration `20261010160000_remove_legacy_started_turn_state` removed the legacy appointments and `STARTED` enum value, `/api/health` returns `status: ok`, `/api/board` returns an empty current queue, and the in-app browser renders `/board` successfully. The build retains existing Next.js metadata warnings for `themeColor`/`viewport` placement.

Checks run on 2026-10-08 from this workspace:

| Check | Status | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | No lint errors or warnings in the final run. |
| `npm run typecheck` | PASS | Must be run after `next build`; a concurrent build can replace `.next/types` while TypeScript is reading it. |
| `npm test` | PASS | Default host run passes 22 tests and skips 3 database-gated tests. |
| `npm run build` | PASS | Next.js 16.4 standalone build completed. |
| `npm run test:e2e -- --workers=1` | PASS (existing suite) | The existing 8-test desktop/tablet suite passes with configured credentials; Skills and Accounts CRUD still need dedicated browser coverage. |
| Docker health | PASS | `docker compose --env-file .env -f docker/docker-compose.yml up -d --build` completed; PostgreSQL and the app report healthy, phone normalization and legacy-`STARTED` migrations applied, and read-only health/board/services API checks passed. |

## Runtime

- PostgreSQL is the only application runtime. Route handlers use Prisma, Auth.js role checks, database transactions, advisory locks, and seeded data.
- If `DATABASE_URL` is missing or PostgreSQL is unavailable, `/api/health` returns a failure and the UI reports a database loading error; no synthetic records are created.

## Open issues

- The unprivileged shell cannot probe `127.0.0.1:3000` directly, but Docker's app healthcheck is passing after the latest rebuild.
- The unprivileged shell still cannot bind a local web server (`EPERM`); the current E2E pass used an approved local runtime with the server already running.
- `POST /api/jobs/closing` requires `CRON_SECRET` or an admin session in every runtime.
- `scripts/trigger-closing.sh` fails when `CRON_SECRET` is missing.
- The workspace currently has no `.git` directory, so branch/diff/commit state cannot be verified here.

## Technical debt

- Add a disposable PostgreSQL Playwright fixture for the full kiosk → board → payment → report journey.
- Expand Playwright coverage for the new admin CRUD workflows after the local listener restriction is removed.
- Add scheduler observability, retry policy, and a production deployment example after the secret/domain approval gate is available.
- Add a disposable PostgreSQL fixture for end-to-end reporting verification.
- Add retention/cleanup policy for expired `VerifiedStaffSession` and old `CommandReceipt` records.

## Next recommended task

1. From a host with Docker access, run `scripts/trigger-closing.sh` against the healthy Compose stack and capture the response.
2. Run `RUN_DB_TESTS=true npm run test:coverage` against a disposable PostgreSQL database.
3. Expand Playwright to cover station authentication, staff PIN verification, skip/reroute, finish, admin payment confirmation, report reconciliation, and the new Skills/Accounts CRUD workflows.
4. Only after those checks pass, take the production TLS, secret, scheduler, and deploy approvals described in `docs/lifecycle/approvals/README.md`.
