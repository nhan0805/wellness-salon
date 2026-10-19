# Project state

Last updated: 2026-10-19

## Cloudflare migration gate — current status

The Cloudflare Free migration is at **local D1 readiness plus the latest workers.dev deployment, remote migration apply, and authenticated read-only smoke**. The official vinext path builds a Worker artifact; the separate D1 schema/migrations power local health, catalog, board, public pages, authentication, kiosk check-in, staff/appointment/admin/payment workflows, and job smoke. Source commit `227a5dc` is live at `https://wellness.n8l.workers.dev`; all five migrations are applied to remote D1 with no pending migrations, the post-deploy health check returned `status: ok`, and `npm run smoke:remote` passed 19/19 checks. Critical mutation branches now use explicit D1 batches and guards; crash/interruption, full concurrency, business mutation/scheduler evidence, live capacity, physical-device QA, and final production cutover remain owner-gated. The owner-confirmed IANA timezone is `Asia/Ho_Chi_Minh`.

Closing/retention jobs use one guarded `*/15 * * * *` Worker trigger and read the current Admin-configured D1 timezone/closing time before running. Invalid or missing configuration disables them safely; `UTC` remains only the explicit unconfigured bootstrap sentinel. See [`docs/cloudflare/FINAL_REPORT.md`](cloudflare/FINAL_REPORT.md) and the full [`docs/cloudflare/`](cloudflare/) runbook set.

## Current project goal

Deliver a tablet-first nail-shop operations system that connects customer self-check-in, a staff turn board, admin payment confirmation, and end-of-day reporting in one codebase.

## Current milestone

V1 functional baseline, iPad-first redesign, reliability hardening, Free-tier quota hardening, and operational verification tooling are implemented. Cloudflare Worker + D1 is the only runtime and test target; the workers.dev deployment is available for supervised verification, while unattended production cutover remains blocked by the explicit evidence and owner approval gates.

## Current sprint

Complete failure-injection/concurrency, approved mutation/scheduler, live capacity, physical-device, and alerting evidence for the explicit D1 command branches, settle money representation, and then request production approval.

## Current task

Verify the canonical Worker/D1 runtime without weakening BR-01–BR-06, keep the D1 E2E gate and handoff docs current, and keep any additional remote resource changes behind explicit approval. The first workers.dev deployment is complete; local D1 is verified broadly, while full production cutover remains out of scope until the open evidence gates close.

## Last completed work

- Completed the authorized BR-01 through BR-06 hardening scope: durable exact-service skip exclusions and audited override, attendance/checkout safety, explicit same-day visits with idempotent retries, cancellation, audited service changes, and atomic support release.
- Added session-version revalidation, database-backed PIN lockout, verified-session revocation, request-hash conflict detection, lease/request/sync/job telemetry, and explicit manager queue repair.
- Added board SSE reconnect/backoff and version-aware polling, dynamic ShopConfig presentation, server-side appointment history pagination/summary projection, and repeatable local Worker/D1 verification tooling.
- Completed the canonical local Worker/D1 migration/bootstrap and E2E verification, protected tablet workflows, kiosk returning-guest flow, resilience recovery, and Chromium viewport review; remote D1 data and deployment infrastructure were not changed by local tests.
- Fixed indefinite Admin loading states: bounded reads/mutations with client cancellation, stale-response guards, Retry/error states, partial Dashboard refresh handling, and a direct D1 Attendance read; added the authenticated Attendance Worker/D1 smoke.
- Completed the first full-app performance pass: lazy Admin client chunks, version-aware board `304` polling, auth-safe SSE bootstrap metadata, shared request-local Prisma reads, narrower board projections, local first-paint fonts, and the date/created-at appointment index migration.
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

- Implemented kiosk, board, admin, sign-in, API route handlers, domain state machines, fairness routing, reconciliation, and D1 services.
- Implemented the SQLite/D1 schema, versioned migrations, idempotent bootstrap data, Worker Web Crypto credentials, verified staff sessions, audit events, command receipts, and lease-based routing.
- Added `wrangler.local.jsonc`, D1 client generation hooks, explicit Worker WASM loading, local D1 bootstrap, and the canonical Worker/D1 Playwright E2E gate.
- Added Worker health/build/deploy configuration, CI workflow, unit/contract tests, and disposable local D1 verification.
- Added the closing-job trigger script and local runbook instructions.
- Added this project-memory documentation set and linked it from `README.md`.
- Replaced the Admin Attendance, Customers, Staff, and Services placeholders with validated D1 read/write workflows, responsive forms, safe lifecycle actions, and regression tests.
- Added real Auth.js sign-out controls for Admin and the shared Station device; navigation no longer leaves the session cookie active.
- Normalized the optional New PIN field in the staff edit modal: the keep-current-PIN guidance is now the placeholder so the two inputs have the same overall height.
- Removed the manual Initials field from staff management; the API now derives display initials from the staff name while retaining the database column for board/avatar compatibility.
- Added database-backed Skills and Accounts management screens, including skill usage counts, account roles/password reset, audit events, and safe lifecycle guards.
- Refined the Account edit modal with a balanced responsive field layout, concise helper copy, full-width password row, and accessible focus handling for the dialog heading.
- Added confirmed account deletion with audit logging, station-session cleanup, current/last-admin protection, and payment-row preservation with deleted-account reference cleanup.
- Updated the Admin Queue Assigned column to use database-backed staff names and initials with a clearer visual hierarchy instead of raw staff IDs.
- Fixed the shared sign-in panel markup and aligned the Admin entry point with the shared sign-in form so the production Next.js build accepts both sign-in pages.
- Fixed local D1 test cleanup so temporary kiosk appointments release staff availability; verified Linda has no active assignment and is now `AVAILABLE`.
- Made the Board navigation role-aware: staff/station sessions no longer see the `Admin` link, while admin sessions retain it; the Board API now returns the authenticated viewer role for this decision.
- Standardized the PWA, browser, Apple, and in-app brand icons on one rounded-square artwork set; versioned the manifest and icon URLs so installed clients can refresh the corrected assets.
- Renamed the app metadata and installed PWA display name to `Wellness Salon` to match the app's visible brand and bumped the manifest URL cache version.
- Replaced the PWA/browser icon artwork with the official Lucide `Sparkles` icon and new `icon-sparkles-*` asset URLs.
- Restored standalone PWA mode for iPad testing: the manifest uses `display: standalone`, Apple web-app metadata is emitted by the root layout, the manifest URL is versioned at `?v=10`, and the sign-in form remains usable inside the installed app without an extra PWA instruction banner. Credentials remain environment-only.
- Added the shared focus-to-expand amount keypad to payment confirmation for final amount, card/cash tip, and cash received; removed `adjustmentReason` completely from the initial confirm schema/service/audit/history path while retaining reasons for later adjustment/correction/refund commands.
- Fixed the D1 bootstrap/client generation path so Worker builds remain reproducible.
- Completed the iPad-first design pass: shared touch sizing, pastel status treatment, safe-area/reduced-motion rules, responsive queue cards, live refresh affordances, and audited Lucide icon usage across the three operational surfaces.
- Removed the separate board `START` action; Accept transitions directly into service through `ACCEPTED`, and the legacy `STARTED` appointments/state are removed by migration.
- Added normalized phone identity migration, kiosk/payment command-receipt replay keys, staff assignment guards, and a safe staff deactivation guard for active turns.

## Build and test status

Latest local verification on 2026-10-19: lint, typecheck, 67/67 unit/integration tests, and the Worker/D1 gate pass 41 cases with one intentional skip. The combined Chromium/tablet/WebKit gate passes 61 cases with two intentional skips; the disposable D1 export/restore rehearsal passes; and `npm run smoke:remote` passes 19/19 public and authenticated admin read-only checks. GitHub Actions run `39184956401` deployed the current workers.dev source at `227a5dc`; remote D1 migration verification reports no pending migrations. Cloudflare CPU/quota metrics, approved business mutations, scheduler event evidence, physical-device QA, and deployed capacity observation remain open. Local tests do not mutate remote D1.

Detailed evidence and scenario-level gaps are maintained in [`docs/implementation/FINAL_REPORT.md`](implementation/FINAL_REPORT.md), [`docs/implementation/RELEASE_CHECKLIST.md`](implementation/RELEASE_CHECKLIST.md), and [`docs/implementation/TEST_MATRIX.md`](implementation/TEST_MATRIX.md).

Verification evidence from the baseline and the 2026-10-10 hardening run:

| Check | Status | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | No lint errors or warnings in the final run. |
| `npm run typecheck` | PASS | Must be run after `next build`; a concurrent build can replace `.next/types` while TypeScript is reading it. |
| `npm test` | PASS | 63 tests passed. |
| `npm run test:coverage` | PASS | Current tree: 14.21% statements/lines, 69.29% branches, 22.95% functions; broad report, not a release threshold. |
| `npm run build` | PASS | Next.js 16.4.0 Turbopack production build completed and compiled the current route inventory. |
| `npm run test:e2e:d1` | PASS | Worker artifact + local D1 migrations/bootstrap; 37 passed, 1 intentional skip. |
| Playwright/viewport evidence | PASS with limitations | Protected tablet 7/7, returning kiosk 2/2, resilience 3/3, and Chromium portrait/landscape review; physical iPad/WebKit and real Wi-Fi remain. |

## Runtime

- Cloudflare Worker + D1 is the only runtime for the current handoff. The Worker requires the `DB` binding, uses the D1 adapter and explicit D1 batches/guards, and uses its custom Web Crypto/HS256 auth boundary; unported/fault-sensitive D1 paths remain release-gated.

## Open issues

- Physical iPad and real-network behavior remain unverified after the standalone PWA switch; WebKit emulation now passes locally.
- A future restricted shell may not bind/probe a local web server; use the in-app browser or a Worker-compatible local process for runtime checks.
- `POST /api/jobs/closing` requires `CRON_SECRET` or an admin session in every runtime.
- `scripts/trigger-closing.sh` fails when `CRON_SECRET` is missing.
- The D1 E2E gate now fails if Worker request-cancellation or cross-request I/O signatures appear. The request-context fix and Dashboard snapshot changes are covered by the latest 31-pass local gate; deployed latency/capacity evidence remains a separate release gate.
- The workspace still has no in-tree `.git` directory; this snapshot is tracked through the attached external Git metadata at `/private/tmp/wellness-salon-git`, with the `origin` remote configured for `nhan0805/wellness-salon`. Push/deploy is now working through the verified commit and GitHub Actions production checks.

## Technical debt

- Complete physical iPad, distance readability, Dynamic Type/VoiceOver, real Wi-Fi, offline submission, and modal interaction review. WebKit emulation is covered by the combined local gate.
- Measure deployed Worker/D1 quota/CPU/latency, lease-wait, network, and representative-history behavior; local D1 export/restore rollback is rehearsed, while protected remote backup remains operator-gated.
- Expand remaining scenario coverage listed in `docs/implementation/TEST_MATRIX.md`, especially repeated staff actions, session revalidation, stale board versions, and closing/retention paths.
- Add dedicated DB/E2E coverage for the follow-up category, payment-history, refund, and turn-history paths before treating them as release-gated evidence.
- Configure scheduler observability/retry/alerting in the Cloudflare account; the repository runbook and read-only smoke are now in place.
- Add retention/cleanup policy execution and operator runbook details for expired `VerifiedStaffSession` and old `CommandReceipt` records.

## Next recommended task

1. Execute the physical tablet/WebKit and real-network run sheet in `docs/implementation/TABLET_QA_PLAN.md`, including removing/re-adding the standalone PWA icon.
2. Run `npm run test:e2e:d1` in the target CI environment and then complete the physical iPad/WebKit and real-network run sheet.
3. Only after those checks pass, take the production TLS, secret, scheduler, and deploy approvals described in `docs/lifecycle/approvals/README.md`.
