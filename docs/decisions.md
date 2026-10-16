# Architecture decisions

Last updated: 2026-10-14

Historical decisions are retained here. The original lifecycle ADR remains in `docs/lifecycle/ADR-001-advisory-lock.md`.
The implementation-specific BR-01 through BR-06 rules and hardening choices are detailed in [`docs/implementation/DECISIONS.md`](implementation/DECISIONS.md).

## Current runtime decision

The repository now contains only the Cloudflare Worker + local D1 (SQLite) runtime. The server-database schema/migrations, local container stack, native server database dependencies, and their test/benchmark entrypoints were removed from the active tree. Historical ADRs below describe earlier implementation phases and are not current setup instructions.

## ADR-001 — Transaction-scoped advisory lock

- ID: ADR-001
- Date: 2026-10-07
- Status: Accepted
- Context: A row lock cannot protect a candidate that has not been inserted yet; concurrent kiosk requests could otherwise claim one available staff member twice.
- Decision: Serialize shop/business-date routing with `pg_advisory_xact_lock(hashtextextended(shopKey + businessDate, 0))` inside the same transaction that reads candidates and writes the turn.
- Alternatives considered: `SELECT ... FOR UPDATE` on existing staff rows; application-only mutex; distributed lock service.
- Reason: Transaction scope matches the mutation boundary, works across app instances, and avoids a lock-row lifecycle.
- Tradeoffs: PostgreSQL-specific; lock key must gain tenant identity for multi-tenant support; long transactions reduce throughput.
- Consequences: Database routing is serialized per shop/date, while uniqueness and idempotency remain required defense layers.

## ADR-002 — PostgreSQL is the sole application runtime

- ID: ADR-002
- Date: 2026-10-08
- Status: Superseded by ADR-026 for the current runtime/test target; retained as historical V1 context
- Context: Operational screens, authentication and reports must behave consistently with the deployed system.
- Decision: Require `DATABASE_URL` for every application runtime. Prisma/PostgreSQL is the only persistence path; tests that need durable behavior use an isolated PostgreSQL database.
- Alternatives considered: Keep a process-local adapter; mock individual APIs in browser tests; use SQLite.
- Reason: One persistence path prevents stale synthetic figures, bypassed authorization and behavior drift between local and production.
- Tradeoffs: Developers and E2E environments must provision PostgreSQL before starting the app.
- Consequences: Missing database configuration is a startup/health failure and the UI shows database-backed loading/error states.

## ADR-003 — Auth.js roles plus short-lived verified staff session

- ID: ADR-003
- Date: 2026-10-07
- Status: Accepted for V1
- Context: Station devices need role authorization, but staff should not repeat a full station login for every board action.
- Decision: Use Auth.js Credentials for `ADMIN`/`STATION`, then issue a short-lived, httpOnly verified staff-session cookie after a valid staff PIN. Later actions may use that session until expiry.
- Alternatives considered: Staff email/password for every action; a long-lived staff cookie; no server-side role boundary.
- Reason: Separates station authorization from staff identity verification and limits PIN reuse exposure.
- Tradeoffs: Session cleanup/retention is still needed.
- Consequences: Board POST must validate either a fresh PIN or a valid station/staff session.

## ADR-004 — Payment confirmation is an admin-side record, not card processing

- ID: ADR-004
- Date: 2026-10-07
- Status: Accepted for V1
- Context: The shop needs an accurate completed transaction without bringing card data or gateway scope into V1.
- Decision: An admin chooses CARD or CASH only after the merchant terminal has completed; the app writes one `Payment` and transitions the appointment to `COMPLETED`.
- Alternatives considered: Integrate a payment gateway; let staff mark paid; accept a payment before service completion.
- Reason: Keeps PCI/card handling outside the app and aligns payment state with an operational human confirmation.
- Tradeoffs: Payment correctness depends on the merchant terminal and admin discipline; no automatic terminal reconciliation.
- Consequences: `Payment.appointmentId` is unique, reports derive from confirmed payments, and gateway integration remains out of scope.

## ADR-005 — SSE with polling fallback for the board

- ID: ADR-005
- Date: 2026-10-07
- Status: Accepted
- Context: Staff need near-real-time queue updates, but a persistent stream may be unavailable behind some proxies.
- Decision: Expose `/api/sse/board` with an initial PostgreSQL snapshot, keepalives, and `X-Accel-Buffering: no`; the client also polls at a short interval as fallback.
- Alternatives considered: Polling only; WebSockets; third-party realtime service.
- Reason: SSE is simple for server-to-client events and fits the one-way board update pattern; polling preserves resilience.
- Tradeoffs: Two update paths must stay consistent; database mode currently emits snapshots/keepalives rather than a full database event bus.
- Consequences: nginx must disable buffering for the SSE path; clients should tolerate duplicate/stale snapshots. The board client polls every 5 seconds because the current SSE stream sends snapshots and keepalives rather than database change events.

## ADR-006 — Standalone Docker runner with separate migration service

- ID: ADR-006
- Date: 2026-10-07
- Status: Accepted for local/CI baseline
- Context: The runtime should not ship build tooling, should run as non-root, and must apply Prisma migrations before the app starts.
- Decision: Build Next standalone output in a multi-stage Dockerfile, prune dev/optional packages for the runner, run migrations/seeding in a Compose `migrate` service, and expose `/api/health` for healthchecks.
- Alternatives considered: Run `prisma migrate` in the app entrypoint; ship the full node_modules tree; use a single image/process.
- Reason: Separates build/migration concerns and makes startup ordering explicit.
- Tradeoffs: Image/build setup is more complex; Compose environment changes require container recreation, not only restart.
- Consequences: Production deployments need a safe migration/rollback policy and a human gate for destructive migrations.

## ADR-007 — Command receipts and database uniqueness for idempotency

- ID: ADR-007
- Date: 2026-10-07
- Status: Accepted
- Context: Kiosk retries, double clicks, payment retries, and staff actions can repeat after a network timeout.
- Decision: Accept idempotency keys at mutation boundaries, store responses in `CommandReceipt` under unique `(scope,key)`, and keep domain uniqueness constraints for payments, attendance, customers, and relationships.
- Alternatives considered: Client-only button disabling; request deduplication cache only; no idempotency.
- Reason: Server-side durable receipts survive retries and coordinate across app instances.
- Tradeoffs: Receipt retention is required; changing the same key with a different payload is not yet explicitly rejected.
- Consequences: New mutating commands should define a stable scope, key, and replay response before implementation.

## ADR-008 — Documentation is part of the deliverable

- ID: ADR-008
- Date: 2026-10-08
- Status: Accepted
- Context: Future agents must continue work without relying on chat history.
- Decision: Keep project state, requirements, architecture, tasks, decisions, changelog, and handoff in the repository and update them with meaningful code/architecture/bug changes.
- Alternatives considered: Rely on README only; rely on issue tracker/chat history; document only after releases.
- Reason: The repository is the durable source of truth available to every future agent.
- Tradeoffs: Documentation adds maintenance work and can become stale if not updated in the same task.
- Consequences: A task is incomplete until code, tests, and applicable project-memory files are synchronized.

## ADR-009 — Safe lifecycle rules for admin records

- ID: ADR-009
- Date: 2026-10-08
- Status: Accepted for V1
- Context: Admin needs to correct customer data and maintain the staff/service catalog without breaking historical appointments, payments, or reports.
- Decision: Customer profiles can be hard-deleted only when they have no appointment history. Staff and services use deactivate/archive flags, and deactivating staff closes any open attendance record for the current business date with `closedBy=ADMIN`.
- Alternatives considered: Allow unrestricted deletes; cascade historical appointments; add a separate archive table.
- Reason: Preserves operational history and keeps the existing relational model small while making lifecycle actions explicit in both adapters.
- Tradeoffs: Deleted customers cannot be recovered from the app; reactivation remains available for staff/services but not for customers.
- Consequences: Admin APIs must expose lifecycle state, UI labels must distinguish inactive/archived records, and tests must cover safe deletion/deactivation behavior.

## ADR-010 — Safe management of skills and authentication accounts

- ID: ADR-010
- Date: 2026-10-08
- Status: Accepted for V1
- Context: Admin needs to maintain the routing skill catalog and the credentials used by admin/station surfaces without breaking active assignments or locking out the workspace.
- Decision: Skills may be created or renamed, but a skill referenced by staff or services cannot be deleted. Auth accounts may be created, edited, password-reset, activated, deactivated, or hard-deleted only after confirmation; passwords remain Argon2id hashes, the current admin session cannot demote/deactivate/delete itself, and the last active admin cannot be removed. Deleting an account preserves payment rows, clears the optional payment-to-account reference through the existing database relation, and records the deleted email/role/payment count in the audit event.
- Alternatives considered: Hard-delete referenced skills; cascade-delete payment history; permit the last-admin lockout; expose password hashes or plaintext values.
- Reason: Allows intentional account cleanup without destroying financial records, preserves an administrative recovery path, and keeps credentials out of the UI and audit metadata.
- Tradeoffs: Account deletion is irreversible and historical payments no longer point to a live account after deletion; the audit event preserves the deleted account identity and count for operational traceability.
- Consequences: The Skills and Accounts modules must surface usage/status context and mutations must be transactionally audited.

## ADR-011 — Keep service catalog category-free (superseded)

- ID: ADR-011
- Date: 2026-10-08
- Status: Superseded by ADR-019 on 2026-10-11
- Context: Service category added a management field without affecting assignment, pricing, duration, or kiosk check-in behavior.
- Decision: Remove category from the `Service` model and all service API/UI contracts. Services are identified by their name, duration, price, and required skill; the kiosk uses a shared treatment presentation instead of category-specific rendering.
- Alternatives considered: Keep category as an optional enum; infer categories from service names; retain the field only for reporting.
- Reason: Reduces data duplication and keeps the service form focused on fields that affect operations.
- Tradeoffs: Category-based filtering and category-specific icons are not available in V1; a future taxonomy would require a new explicit product decision and migration.
- Consequences: The 2026-10-08 forward migration remains in history, but the later category migration restores a normalized `ServiceCategory` model; current service writes require `categoryId`.

## ADR-012 — Public read-only turn board

- ID: ADR-012
- Date: 2026-10-08
- Status: Accepted for V1
- Context: The turn board is intended to run as a shared floor display, so requiring a full station login just to see the queue adds unnecessary friction.
- Decision: Allow unauthenticated reads of `/board`, `GET /api/board`, and `GET /api/sse/board`. Keep all board mutations behind `STATION`/`ADMIN` authentication and short-lived staff PIN verification.
- Alternatives considered: Keep the entire board behind station login; create a separate display-only route; expose mutations to any viewer.
- Reason: Reuses the existing live board UI for a display while preserving the authorization boundary around operational actions.
- Tradeoffs: Operational turn codes, redacted guest labels, service details, and staff availability are visible to anyone with the board URL; private customer names/phone numbers and mutation controls remain protected.
- Consequences: The public board shows a Staff sign in link and hides action controls until a valid role session is present; the API and SSE tests must cover both public reads and protected writes.

## ADR-013 — Services use all-skill eligibility

- ID: ADR-013
- Date: 2026-10-08
- Status: Accepted for V1
- Context: Some treatments require a combination of capabilities, so a service cannot always be represented by one routing skill.
- Decision: Model service-to-skill requirements as an explicit `ServiceSkill` join table. Admins may select one or more skills for a service; a staff member is eligible only when they are active, checked in, available, and have every selected skill. Existing fairness ordering runs after these eligibility filters.
- Alternatives considered: Keep one required skill; treat selected skills as an OR match; duplicate services for each skill combination.
- Reason: The join table represents the domain directly, supports future catalog growth, and prevents assigning a treatment to a specialist missing one of its required capabilities.
- Tradeoffs: Service forms and seed/migration logic must manage a relationship collection; changing requirements affects future routing while existing turns remain assigned.
- Consequences: The old `services.required_skill_id` column is migrated into `service_skills`, service CRUD validates at least one skill, and routing tests must cover the all-skills rule.

## ADR-014 — Accept enters service without a separate Start action

- ID: ADR-014
- Date: 2026-10-10
- Status: Accepted for V1
- Context: The tablet workflow previously exposed a separate Start step even though the floor workflow treats accepting an assigned turn as beginning service. The extra step increased taps and left room for a turn to remain accepted but not actionable.
- Decision: Remove `START` from the staff-facing board action contract. `ACCEPT` transitions the assigned turn to `ACCEPTED` and the appointment/service directly to `IN_SERVICE`; `FINISH` completes it. Remove legacy `STARTED` turn rows and the enum value from the database.
- Alternatives considered: Keep the separate Start button; retain `STARTED` indefinitely; map old `STARTED` rows to the active `ACCEPTED` state.
- Reason: Reduces operational taps and removes the obsolete persisted state after cleaning the legacy records from the local database.
- Tradeoffs: Historical appointments containing the deprecated `STARTED` state are intentionally removed by the migration; customer profiles and audit logs remain.
- Consequences: Board UI/API validation reject `START`; state-machine tests cover `ASSIGNED -> ACCEPTED -> FINISHED`; current assignments remain protected by staff ownership checks.

## ADR-015 — Board reads remain side-effect free

- ID: ADR-015
- Date: 2026-10-10
- Status: Accepted for V1
- Context: Reconciliation during every GET/SSE refresh can turn a normal tablet refresh storm into a write storm and can reassign work without an explicit operator action.
- Decision: Board GET/SSE reads only return a snapshot. Assignment repair runs at safe mutation boundaries and through the explicit manager-only `/api/admin/queue/reconcile` command.
- Alternatives considered: Reconcile on every board read; reconcile in a background worker; remove repair capability entirely.
- Reason: Keeps read paths predictable while preserving a visible recovery action for operational drift.
- Tradeoffs: A manager must invoke repair when a stale assignment is discovered; a background event bus is still out of scope.
- Consequences: Board state uses a monotonic `ShopConfig.stateVersion`, clients ignore stale snapshots, and queue repair is audited.

## ADR-016 — Retry keys include a request hash

- ID: ADR-016
- Date: 2026-10-10
- Status: Accepted for V1
- Context: A retried mutation must replay the original response, but silently accepting a different payload under the same key could apply an unintended operation.
- Decision: Durable `CommandReceipt` records store a normalized request hash. The same scope/key/payload replays; the same key with changed details is rejected. Account/session version is revalidated server-side on protected requests.
- Alternatives considered: Client-only button disabling; replay any response regardless of payload; trust the original JWT role/status until expiry.
- Reason: Makes retry semantics explicit and prevents stale authorization or accidental key reuse from bypassing current state.
- Tradeoffs: Clients must retain a stable key for a retry and surface conflict errors clearly; receipt retention remains an operator policy.
- Consequences: Kiosk, payment, staff, cancellation, reassignment, service-change, and exclusion-override paths define stable scopes and audited receipts.

## ADR-017 — Returning kiosk lookup uses limited full-name confirmation

- ID: ADR-017
- Date: 2026-10-10
- Status: Accepted for V1
- Context: Returning guests need a low-friction check-in, but the shared kiosk must not reveal phone numbers or full customer records.
- Decision: When a normalized phone matches, the kiosk may display the stored full name read-only for confirmation. The response is limited to readiness/found/name fields, marked `no-store`, and does not return the phone or customer record.
- Alternatives considered: Always ask for the name again; reveal the full customer record; return only a boolean match.
- Reason: The approved option balances check-in speed with limited disclosure on a trusted-origin kiosk.
- Tradeoffs: Anyone with repeated phone access could attempt enumeration; rate limiting and abuse monitoring remain deployment/operator controls.
- Consequences: Returning-guest behavior is covered by a 2/2 E2E check and remains a supervised-pilot risk until kiosk abuse controls are reviewed.

## ADR-018 — Closing/retention scheduling is operator-owned

- ID: ADR-018
- Date: 2026-10-10
- Status: Deferred for V1 deployment
- Context: Closing and retention endpoints are implemented, but adding an internal scheduler would couple application lifecycle, retries, alerting, and secret rotation to the MVP runtime.
- Decision: Keep `/api/jobs/closing` and `/api/jobs/retention` protected by admin session or `CRON_SECRET`; deployment operators own external scheduling, retry policy, monitoring, and approval.
- Alternatives considered: In-process timer; Compose cron container; silently assume a platform scheduler.
- Reason: Keeps job execution explicit and avoids a false production-readiness claim before deployment infrastructure is approved.
- Tradeoffs: The app does not self-schedule; unattended operation is blocked until an external schedule and alerting are configured.
- Consequences: Scheduler setup is a release gate, not an application feature, and the local runbook must document the secret boundary.

## ADR-019 — Restore service categories as presentation taxonomy

- ID: ADR-019
- Date: 2026-10-11
- Status: Accepted for the current V1 catalog
- Context: The category-free interim model made the kiosk catalog harder to scan and removed the admin's ability to organize a growing service list. The existing migration history already contains a category-removal step, so restoring the concept must be explicit and forward-only.
- Decision: Use a normalized `ServiceCategory` table with stable slug, display order, and active/archive state. Every service belongs to one category; categories affect catalog filtering/grouping only, never routing eligibility, pricing, or appointment state. Archive is blocked while active services still reference the category.
- Alternatives considered: Keep the catalog flat; use a free-text category; infer categories from service names at render time.
- Reason: Stable relational data supports admin CRUD, kiosk grouping, deterministic seed data, and future reporting without coupling taxonomy to turn routing.
- Tradeoffs: Category migration/backfill and service forms now require category data; the earlier category-free ADR remains a historical migration step, not the current contract.
- Consequences: `20261010200000_service_categories` and `20261010201000_refine_service_category_backfill` restore/backfill the model, and `/api/admin/service-categories` owns its audited lifecycle.

## ADR-020 — Payment corrections and refunds are audited administrative records

- ID: ADR-020
- Date: 2026-10-11
- Status: Accepted for supervised pilot
- Context: Staff may enter the wrong amount, payment method, tip, cash received, or refund amount after an external terminal action. Deleting or silently overwriting the payment would break reconciliation and operator trust.
- Decision: Keep one current `Payment` row per appointment, expose admin-only adjustment/correction/refund commands, and append `AuditEvent` records containing actor, reason, and previous/current or refunded details. Stable command receipts make retries safe; a refund records an external merchant action and does not call a gateway.
- Alternatives considered: Delete and recreate the payment; add an unaudited overwrite endpoint; integrate a merchant gateway in V1.
- Reason: Preserves reportability and keeps terminal/card-data responsibility outside this app while providing a practical correction trail.
- Tradeoffs: Reports use the current payment state plus refund history; operators must reconcile the external terminal separately and still need a production retention policy.
- Consequences: Payment history is available at `/api/admin/payments/[appointmentId]/history`; `adjust`, `correct`, and `refund` routes are protected by admin role, trusted origin, validation, and audit boundaries.

## ADR-021 — Persist an append-only turn-event ledger

- ID: ADR-021
- Date: 2026-10-11
- Status: Accepted for supervised pilot
- Context: Current turn rows show state but do not explain reassignment, same-specialist continuation, support participation, skip reasons, or who acted after staff/account records change.
- Decision: Persist `TurnEvent` rows for assignment, accept, skip, finish, cancellation, reassignment, continuation, support add/release, and waiting states. Store actor and assigned-staff display snapshots, reason, and timestamp; seed legacy turns with historical system events during migration.
- Alternatives considered: Derive history from mutable turn rows; rely only on generic audit metadata; store a client-side activity log.
- Reason: A relational, queryable ledger makes the appointment history useful for operations and preserves context when referenced records are later renamed or deactivated.
- Tradeoffs: Each mutation writes an additional event and retention must eventually cover turn events; the current UI/API is admin-only.
- Consequences: `/api/admin/appointments/[id]/turn-history` and the Admin history modal expose the ledger without making board reads writeful.

## ADR-022 — Use static locale option data for configuration controls

- ID: ADR-022
- Date: 2026-10-11
- Status: Accepted for V1
- Context: Generating timezone/currency options differently on server and browser can cause hydration drift, while operators still need a broad valid choice set.
- Decision: Keep a checked-in IANA timezone and CLDR-style currency option list in `src/domain/locale-options.ts`; validate configured values server-side and preserve an unknown current value in the UI rather than dropping it.
- Alternatives considered: Generate options with runtime `Intl` on each render; expose unrestricted text inputs; support only the default locale.
- Reason: Deterministic labels and validation are more important than runtime-generated completeness for this tablet admin surface.
- Consequences: Locale option data must be refreshed deliberately when the supported runtime/CLDR dataset changes.

## ADR-023 — Restore standalone PWA mode without adding login guidance copy

- ID: ADR-023
- Date: 2026-10-12
- Status: Accepted for supervised iPad testing
- Context: The previous browser-display mode made the Home Screen shortcut open with browser chrome, while iPadOS 15-era WebKit can hide the software keyboard in installed web apps during credential entry.
- Decision: Keep the manifest and service worker PWA assets, set the manifest to `display: standalone`, emit Apple web-app capability/title/status metadata, and keep the login form visible in standalone mode without an extra PWA instruction banner.
- Alternatives considered: Keep `display: browser`; force every PWA login into Safari; expose seed credentials in the client to bypass typing.
- Reason: The app should be testable as an installed iPad app without weakening credential handling, hiding the primary login flow, or adding environment-specific copy to the production-facing screen.
- Tradeoffs: Existing Home Screen installs must be removed and re-added to refresh cached manifest metadata; physical iPad/WebKit behavior remains a manual release gate. LAN HTTP can serve the shell but is not a secure context for service-worker/offline verification.
- Consequences: Seed credentials remain in `.env` only. Do not prefill or expose passwords in production; use Safari Password AutoFill or a disposable local test account for device testing. If the old iPad keyboard issue appears, open the same route in Safari manually.

## ADR-024 — Initial payment confirmation does not collect an adjustment reason

- ID: ADR-024
- Date: 2026-10-12
- Status: Accepted
- Context: The admin confirms a payment after the external terminal action and may need to enter the final collected amount, terminal-confirmed tip, and cash details. Requiring a free-text reason in this first confirmation step adds friction without representing a separate post-confirmation correction.
- Decision: Keep `confirmPaymentSchema` limited to appointment, method, amount, tip, cash details, and idempotency. Do not expose or persist `adjustmentReason` in the initial confirm UI, service input, confirmation audit metadata, or history summary. Preserve original/current amounts for traceability; later adjustment, correction, and refund commands continue to require their own reason and audit metadata.
- Alternatives considered: Require a reason whenever the final amount differs; keep an optional unused reason field for compatibility; silently discard the UI value while accepting it server-side.
- Reason: Keeps the confirmation flow focused on recording the external collection while preserving a separate, explicit audit boundary for later financial corrections.
- Consequences: Changing the final amount during initial confirmation is allowed without an extra prompt. Clients must not send `adjustmentReason`; the post-confirmation administrative commands remain the place for reasoned corrections.

## ADR-025 — Keep the Cloudflare/D1 path additive until atomicity is proven

- ID: ADR-025
- Date: 2026-10-12
- Status: Accepted for migration safety; superseded for the current runtime/test target by ADR-026
- Context: The requested Cloudflare Free target uses Workers and D1, while the existing PostgreSQL/Prisma runtime encodes transaction-scoped advisory locks and rollback behavior that D1/Prisma does not provide.
- Decision: Preserve PostgreSQL schema/migrations as the behavioral reference and add a separate SQLite/D1 schema, migration directory, generated client, and Worker adapter path. Use a disposable local D1 state for smoke testing only. Do not create remote resources or route production traffic until critical commands are rewritten and their atomicity, idempotency, money representation, auth, and concurrency behavior are proven.
- Alternatives considered: Change the existing Prisma provider in place; replay PostgreSQL migrations against D1; deploy the current lease bridge as if it were a transaction.
- Reason: An additive boundary protects the known BR-01–BR-06 behavior and keeps rollback to the PostgreSQL reference available while D1-specific semantics are tested honestly.
- Tradeoffs: Two schemas and runtime paths must be kept synchronized during the migration; the current D1 bridge can serialize a smoke flow but cannot roll back partial writes.
- Consequences: Local D1 commands use `wrangler.local.jsonc` and `prisma/d1/migrations/0001_init.sql`. Remote Cloudflare authentication, D1 creation, secret upload, and deployment remain explicit owner gates.

## ADR-026 — Worker + D1 is the canonical runtime and test target for handoff

- ID: ADR-026
- Date: 2026-10-13
- Status: Superseded by ADR-027 for repository runtime cleanup
- Context: The deployment target is Cloudflare Workers + D1. PostgreSQL-only integration tests validate a runtime the deployed Worker no longer uses and therefore cannot be the active release gate.
- Decision: Treat the Worker `DB` binding, `prisma/d1` schema/migrations, and `npm run test:e2e:d1` as the canonical runtime/test path. Remove PostgreSQL-only suites and PostgreSQL database setup from the active CI gate. Keep the Next/PostgreSQL adapter, Docker Compose, and historical PostgreSQL evidence only for compatibility, rollback, and diagnostics.
- Alternatives considered: Keep running PostgreSQL tests as the main gate; maintain two equal release gates; delete the PostgreSQL fallback immediately.
- Reason: Tests must exercise the same persistence/runtime boundary that will be handed over, while preserving a recoverable legacy path until D1 production evidence is complete.
- Tradeoffs: D1-specific failure-injection, remote Worker, capacity, money, and physical-device evidence remain explicit open gates; the legacy path no longer receives active test-suite maintenance.
- Consequences: CI runs static tests plus the disposable local Worker/D1 E2E gate.

## ADR-027 — Worker + local D1 is the only repository runtime

- ID: ADR-027
- Date: 2026-10-14
- Status: Accepted
- Context: The application is deployed as a Cloudflare Worker backed by D1. Keeping a second local persistence/runtime stack creates unsupported behavior drift and leaves deleted tooling in the normal developer workflow.
- Decision: Remove the local PostgreSQL schema/migrations/seed path, Docker/Compose files, server-database dependencies, server-database benchmark scripts, and legacy database-backed Playwright configuration. Keep `prisma/d1`, the generated D1 client, Wrangler configs, Worker build, disposable local D1 bootstrap, and `npm run test:e2e:d1` as the only runtime/test path.
- Alternatives considered: Keep two local runtimes; keep the old path as a hidden rollback option; point local development at remote D1.
- Reason: Local behavior must match the deployed Worker boundary while protecting remote D1 from accidental test writes.
- Consequences: `npm run dev` uses the Worker-compatible local app on port 3001; missing D1 binding fails fast; production rollback uses Cloudflare Worker versions and D1 backup/restore procedures.

## ADR-028 — Bound Admin loads and preserve partial live state

- ID: ADR-028
- Date: 2026-10-15
- Status: Accepted for supervised pilot
- Context: Admin screens can otherwise leave an operator-facing spinner indefinitely when one Worker/D1 request is delayed or cancelled. Dashboard `Promise.all` also made one slow section block unrelated sections.
- Decision: Use a shared client fetch deadline (10 seconds for reads, 15 seconds for mutations), abort superseded requests, reject stale responses, expose Retry/error state, and apply Dashboard sections independently with a request-scoped snapshot, `Promise.allSettled`, and an in-flight refresh guard. Keep Attendance on a direct D1 read path for a small, predictable read.
- Alternatives considered: Increase the spinner duration without cancellation; let every screen implement its own timeout; hide the failure and silently keep retrying; make local tests use the remote D1.
- Reason: Operators get a bounded and recoverable UI failure while the underlying server latency remains visible for diagnosis. Local verification stays disposable and cannot mutate production data.
- Tradeoffs: A client timeout can report failure before a slow but valid request finishes, so idempotent mutations and Retry semantics remain important. Long-lived SSE/reconnect cancellation needs separate runtime evidence.
- Consequences: Admin loading behavior is documented in `docs/handoff.md`, and the Attendance loading-to-rendered transition is covered by `tests/e2e/admin-attendance.spec.ts`.

## ADR-029 — Keep D1/Prisma work inside the Worker request context

- ID: ADR-029
- Date: 2026-10-15
- Status: Accepted
- Context: A module-global D1 binding, Prisma client, and Promise queue allowed continuations from one Worker request to resume in another request's I/O context. Cloudflare then cancelled the request, which surfaced in the Admin UI as a 10-second timeout even with a tiny database.
- Decision: Create and disconnect the Prisma client for each operation using the current request's D1 binding. Remove the cross-request Promise queue and the `no_handle_cross_request_promise_resolution` compatibility flag. Consolidate Admin snapshot reads and keep background polling limited to live data.
- Alternatives considered: Keep the global queue and increase the client timeout; remove the compatibility flag without refactoring; add retries around the affected routes.
- Reason: Request-local I/O ownership is the only safe boundary for Cloudflare D1. Retries or longer deadlines would amplify or hide a lifecycle bug.
- Consequences: The E2E harness scans Worker output for cancellation/cross-request I/O signatures, API responses expose timing headers, and deployed latency/capacity measurement remains a separate release gate.
