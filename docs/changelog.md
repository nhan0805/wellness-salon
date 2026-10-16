# Changelog

Release-style history of meaningful repository changes. Dates use the project timezone context and are based on the artifacts currently present in the workspace.

## Unreleased — 2026-10-16

### Performance and board synchronization

- Split the Admin dashboard's settings, management, access, appointment-action, and payment-keypad modules into on-demand client chunks; the initial Admin page chunk is now about 118 KB raw instead of about 209 KB.
- Removed the remote Google Fonts CSS import and switched the first paint to a local system font stack.
- Added version-aware board polling with cheap `304` responses for unchanged state, while keeping the first API snapshot full and carrying authenticated viewer metadata through SSE.
- Reused one request-local Prisma runtime for catalog, appointment, report, and past-unresolved read groups; skipped public board skip-reason reads and added migration `0003_appointment_read_indexes.sql`.
- Documented the remaining in-memory appointment-sort and broad-history scan follow-ups in `docs/cloudflare/PERFORMANCE.md`.

### Verification

- `npm run lint`, `npm run typecheck`, and `npm test -- --reporter=dot` pass (54 tests).
- `npm run test:e2e:d1` passes 31 tests with one intentional skip after applying all three disposable D1 migrations.

## Unreleased — 2026-10-15

### Admin loading resilience

- Added bounded client-side request deadlines for Admin reads and mutations, with cancellation of superseded requests, stale-response guards, and Retry/error states.
- Changed Dashboard refreshes to use a section-aware snapshot endpoint, apply successful sections independently, narrow the live projection, and skip overlapping/heavy background refreshes.
- Changed the Attendance read to use direct D1 SQL for a small, predictable read.
- Removed the module-global Prisma/D1 runtime and cross-request Promise queue; every Prisma operation now uses a request-local client and the E2E harness rejects cross-request I/O/cancellation signatures.
- Added `Server-Timing`, response-duration diagnostics, slow Prisma-operation logs, and a partial-dashboard warning event.
- Added an authenticated Worker/D1 Attendance E2E smoke covering the loading-to-rendered transition.

### Verification

- `npm run lint` and `npm run typecheck` pass.
- `npm test` passes 54 tests.
- `npm run test:e2e:d1` passes 31 tests with one intentional skip.
- The final Worker/D1 gate passes 31 tests with one intentional skip and no Worker cancellation/cross-request I/O signatures.

## Unreleased — 2026-10-13

### D1 handoff/test target

- Made Cloudflare Worker + D1 the canonical runtime and database-backed test target for handoff; PostgreSQL/Docker remains compatibility/rollback only.
- Added `npm run test:e2e:d1`, which builds the Worker artifact, applies two D1 migrations, applies the 101-statement disposable bootstrap, and runs the Worker/D1 Playwright gate.
- Removed PostgreSQL-only integration suites and PostgreSQL service/setup from the active CI pipeline. The static suite now passes 51/51 with no DB skips; the D1 gate passes 25/26 with one intentional desktop-project skip.
- Added the iPad queue responsive regression for portrait/landscape layouts and synchronized README, handoff, architecture, migration, test matrix, release checklist, and Cloudflare reports.
- Deployed Worker version `ca6490a9-345d-4a25-b69a-be93ecd6a8ce` to `https://wellness.n8l.workers.dev` with the configured `*/15 * * * *` trigger; read-only health/catalog/page smoke passed.
- Preserved the existing remote D1 schema/data and Wrangler secrets; no D1 reset, custom domain, or production-data import was performed. Full remote auth/mutation/scheduler/capacity verification remains open.

## Unreleased — 2026-10-12

### Cloudflare Free migration audit

- Added the official vinext/Cloudflare build scaffold, Worker configuration, and D1 binding metadata without creating remote Cloudflare resources.
- Added Worker-safe `hash-wasm` Argon2id verification and removed the hidden Vietnam timezone bootstrap fallback; the final timezone remains an owner decision.
- Added a separate D1 schema/migration and local Worker runtime bridge. Direct vinext page/data smoke, local check-in idempotency, and concurrent code allocation pass; D1 command atomicity/rollback, money representation, concurrency breadth, Auth.js portability, and production tests remain release blockers.
- No production deployment, remote D1 database, secret upload, or real production data operation was performed.

### Changed

- Restored iPad standalone PWA mode with `display: standalone`, versioned manifest URL `?v=10`, Apple web-app capability/title/status metadata, and the existing 192px/512px app icons.
- Kept the staff/admin login form available inside the installed PWA and removed the standalone-only “Testing the installed app” instruction banner from the production login screen.
- Kept login credentials environment-only; no password or secret was hard-coded into the UI or client bundle.
- Added one shared amount keypad for payment confirmation: final amount, card/cash tip, and cash received use the same USD-first input, quick values, keyboard support, and focus-to-expand behavior.
- Removed `adjustmentReason` from the initial payment-confirmation schema, service, audit metadata, and history summary. Changing the final amount no longer opens or requires a reason field; post-confirmation adjustment, correction, and refund commands keep their own reason requirements.

### Verification

- `npm run lint`, `npm run typecheck`, `npm test -- --run` (34 passed, 9 DB-gated skips), and `npm run build` passed.
- A prior Docker-enabled host recorded a successful Compose production rebuild and live manifest check; Docker socket access was BLOCKED in the current Cloudflare migration environment, so that result is retained as historical evidence only.
- The payment-confirmation keypad/API follow-up passed the same static gates; no database migration is required for the removed confirm-only field.
- Physical iPad reinstall and WebKit keyboard behavior remain manual checks; remove and re-add the existing Home Screen icon before testing because iPad can cache install metadata.

## Unreleased — 2026-10-11

### Added

- Restored a normalized service-category taxonomy with seven seeded categories, ordered/archive-safe lifecycle rules, migration backfill, Admin CRUD/filtering, and grouped kiosk presentation. The earlier category-free decision remains in migration history but is superseded for the current catalog contract.
- Added searchable service-icon selection and deterministic timezone/currency option data for Admin configuration and service forms.
- Added append-only `TurnEvent` history with actor/assigned-staff snapshots, reasons, and an Admin appointment turn-history view.
- Added Admin payment history plus idempotent, audited payment amount/method/tip adjustments, bookkeeping corrections, and full/partial refund records. Refunds document an external terminal action and do not process card data.

### Changed

- Consolidated appointment operations behind a compact `...` menu for payment, history, service change, reassignment, skip override, and cancellation actions.
- Updated the current project memory and release evidence to distinguish the 2026-10-11 follow-up from the previously recorded 2026-10-10 hardening/DB/E2E evidence.

### Verification

- Current tree: Prisma generate/validate, lint, typecheck, 31 default tests (9 DB-gated skips without `TEST_DATABASE_URL`), coverage, and production build pass. Coverage is 24.88% statements/lines, 68.75% branches, and 11.39% functions.
- The follow-up paths have not yet received dedicated disposable DB/E2E coverage; existing hardening DB/E2E evidence remains recorded separately and no production database/deployment was changed.

## Unreleased — 2026-10-10

### Added

- Added iPad-first operational polish across Admin, Turn board, and kiosk: shared live-refresh affordances, clearer queue hierarchy, touch-friendly skip reasons, safe-area support, reduced-motion handling, and consistent Lucide icon sizing.
- Added durable idempotency keys to kiosk check-in and admin payment confirmation retries.
- Added normalized customer phone identity storage and migration while preserving the formatted display phone value.
- Added the reliability-hardening paths for exact-service skip exclusions/manager override, cancellation, reassignment, service changes, queue repair, support release, closing/retention, session revalidation, database-backed PIN lockout, request/lock/sync/job telemetry, and disposable benchmark/load profiles.

### Changed

- Updated the Admin service visibility and Shop configuration fair-turn settings to balanced, accessible `Yes`/`No` segmented controls; the controls preserve the existing `isActive` and `roundRobinEnabled` persistence contracts across desktop and mobile layouts.
- Removed the separate `START` board action. Accept now moves the assigned service directly into service through the existing `ACCEPTED` turn state; the legacy `STARTED` appointments and enum value are removed by migration.
- Added assignment guards for staff Accept/Skip/Finish actions and prevented deactivation of staff who are assigned to an active turn.

### Fixed

- Fixed Admin Appointments history rows being overwritten by the dashboard polling refresh; Day and Month now load immediately when selected, and Range loads automatically once both dates form a valid range. Removed the separate `Apply date` action.
- Fixed the desktop Admin sidebar being unable to reach its lower navigation items by adding an independent viewport-height vertical scroll region while preserving the horizontal mobile navigation behavior.
- Replaced the payment-method select with large Cash/Card segmented buttons so admins can choose the terminal method with one tap.
- Balanced the shared modal typography scale across titles, context text, labels, inputs, helper copy, and action buttons, including the payment modal's method label.
- Audited every Admin and Turn board modal and added consistent section spacing; the payment method group now has clear separation before the Tip field.

### Verification

- Static gates passed for the 2026-10-10 hardening tree: lint, typecheck, 31 default tests with 9 intentional DB-gated skips, Prisma validation, and production build. That recorded coverage rerun reported 27% statements/lines, 68.04% branches, and 12.85% functions.
- Disposable PostgreSQL verification passed all 14 migrations + seed, `postgres` 3/3, `admin-access` 1/1, and `critical-workflows` 5/5 sequentially. Protected tablet E2E passed 7/7, returning-guest kiosk 2/2, resilience 3/3, and Chromium portrait/landscape review passed with physical-device/network limits recorded.
- No production database, deployment, infrastructure, or dependency was changed. Detailed evidence and remaining gates are tracked in [`docs/implementation/FINAL_REPORT.md`](implementation/FINAL_REPORT.md).

## Unreleased — 2026-10-09

### Fixed

- Fixed the mobile app and turn-board topbars hiding all non-icon buttons at widths up to 600px; `Log in` and `Sign out` remain visible while secondary Admin/status controls collapse to preserve space.
- Fixed multi-service appointments on the turn board so each `Up next` card lists the complete selected service bundle, labels each service's progress, and shows the combined duration instead of only the currently routed service.
- Added separate `Turn board` and `Staff attendance` tabs to Today’s turn board; staff check-in/out actions now use prominent labeled buttons instead of subtle icon-only controls.
- Fixed the staff verification modal retaining the PIN after closing; opening a new action now starts with a blank PIN, changing staff clears it, and browser autocomplete is disabled for the verification field.
- Clarified multi-service queue actions by showing an `Action for` service label beside each Accept/Skip pair and highlighting the next service row.
- Redesigned `Up next` queue cards so service details keep a readable width while assigned staff and service actions sit in a clear responsive footer; this prevents multi-service names from collapsing into one-character columns.
- Made the dashboard `Open turns` KPI an accessible action that opens the Payments screen, with a visible `Open payments` affordance.
- Added dashboard KPI navigation: Revenue and Payment split open Reports, Open turns opens Queue, and Completed turns opens Appointments with the Completed filter selected.
- Expanded the Admin Queue service column to show every service in the customer's appointment with per-service duration and a total duration summary.

## Unreleased — 2026-10-08

### Added

- Added PostgreSQL-only runtime behavior: catalog, board, dashboard, reports, authentication and mutations now require the database path.
- Added environment-driven seed credentials and strict Compose interpolation for database, auth, scheduler and initial account secrets.
- Added database-backed service catalog loading and authenticated database E2E helpers.
- Added the project-memory set: `project_state.md`, `requirements.md`, `architecture.md`, `tasks.md`, `decisions.md`, and `handoff.md`.
- Added README links so a new agent can discover the project memory immediately.
- Added backend-backed Admin Attendance, Customers, Staff, and Services modules with PostgreSQL persistence, Zod contracts, role checks, audit events, and responsive CRUD/lifecycle forms.
- Added regression coverage for admin validation, customer lifecycle, attendance, staff deactivation, and service archive/reactivation.
- Added a Playwright Admin customer Add/Edit/Delete flow; the desktop/tablet suite now passes 8 tests when run with an allowed local listener.

- Interactive `RolePreview` dashboard component on landing page.
- Tip support for payment confirmation in Admin console.
- Added a migration to remove the legacy service category column and enum.
- Added a public read-only turn board path and an E2E assertion that visitors can open `/board` without signing in.
### Changed

- Expanded `docs/runbook/LOCAL.md` with closing-job configuration, secret boundaries, HTTP failure behavior, and the Compose recreate requirement.
- Recorded current test/runtime verification and known limitations instead of assuming the previous Docker process is healthy.

- Unified sign-in flow: replaced separate admin/station routes with a single `/sign-in` entry point and automatic role-based redirection.
- Refined "Edit Account" modal UI: converted Role hint to a Badge to improve input alignment.
- Removed service category from admin service management, kiosk cards, seed records, API validation, and the Prisma model; service cards now use a shared visual treatment.
- Changed board `GET`/SSE reads to public display endpoints; unauthenticated viewers see redacted guest labels and no staff action controls, while board mutations remain station/admin protected.
- Synchronized the public turn board login action with the landing page by using the same quiet `Log in` button and icon treatment.
- Documented the board's automatic 3-second refresh so new kiosk check-ins appear without a full-page reload.
- Replaced the PWA/browser artwork with the official Lucide `Sparkles` paths and bumped the manifest/icon URLs to fetch the new assets.
- Made the board's `Accept` action a filled blue CTA with an icon, converted unassigned queue entries to a visible `Waiting` badge, and increased contrast across all status badges.
- Added many-to-many service skill requirements. Admins can select multiple skills per service, and assignment now requires a present, available staff member to have every selected skill before fairness ordering is applied.
### Fixed

- Fixed closing review to keep staff attached to `IN_SERVICE` or `PAYMENT_PENDING` appointments checked in until payment is completed; manual checkout now enforces the same rule.
- Fixed sign-out controls so Admin and shared Station sessions actually clear the Auth.js cookie instead of only navigating to the home page.
- Fixed kiosk turn-code collisions after deleted records or across business dates by deriving the next code from the highest existing daily sequence and adding a `(business_date, code)` database constraint.
- Replaced raw Prisma unique-constraint errors in the kiosk response with a user-safe retry message.
- Hardened `scripts/trigger-closing.sh` so connection errors, timeouts, and HTTP 4xx/5xx responses return a non-zero exit status. The script supports `CLOSING_URL`, `CRON_SECRET`, and `CURL_TIMEOUT_SECONDS` overrides.
- Aligned the staff edit modal's optional New PIN input with the other fields by using the keep-current-PIN guidance as the placeholder, so the form fields have the same overall height.
- Removed manual Initials entry from staff management; initials are now derived server-side from the staff name while existing database records remain compatible.
- Added Skills and Accounts admin screens and APIs with database-backed CRUD/lifecycle operations, password hashing, audit events, and safe management rules.
- Polished the Account management modal: widened the desktop layout, balanced the Email/Role fields, moved the password field to a full-width row, removed duplicated guidance, and suppressed the non-interactive heading focus outline.
- Added confirmed Account deletion with audit logging, station-session cleanup, current/last-admin protection, and payment preservation while clearing the deleted account reference.
- Updated the Admin Queue Assigned column to show database-backed staff names and initials with a stronger visual hierarchy instead of raw staff IDs.
- Fixed the shared sign-in panel markup and aligned the Admin entry point with the shared sign-in form so the production Next.js build accepts both sign-in pages.
- Fixed PostgreSQL integration-test cleanup so temporary kiosk appointments release staff availability; verified Linda has no active assignment and is now `AVAILABLE`.
- Made the Board navigation role-aware: staff/station sessions no longer see the `Admin` link, while admin sessions retain it; the Board API now returns the authenticated viewer role for this decision.
- Standardized the PWA, browser, Apple, and in-app brand icons on one rounded-square artwork set; replaced the maskable SVG entry with versioned 192px/512px PNG assets to prevent platform-specific circular masking.
- Renamed the app metadata and installed PWA display name to `Wellness Salon` so the name is consistent across browser tabs, install prompts, and launcher entries, and bumped the manifest URL cache version.
- Fixed the KPI seed script's Prisma types so the Docker production build remains reproducible after client generation.

### Removed

- Removed process-local runtime state, hardcoded sign-in credentials, static dashboard figures, and public service-id aliases.

## V1 baseline — 2026-10-07

### Added

- Tablet-first kiosk, staff board, admin console, sign-in pages, API Route Handlers, SSE board updates, and PostgreSQL services.
- Domain routing/fairness, appointment/turn/attendance state machines, reconciliation, in-memory serialization, Prisma schema/migrations/seed, advisory-lock database operations, audit events, and command receipts.
- Auth.js Credentials roles, Argon2id password/PIN hashing, verified staff sessions, request validation/security headers, Docker Compose, nginx profile, CI, unit/integration tests, and Playwright desktop/tablet tests.

### Changed

- Established lifecycle artifacts from product outline through requirements, solution architecture, QA, E2E, unit tests, and CI/CD.

### Fixed

- Preserved skip as a turn outcome with rerouting rather than treating it as appointment cancellation.
- Added payment uniqueness and report reconciliation so card plus cash can be checked against system revenue.

### Removed

- None.
