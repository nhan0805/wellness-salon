# Handoff

Last updated: 2026-10-12

## Project summary

Nail Shop Management is a Next.js 16 tablet-first operations app for one nail shop. It supports a guest kiosk, staff turn board, admin queue/payment/reports, and PostgreSQL-backed durability.

## Current status

- V1 implementation, the authorized 2026-10-10 reliability-hardening batch, and the 2026-10-11 catalog/payment traceability follow-up are present and build successfully.
- Fresh static gates pass: `npm run lint`, `npm run typecheck`, `npm test -- --run` (34 passed, 9 DB-gated skipped without a disposable DB), `npx prisma validate`, and `npm run build`.
- The current coverage rerun reports 24.88% statements/lines, 68.75% branches, and 11.39% functions; this is a broad V8 report that includes untested UI/server modules and is not a release threshold.
- Disposable PostgreSQL verification is recorded separately: all 14 migrations plus seed passed; `postgres` passed 3/3, `admin-access` 1/1, and `critical-workflows` 5/5 when run sequentially against `127.0.0.1:55432/nailshop_test`.
- Browser verification is recorded separately: protected tablet workflows 7/7, returning-guest kiosk 2/2, and resilience 3/3. Chromium viewport review at 810×1080 and 1080×810 found no horizontal overflow and primary controls at least 44px.
- Representative disposable measurements passed: 20,000-appointment read benchmark, 30/30 production-build board HTTP smoke, 120-operation concurrent service-layer profile, 70-operation authenticated HTTP profile, and 350-operation pool-constrained profile; none establishes a production SLO.
- The iPad-first redesign is complete across Admin, Turn board, and kiosk: touch targets, responsive layouts, safe-area/reduced-motion rules, live refresh feedback, skip-reason controls, and Lucide icon consistency were verified in the in-app browser.
- The board no longer exposes a separate `START` action. Accept moves the assigned service directly into service through `ACCEPTED`; the legacy `STARTED` appointments/state are removed by migration.
- Kiosk check-in and payment confirmation now use durable idempotency receipts, customer phones have a normalized unique identity column, and staff ownership/deactivation guards protect active turns.
- The service catalog is currently category-aware: categories are ordered/archivable, services require one category and can choose a searchable Lucide icon, Admin filters the catalog, and the kiosk groups services by category. This supersedes the earlier category-free interim decision.
- Admin can inspect appointment turn history and payment history; payment amount/method/tip adjustments, bookkeeping corrections, and full/partial refund records are admin-only, retry-safe, and audit-backed. They document external terminal actions; they do not process card data.
- The baseline read-only audit remains at `docs/audits/2026-10-10-nail-salon-mvp-audit.md`; the implementation follow-up and evidence live under `docs/implementation/`.
- Admin Appointments date filters now apply immediately without an `Apply date` button. Parent dashboard polling no longer replaces a manually loaded Day, Month, or valid Range scope with today's rows; stale date requests are ignored.
- The desktop Admin sidebar now has its own viewport-height vertical scroll area so all navigation items remain reachable; the mobile menu keeps its horizontal scroll behavior.
- The Admin payment modal now uses two large Cash/Card buttons with pressed state and the same `CARD`/`CASH` API contract.
- Payment confirmation now uses one shared, USD-first `AmountKeypad` for final amount, card/cash tip, and cash received; each field expands the keypad on focus/click and supports quick values.
- Initial payment confirmation no longer prompts for or accepts `adjustmentReason`; original/current amounts remain in the confirmation audit trail, while later adjustment/correction/refund commands remain reasoned and audited.
- Service visibility and Shop configuration fair-turn routing now use balanced `Yes`/`No` segmented controls with `aria-pressed`; the existing `isActive` and `roundRobinEnabled` API values are unchanged.
- Shared modal typography and spacing are now normalized for iPad: 24px title, 15–16px context/labels and controls, 14px helper copy, 15px actions, and a clear gap between payment method buttons and Tip.
- All Admin and Turn board modal families were audited together so payment, access, appointment-action, management/history, and staff-verification dialogs use the same readable hierarchy.
- Playwright is configured for database-backed desktop/tablet tests with station/admin sign-in and Admin customer Add/Edit/Delete; it needs a seeded PostgreSQL environment and an allowed local listener.
- Docker was rebuilt and checked on 2026-10-12 with the root `.env` file using `docker compose --env-file .env -f docker/docker-compose.yml up -d --build`; PostgreSQL and the app were healthy, the migration service completed, and `/api/health` returned `status: ok`.
- Migration `20261010160000_remove_legacy_started_turn_state` removed the old `A003`/`A005` appointment data and the `STARTED` PostgreSQL enum value. `ACCEPTED` remains the active turn marker after Accept.
- PWA and browser icon metadata now use the same rounded-square PNG artwork at 192px and 512px; the manifest/icon URLs are versioned to avoid retaining the prior circular mask treatment.
- The PWA/browser artwork now uses the official Lucide `Sparkles` paths with new `icon-sparkles-192.png` and `icon-sparkles-512.png` URLs; reinstall an existing PWA if the operating system still shows its cached icon.
- Standalone PWA mode is enabled again for iPad testing: `public/manifest-v1.json` uses `display: standalone`, the root layout emits Apple web-app metadata, and the manifest URL is now `?v=10`. The sign-in form remains available inside the installed app without an extra PWA instruction banner. Remove and re-add the old Home Screen icon so iPad does not retain the previous browser-mode manifest.
- PWA metadata and login behavior were rebuilt and verified on 2026-10-12: Docker app healthy, `/api/health` returned `status: ok`, manifest returned `display: standalone`, and the sign-in HTML contained the Apple capability/status/title tags. Seed credentials remain `.env`-only and are not prefilled or committed into the client bundle.
- The turn board queue now uses a filled blue `Accept` CTA with an icon, a visible `Waiting` badge for unassigned turns, and higher-contrast status badges across the board.
- The turn board `Up next` queue now renders the complete ordered service bundle for multi-service appointments, with `Done`/`Next`/`Queued` labels and the combined duration.
- Today’s turn board is split into `Turn board` and `Staff attendance` tabs; attendance actions are prominent labeled Check in/Check out buttons and still open the protected staff verification modal.
- The staff verification modal clears the PIN on close, successful/failed submit, and staff change; the PIN field also opts out of browser autocomplete to avoid stale values reappearing.
- Queue actions now show the exact service beside each Accept/Skip pair; the next service row is highlighted and the buttons have service-specific accessible labels.
- `Up next` cards now use a responsive grid: the service bundle gets the main content width, assigned staff stays in a compact side panel, and Accept/Skip controls move into a labeled footer so multi-service names do not wrap into narrow columns.
- The dashboard `Open turns` KPI is now a keyboard-accessible action that switches directly to the Payments screen; its card shows an `Open payments` affordance and keeps the pending-payment count in the supporting text.
- Dashboard KPI navigation now routes Revenue and Payment split to Reports, Open turns to Queue, and Completed turns to Appointments with a visible All/Completed filter.
- Admin Queue now renders the complete ordered service bundle for each active appointment, including each service duration and the combined duration, instead of only the current/primary service.
- Earlier Compose verification after the queue-card image build removed the stale app container; recreation completed with both `docker-app-1` and PostgreSQL healthy, and `/api/health` returned `status: ok`.
- Services now use the `ServiceSkill` join table. The admin service form supports multiple required skills, and routing requires all selected skills while preserving check-in, availability, and fairness priority.
- Mobile app and turn-board topbars keep `Log in` and `Sign out` visible at narrow widths; secondary Admin/status controls collapse to preserve header space.
- There is no `.git` directory in the workspace. The current checkout is attached to `/private/tmp/wellness-salon-git` with `origin` set to `https://github.com/nhan0805/wellness-salon.git`; use explicit `GIT_DIR`/`GIT_WORK_TREE` variables and verify the temp metadata exists before relying on branch/diff history.

The full hardening evidence is split across [`docs/implementation/FINAL_REPORT.md`](implementation/FINAL_REPORT.md), [`docs/implementation/PROGRESS.md`](implementation/PROGRESS.md), [`docs/implementation/RELEASE_CHECKLIST.md`](implementation/RELEASE_CHECKLIST.md), and [`docs/implementation/TEST_MATRIX.md`](implementation/TEST_MATRIX.md).

## Recently completed work

- Completed the approved BR-01 through BR-06 hardening scope: durable exact-service skip exclusions with audited override, attendance/checkout safety, explicit same-day/idempotent retries, cancellation, audited service changes, and atomic supporting-technician release.
- Added server-side session-version revalidation, database-backed PIN lockout with a process-local fast path, verified-staff session revocation, request-hash conflict detection, advisory-lock telemetry, request IDs, structured API timings, board version signals, and closing/retention outcome telemetry.
- Added side-effect-free board reads with an explicit manager queue-repair action, SSE reconnect/backoff, bounded version-aware polling, dynamic ShopConfig presentation, server-side appointment history pagination, and disposable benchmark/load scripts.
- Completed sequential disposable PostgreSQL migration/seed and critical workflow verification, protected tablet E2E, returning-guest and resilience E2E, Chromium viewport review, and local HTTP/pool/concurrency profiles. Production infrastructure and databases were not touched.
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
- The Admin customer Add/Edit/Delete browser flow remains part of the pre-hardening evidence; the current hardening evidence is recorded as protected tablet 7/7 plus the separate returning-guest/resilience runs above.
- Refined "Edit Account" UI by converting the Role hint from footer text to a Badge alongside the label, improving field alignment.
- Unified sign-in flow: Removed separate admin sign-in route, implemented a single `/sign-in` entry point with automatic role-based redirection (Admin $\rightarrow$ /admin, Station $\rightarrow$ /board) via the root page.
- Transformed the landing page dashboard preview from a static image into an interactive `RolePreview` component with switchable tabs (Overview, Queue, Payments, Services).
- Implemented a "Tip" system for payments: added a `tip` column to the database, updated validation schemas, and added a tip input field in the Admin payment confirmation modal.
- Added the `20261008190000_service_multiple_skills` migration, service multi-skill admin controls, and all-skills routing coverage.
- Superseded the interim category-free service catalog with ordered `ServiceCategory` data, category CRUD/archive, migration backfill, category-aware service forms/filtering, and grouped kiosk presentation.
- Added `TurnEvent` migration/ledger and the Admin appointment turn-history modal with actor/staff snapshots and reasons.
- Added payment history plus audited adjustment/correction/refund routes and the compact Appointment action menu that gathers operational actions without widening the table.
- Made `/board`, `GET /api/board`, and `GET /api/sse/board` public for a shared display; unauthenticated viewers see the queue with redacted guest labels and no action controls, while staff mutations still require station/admin auth and PIN verification.
- Synchronized the unauthenticated board header with the home header: both now use the quiet `Log in` action with the same icon treatment.
- Documented that the board polls the public board API every 3 seconds, so new kiosk check-ins appear automatically without a full-page reload.

## Files changed in the latest task

The latest follow-up is present as workspace changes. This environment has no usable writable Git metadata, so no feature branch or commit could be created; the map below remains useful for review:

- Runtime/domain: `src/server/services/prisma-operations.ts`, `src/server/services/admin-operations.ts`, `src/server/auth.ts`, `src/server/security.ts`, `src/server/observability.ts`, `src/domain/*`.
- Cloudflare runtime/config: `cloudflare.config.ts`, `wrangler.local.jsonc`, `vite.config.ts`, `next.config.mjs`, `src/server/db.ts`, `src/types/cloudflare-workers.d.ts`, `prisma/d1/schema.prisma`, `prisma/d1/migrations/0001_init.sql`, and `tests/shims/cloudflare-workers.ts`.
- API/UI: `app/api/admin/appointments/*`, `app/api/admin/queue/reconcile`, `app/api/admin/config`, `app/api/admin/skip-reasons`, `app/api/jobs/*`, board/kiosk/admin routes and components.
- Persistence: `prisma/schema.prisma` and the 2026-10-09/10 migrations for snapshots, multi-service work, icons, normalized phones, legacy `STARTED` removal, operational safety, support release, turn events, and service categories.
- Follow-up API/UI: `app/api/admin/service-categories`, appointment turn history, customer/payment history, payment adjustment/correction/refund routes, `app/(admin)/admin/page.tsx`, `src/components/amount-keypad.tsx`, `src/components/admin-management.tsx`, `src/domain/locale-options.ts`, `src/server/validation.ts`, and `src/server/services/prisma-operations.ts`.
- Verification/tooling: `tests/integration/critical-workflows.test.ts`, `tests/e2e/protected-workflows.spec.ts`, `tests/e2e/resilience.spec.ts`, `scripts/seed-benchmark-fixture.ts`, `scripts/load-profile.ts`, and `scripts/http-load-profile.ts`.
- Documentation: project-memory files plus `docs/implementation/*`; the read-only audit remains unchanged as the pre-hardening baseline.

## Important context

- Read `AGENTS.md` before framework code changes. This repository uses the installed Next.js guide under `node_modules/next/dist/docs/`; App Router conventions apply.
- Read all seven project-memory files before starting a new task, then read the relevant lifecycle artifact under `docs/lifecycle/`.
- PostgreSQL remains the behavioral reference runtime; `DATABASE_URL` is required for that path. The additive vinext/D1 path uses the Worker `DB` binding and the separate D1 schema. Critical D1 writes now use explicit batches, while the compatibility lease/fallback paths are not production evidence because they cannot roll back partial writes.
- Compose uses PostgreSQL 16, a `migrate` service, an `app` service, and an optional `nginx` proxy profile. After changing Compose environment values, run `up -d --build` so the container is recreated; `restart` does not apply new environment values.
- Seed credentials and the closing secret are read from `.env`; they are never hardcoded in the repository.
- `POST /api/jobs/closing` accepts a matching `x-cron-secret` or an admin session in every runtime.
- The database routing lock is transaction-scoped and keyed by shop plus business date; add tenant identity if multi-tenancy is introduced.
- `ShopConfig` is the authoritative source for business timezone, opening/closing, currency, routing mode, and session TTL; environment values are bootstrap fallbacks.
- `ServiceCategory` is presentation taxonomy only; category does not affect skill eligibility or fairness routing. Active services must move before a category can be archived.
- The kiosk returning-customer privacy decision is option A: a matching phone may show the stored full name read-only, with a limited `no-store` response and no phone/customer record exposure.

## Outstanding work

1. Complete physical iPad/WebKit, touch/distance readability, Dynamic Type/VoiceOver, real Wi-Fi interruption, offline submission, refresh-during-mutation, and modal-focus review.
2. Complete the D1 command port with explicit batch/guard/receipt semantics, choose exact money representation, and prove rollback/interruption behavior for BR-01–BR-06.
3. Port and test Auth.js account/session access, cron authorization, realtime recovery, timezone/DST behavior, and deployed Worker capacity.
4. Measure staging/deployed lock waits, connection-pool behavior, network latency, and representative backup/history fixtures; rehearse rollback through backup/restore or an approved forward migration.
5. Fill the remaining scenario gaps in `docs/implementation/TEST_MATRIX.md` and complete TLS/domain/secret/merchant/deploy approval gates before production claims.

## Known issues and risks

- E2E requires a runtime that permits the local server listener; the recorded protected tablet run passed 7/7, returning-guest kiosk 2/2, and resilience 3/3.
- Docker verification is host-permission dependent; the current migration run could not access the Docker socket, so Docker health is recorded as BLOCKED for this environment. No `.env` contents were printed and no volumes were reset.
- The physical iPad has not yet been reinstalled and exercised after the standalone switch. On LAN HTTP, the manifest can be inspected, but service-worker behavior still requires a secure context such as HTTPS (localhost is the browser exception).
- Dashboard and report values are database projections for the selected business date; Queue and Payments remain scoped to the current business date.
- PIN lockout has a database-backed record plus a process-local fast path; deployment rate limiting and abuse monitoring remain operator concerns.
- SSE database mode sends snapshots/keepalives but does not yet have a cross-instance event bus.
- Kiosk lookup option A intentionally reveals a matching stored full name read-only; rate limiting/abuse monitoring is not implemented in the app.
- No down migration exists for the hardening batch; rollback requires backup/restore or an approved corrective forward migration.
- Production scheduler, TLS, merchant terminal, and destructive migration decisions are intentionally human gates.

## Recommended next commands

Local Cloudflare checks:

```bash
npm run db:generate:d1
npx wrangler d1 migrations apply wellness-salon --local --config=wrangler.local.jsonc
npm run dev:vinext
npx vinext check
npm run build:vinext
npx cf build
```

From a host with Docker access, the PostgreSQL reference checks remain:

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
docker compose --env-file .env -f docker/docker-compose.yml ps
curl -fsS http://127.0.0.1:3000/api/health
RUN_DB_TESTS=true TEST_DATABASE_URL="<disposable PostgreSQL URL>" npm test -- --run
CRON_SECRET="<value from .env>" zsh scripts/trigger-closing.sh
```

Keep `TEST_DATABASE_URL` isolated from `APPLICATION_DATABASE_URL`/`DATABASE_URL`; never point the DB-gated suite at the application database. Then run the protected Playwright suite in an environment that permits the local listener and update [`docs/lifecycle/E2E-report-v1.md`](lifecycle/E2E-report-v1.md) only when a new run is actually performed.

## Notes for the next AI agent

Do not start by rewriting the application. First read `project_state.md`, `requirements.md`, `architecture.md`, `tasks.md`, `decisions.md`, `changelog.md`, and this file. Preserve unrelated working-tree files, use `apply_patch` for edits, and update the relevant memory documents before ending the task. If a request changes architecture or requirements, add an ADR/change entry in the same task.
