# Architecture decisions

Last updated: 2026-10-08

Historical decisions are retained here. The original lifecycle ADR remains in `docs/lifecycle/ADR-001-advisory-lock.md`.

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
- Status: Accepted for V1
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
- Consequences: nginx must disable buffering for the SSE path; clients should tolerate duplicate/stale snapshots. The board client polls every 3 seconds because the current SSE stream sends snapshots and keepalives rather than database change events.

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

## ADR-011 — Keep service catalog category-free

- ID: ADR-011
- Date: 2026-10-08
- Status: Accepted for V1
- Context: Service category added a management field without affecting assignment, pricing, duration, or kiosk check-in behavior.
- Decision: Remove category from the `Service` model and all service API/UI contracts. Services are identified by their name, duration, price, and required skill; the kiosk uses a shared treatment presentation instead of category-specific rendering.
- Alternatives considered: Keep category as an optional enum; infer categories from service names; retain the field only for reporting.
- Reason: Reduces data duplication and keeps the service form focused on fields that affect operations.
- Tradeoffs: Category-based filtering and category-specific icons are not available in V1; a future taxonomy would require a new explicit product decision and migration.
- Consequences: The forward migration drops the legacy `services.category` column and `ServiceCategory` enum, and all new service writes omit category.

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
