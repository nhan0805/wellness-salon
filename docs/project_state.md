# Project state

Last updated: 2026-10-12

## Current project goal

Deliver a tablet-first nail-shop operations system that connects customer self-check-in, a staff turn board, admin payment confirmation, and end-of-day reporting in one codebase.

## Current milestone

V1 functional baseline, iPad-first redesign, reliability hardening, and the follow-up catalog/payment traceability batch are implemented. The repository is now at supervised-pilot release verification: every operational surface uses PostgreSQL, credentials come from deployment secrets, and physical-device/staging/deployment checks remain before unattended production use.

## Current sprint

Close the physical tablet, deployed-network, scheduler, and production approval gates without weakening the PostgreSQL workflow.

## Current task

Validate the hardening batch on real iPad/WebKit and staging-like infrastructure, then close the remaining release gates.

## Last completed work

- Completed the authorized BR-01 through BR-06 hardening scope: durable exact-service skip exclusions and audited override, attendance/checkout safety, explicit same-day visits with idempotent retries, cancellation, audited service changes, and atomic support release.
- Added session-version revalidation, database-backed PIN lockout, verified-session revocation, request-hash conflict detection, advisory-lock/request/sync/job telemetry, and explicit manager queue repair.
- Added board SSE reconnect/backoff and version-aware polling, dynamic ShopConfig presentation, server-side appointment history pagination/summary projection, and disposable benchmark/load tooling.
- Completed disposable PostgreSQL migration/seed verification, sequential DB-gated tests, protected tablet E2E, kiosk returning-guest E2E, resilience E2E, and Chromium viewport review; production DB/deployment/infrastructure were not changed.
- Restored the service-category taxonomy with ordered/archivable categories, migration backfill, Admin CRUD/filtering, grouped kiosk presentation, and searchable service-icon selection.
- Added append-only `TurnEvent` history for assignment, accept/skip/finish, cancellation, reassignment, continuation, and support lifecycle events, with an Admin appointment history view.
- Added Admin payment history plus audited amount/method/tip adjustment, bookkeeping correction, and full/partial refund recording with retry-safe command scopes.
- Added static timezone/currency option data, the compact Appointment action menu, and the exact configured staff-verification session duration.
- Replaced the Admin service `Visible on kiosk` and Shop configuration `Use fair turn routing` checkboxes with balanced accessible `Yes`/`No` segmented controls while preserving the existing `isActive` and `roundRobinEnabled` save behavior.
- Standardized Admin and board modal typography and spacing so titles, context, labels, fields, helper copy, and actions follow one readable iPad scale; the payment method group is separated from the Tip field.
- Replaced the payment-method select in the Admin payment modal with accessible Cash/Card buttons using the existing payment API values.
- Fixed the desktop Admin sidebar so its full navigation, including Accounts, Shop config, and Reports, can scroll to the bottom inside the viewport without changing the mobile horizontal menu.
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
- Superseded the interim category-free catalog decision: the current schema requires `ServiceCategory` for services, while the earlier category-removal migration remains historical and is followed by explicit restore/backfill migrations.
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
- Restored standalone PWA mode for iPad testing: the manifest uses `display: standalone`, Apple web-app metadata is emitted by the root layout, the manifest URL is versioned at `?v=10`, and the sign-in form remains usable inside the installed app without an extra PWA instruction banner. Credentials remain environment-only.
- Added the shared focus-to-expand amount keypad to payment confirmation for final amount, card/cash tip, and cash received; removed `adjustmentReason` completely from the initial confirm schema/service/audit/history path while retaining reasons for later adjustment/correction/refund commands.
- Fixed the KPI seed script's Prisma types so the Docker production build remains reproducible after client generation.
- Completed the iPad-first design pass: shared touch sizing, pastel status treatment, safe-area/reduced-motion rules, responsive queue cards, live refresh affordances, and audited Lucide icon usage across the three operational surfaces.
- Removed the separate board `START` action; Accept transitions directly into service through `ACCEPTED`, and the legacy `STARTED` appointments/state are removed by migration.
- Added normalized phone identity migration, kiosk/payment command-receipt replay keys, staff assignment guards, and a safe staff deactivation guard for active turns.

## Build and test status

Latest local static verification on 2026-10-12: `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test -- --run` (34 passed, 9 DB-gated skipped without DB env), `npx prisma validate`, `npm run test:coverage`, and `npm run build` pass. Coverage currently reports 24.88% statements/lines, 68.75% branches, and 11.39% functions. The implementation verification recorded 14 migrations + seed, sequential PostgreSQL tests (`postgres` 3/3, `admin-access` 1/1, `critical-workflows` 5/5), protected tablet E2E 7/7, returning-guest kiosk E2E 2/2, resilience E2E 3/3, and Chromium viewport review at 810×1080/1080×810 with no horizontal overflow. No production database, deployment, or infrastructure was changed.

Detailed evidence and scenario-level gaps are maintained in [`docs/implementation/FINAL_REPORT.md`](implementation/FINAL_REPORT.md), [`docs/implementation/RELEASE_CHECKLIST.md`](implementation/RELEASE_CHECKLIST.md), and [`docs/implementation/TEST_MATRIX.md`](implementation/TEST_MATRIX.md).

Verification evidence from the baseline and the 2026-10-10 hardening run:

| Check | Status | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | No lint errors or warnings in the final run. |
| `npm run typecheck` | PASS | Must be run after `next build`; a concurrent build can replace `.next/types` while TypeScript is reading it. |
| `npm test -- --run` | PASS | 34 tests passed; 9 DB-gated tests skipped when no disposable DB variables are provided. |
| `npm run test:coverage` | PASS | Current rerun: 24.88% statements/lines, 68.75% branches, 11.39% functions. |
| `npm run build` | PASS | Next.js 16.4.0 Turbopack production build completed and compiled the current route inventory. |
| DB-gated Vitest | PASS (recorded implementation run) | Disposable PostgreSQL: `postgres` 3/3, `admin-access` 1/1, `critical-workflows` 5/5; sequential execution required. |
| Playwright/viewport evidence | PASS with limitations | Protected tablet 7/7, returning kiosk 2/2, resilience 3/3, and Chromium portrait/landscape review; physical iPad/WebKit and real Wi-Fi remain. |
| Docker health | PASS on 2026-10-12 | Rebuilt with `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`; app/PostgreSQL healthy, migration service completed, and `/api/health` returned `status: ok`. |

## Runtime

- PostgreSQL is the only application runtime. Route handlers use Prisma, Auth.js role checks, database transactions, advisory locks, and seeded data.
- If `DATABASE_URL` is missing or PostgreSQL is unavailable, `/api/health` returns a failure and the UI reports a database loading error; no synthetic records are created.

## Open issues

- Physical iPad/WebKit and real-network behavior remain unverified after the standalone PWA switch; the Docker runtime itself was freshly verified on 2026-10-12.
- A future restricted shell may not access the Docker socket or bind/probe a local web server; use a Docker-enabled host or the in-app browser for runtime checks.
- `POST /api/jobs/closing` requires `CRON_SECRET` or an admin session in every runtime.
- `scripts/trigger-closing.sh` fails when `CRON_SECRET` is missing.
- The workspace still has no `.git` directory; this snapshot is tracked through the attached external Git metadata at `/private/tmp/wellness-salon-git` and pushed to `origin/main`.

## Technical debt

- Complete physical iPad/WebKit, distance readability, Dynamic Type/VoiceOver, real Wi-Fi, offline submission, and modal interaction review.
- Measure staging/deployed pool, lock-wait, network, and representative-history behavior; document backup/restore rollback.
- Expand remaining scenario coverage listed in `docs/implementation/TEST_MATRIX.md`, especially repeated staff actions, session revalidation, stale board versions, and closing/retention paths.
- Add dedicated DB/E2E coverage for the follow-up category, payment-history, refund, and turn-history paths before treating them as release-gated evidence.
- Configure scheduler observability/retry/alerting only after the deferred operations decision is reopened.
- Add retention/cleanup policy execution and operator runbook details for expired `VerifiedStaffSession` and old `CommandReceipt` records.

## Next recommended task

1. Execute the physical tablet/WebKit and real-network run sheet in `docs/implementation/TABLET_QA_PLAN.md`, including removing/re-adding the standalone PWA icon.
2. Run `RUN_DB_TESTS=true` with an isolated `TEST_DATABASE_URL` and capture any new DB-gated coverage result.
3. Only after those checks pass, take the production TLS, secret, scheduler, and deploy approvals described in `docs/lifecycle/approvals/README.md`.
