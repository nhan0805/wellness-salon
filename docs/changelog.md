# Changelog

Release-style history of meaningful repository changes. Dates use the project timezone context and are based on the artifacts currently present in the workspace.

## Unreleased — 2026-10-10

### Added

- Added iPad-first operational polish across Admin, Turn board, and kiosk: shared live-refresh affordances, clearer queue hierarchy, touch-friendly skip reasons, safe-area support, reduced-motion handling, and consistent Lucide icon sizing.
- Added durable idempotency keys to kiosk check-in and admin payment confirmation retries.
- Added normalized customer phone identity storage and migration while preserving the formatted display phone value.

### Changed

- Removed the separate `START` board action. Accept now moves the assigned service directly into service through the existing `ACCEPTED` turn state; the legacy `STARTED` appointments and enum value are removed by migration.
- Added assignment guards for staff Accept/Skip/Finish actions and prevented deactivation of staff who are assigned to an active turn.

### Fixed

- Fixed Admin Appointments history rows being overwritten by the dashboard polling refresh; Day and Month now load immediately when selected, and Range loads automatically once both dates form a valid range. Removed the separate `Apply date` action.

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
