# Architecture

Last updated: 2026-10-28

## System overview

Nail Shop Management is a Next.js App Router application with three operator surfaces:

```text
Customer kiosk ──POST check-in──> Turn engine ──> Staff board
                                      │              │
                                      │ finish       │ staff actions
                                      v              v
                               PAYMENT_PENDING   attendance/audit
                                      │
                               Admin confirmation
                                      │
                                      v
                          COMPLETED + Daily report
```

The Cloudflare Worker route handlers use the D1 adapter through the `DB` binding. Pure business rules stay in `src/domain` so they can be tested independently from persistence, while every request reads and writes durable D1 state.

## Technology stack

- Next.js 16.4 App Router, React 19, TypeScript strict, Turbopack build.
- Auth.js Credentials with JWT sessions and role claims (`ADMIN`, `STATION`).
- Cloudflare Workers + D1 with Prisma's D1 adapter and fresh SQL migrations (canonical runtime).
- PBKDF2/HS256 for Worker-compatible sessions and credential verification.
- Zod request validation.
- SSE for board events with client polling fallback.
- Vitest for database-independent unit/contract logic and Playwright for Worker/D1 desktop/tablet E2E.

## Folder structure

```text
app/                         Next routes, layouts, UI pages, and Route Handlers
app/api/                     HTTP API boundary
src/domain/                  Pure types, routing, state machines, reconciliation
src/server/                  Prisma, auth, security and database services
src/server/services/         Database turn/check-in/payment/report/admin operations
prisma/d1/                   SQLite/D1 schema and migration history
tests/unit/                  Pure domain and adapter contract tests
tests/integration/           Database-boundary and contract tests
tests/e2e/                    Worker/D1 kiosk, authorization, resilience, and responsive Playwright tests
docs/lifecycle/              Product/requirements/architecture/test artifacts
docs/runbook/                Local and operational procedures
```

## Runtime and persistence

The Worker runtime owns durable D1 state through the `DB` binding; Worker auth uses the Web Crypto PBKDF2/HS256 boundary, and D1 mutations use guarded batches, uniqueness, audit events, and command receipts. A missing D1 binding is a startup/health failure; the application never replaces durable state with process-local records.

## Major modules

- `src/domain/turn-routing.ts`: eligibility, fairness, assignment, and skip rerouting.
- `src/domain/state-machines.ts`: valid appointment, turn, and attendance transitions.
- `src/domain/reconciliation.ts`: card + cash reconciliation and labels.
- `src/domain/concurrency.ts`: in-memory serialization used by logic tests.
- `src/server/services/prisma-operations.ts`: transactional database implementation for catalog, board, check-in, payments, payment history/corrections/refunds, reports, closing, turn-event history, and staff actions.
- `src/server/services/admin-operations.ts`: D1-backed reads/writes for attendance, customers, staff, skills, service categories/services, and auth accounts, including audit events and safe lifecycle rules.
- `src/components/admin-management.tsx`: responsive admin tables/forms for attendance, customer CRUD/history, staff lifecycle, and category-aware service catalog lifecycle.
- `src/components/admin-access.tsx`: responsive admin tables/forms for skill definitions and ADMIN/STATION account lifecycle.
- `src/server/services/turn-engine.ts`: shared staff selection and D1 mutation helpers.
- `src/server/auth.ts`: Worker-compatible PBKDF2/HS256 role/session boundary.
- `src/server/security.ts`: PBKDF2 verification, process-local fast-path protection, and D1-backed failed-PIN lockout.
- `src/server/request-security.ts`: trusted-origin validation and JSON errors.
- `proxy.ts`: CSP and browser security headers.

## HTTP and event APIs

| Method | Path | Purpose | Authorization |
| --- | --- | --- | --- |
| GET | `/api/health` | Liveness/readiness-style health; checks the active D1 binding in the Worker. | Public |
| POST | `/api/kiosk/check-in` | Validate service/name/phone, upsert customer, assign or wait, return ticket. | Public browser/cron-compatible origin rule |
| GET | `/api/board` | Return all current turns, up-next queue, and staff roster from D1 for the public read-only board. | Public |
| POST | `/api/board` | Staff actions: accept/skip/finish/check-in/check-out/add-support. Accept moves the assigned service directly into service; there is no separate Start action. | `STATION` or `ADMIN` |
| GET | `/api/sse/board` | Initial D1 board snapshot and keepalives for the public read-only board. | Public |
| GET | `/api/admin/appointments` | Appointments for the requested business date (`?date=YYYY-MM-DD`), defaulting to the current business date. | `ADMIN` |
| GET | `/api/admin/reports` | Revenue, payment split, service/staff attribution, reconciliation for the requested business date (`?date=YYYY-MM-DD`), defaulting to the current business date. | `ADMIN` |
| POST | `/api/admin/payments/confirm` | Record CARD/CASH payment, final amount, optional tip/cash details, and complete the appointment after the external terminal action. Initial confirmation has no `adjustmentReason` field. | `ADMIN` |
| GET/POST | `/api/admin/attendance` | Read daily attendance or perform admin check-in/check-out. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/customers` | Read, create, update, or safely delete customer profiles. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/staff` | Read, create, update, deactivate, or reactivate staff and skills. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/services` | Read, create, update, archive, or reactivate service catalog entries. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/service-categories` | Read, create, update, or archive service categories; active services must move before a category can be archived. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/skills` | Read, create, rename, or safely delete skill definitions. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/accounts` | Read, create, update, reset password, activate/deactivate, or safely delete Auth.js accounts. | `ADMIN` |
| GET | `/api/admin/appointments/[id]/turn-history` | Return the append-only turn-event history for one appointment. | `ADMIN` |
| GET | `/api/admin/customers/[id]/history` | Return filtered customer visit/payment history and summary totals. | `ADMIN` |
| GET | `/api/admin/payments/[appointmentId]/history` | Return the payment state and audited payment event history. | `ADMIN` |
| POST | `/api/admin/payments/adjust` | Adjust amount, method, tip, or cash details with reason, idempotency, and audit metadata. | `ADMIN` |
| POST | `/api/admin/payments/correct` | Correct method/tip bookkeeping without deleting the original audit trail. | `ADMIN` |
| POST | `/api/admin/payments/refund` | Record a full/partial refund against a confirmed payment with reason and audit metadata. | `ADMIN` |
| POST | `/api/admin/appointments/cancel` | Cancel a service or visit with scope, reason, idempotency, and audited capacity release/reroute. | `ADMIN` |
| POST | `/api/admin/appointments/reassign` | Reassign an active/waiting service with reason and audited idempotency. | `ADMIN` |
| POST | `/api/admin/appointments/change-service` | Preview/apply an active service change with snapshot and skill revalidation. | `ADMIN` |
| POST | `/api/admin/appointments/override-exclusion` | Override an exact-service skip exclusion with an explicit reason and audit event. | `ADMIN` |
| POST | `/api/admin/queue/reconcile` | Explicitly repair waiting/assignment state; reads never perform hidden writes. | `ADMIN` |
| GET/POST/PATCH/DELETE | `/api/admin/skip-reasons` | Read and manage active skip-reason master data. | `ADMIN` |
| GET/POST | `/api/admin/config` | Read/update authoritative shop timezone, hours, currency, routing and session configuration. | `ADMIN` |
| POST | `/api/jobs/closing` | Automatically close open attendance. | `CRON_SECRET` or `ADMIN` |
| POST | `/api/jobs/retention` | Remove expired operational receipts/sessions under protected retention policy. | `CRON_SECRET` or `ADMIN` |
| GET/POST | `/api/auth/[...nextauth]` | Auth.js credentials/session handler. | Auth.js |

When a request includes an `Origin`, mutations accept the request origin/configured `NEXTAUTH_URL` or equivalent local host/port in development. Requests without an `Origin` are allowed to support server-side cron calls; production scheduler access therefore depends on `CRON_SECRET`. `ShopConfig` is authoritative for business timezone, opening/closing, currency, routing mode, and session TTL; environment values are bootstrap fallbacks.

The board client opens the public SSE stream and polls `GET /api/board` every 15 seconds. SSE currently provides the initial snapshot and keepalives; the polling path detects database changes such as a new kiosk check-in without reloading the page. The board UI separates queue operations and staff attendance into tabs; attendance uses prominent labeled actions while preserving the same protected PIN flow. Each `Up next` card renders the appointment's full ordered `AppointmentService` bundle, including completed/next/queued progress and combined duration; routing still advances one service at a time.

## Domain and state model

```text
Appointment: CREATED -> WAITING -> ASSIGNED -> IN_SERVICE -> PAYMENT_PENDING -> COMPLETED
                         \______________________________/  (skip/reroute can return to WAITING)

Turn:       ASSIGNED --Accept--> ACCEPTED (in service) -> FINISHED
                         \-> SKIPPED

Attendance: ABSENT -> PRESENT -> CHECKED_OUT
```

Supporting staff is attached to an appointment and does not create a second payment. SKIP ends the turn record, preserves the appointment, and routes it to another eligible staff member when possible.

## Database model

- Catalog: `ServiceCategory`, `Service`, `ServiceSkill`, `ShopConfig`. Categories are ordered, archivable catalog presentation data; they do not affect routing. A service has one category, an icon, and one or more required skills, and routing only considers staff who have all of them. The kiosk groups active services by category, then creates an ordered appointment bundle.
- People/auth: `Staff`, `StaffSkill`, `AuthUser`, `Customer`.
- Operations: `Appointment` with immutable customer-name, service, amount, and currency snapshots, ordered `AppointmentService` bundle, `Turn`, append-only `TurnEvent` history, `AppointmentSupportingStaff`, `Attendance`, `StaffServiceState`.
- Money/audit/idempotency: `Payment`, `PaymentItem`, `AuditEvent`, `CommandReceipt`. Payment adjustments, corrections, and refunds update the current payment state only through admin commands and retain previous/current details in audit events; no card data or gateway transaction is stored.
- Session bridge: `VerifiedStaffSession` maps a station user to a short-lived verified staff PIN session.

Important constraints:

- Unique customer phone, appointment code within a business date, payment per appointment, attendance per staff/business date, staff-skill pair, service-skill pair, supporting-staff pair, and command receipt `(scope,key)`.
- Foreign keys protect catalog/operation relationships; completed payment is not deleted by appointment cascade.
- Business date is stored as D1-compatible text in the Worker schema; timezone and closing time are configured in `ShopConfig`.

## Concurrency and idempotency

The D1 path starts assignment/check-in and other shop mutations with conditional updates, an application lease row, idempotency receipts, and `D1Database.batch()` boundaries. Database uniqueness and command receipts provide the second line of defense. Receipts store a request hash, replay the original response for the same key/payload, and reject a reused key with different details. Board mutations increment a monotonic `ShopConfig.stateVersion`; clients ignore stale versions and recover through bounded polling/reconnect. The lease key must include tenant identity if the system becomes multi-tenant.

## Operational hardening

- Board reads and SSE snapshots are side-effect free. Assignment repair is an explicit manager command or a safe mutation boundary, so refresh storms cannot create hidden writes.
- Appointment history uses server-side filters, deterministic ordering, bounded 25-row pages, summary aggregates, and a lean response projection rather than loading the full history into the browser.
- Admin appointment actions use a compact menu for payment/history/change/reassign/override/cancel operations; turn history stores actor and assigned-staff snapshots so later staff/account changes do not erase operational context.
- The service catalog supports category CRUD/archive, category filtering on Admin, category grouping on the kiosk, and searchable service-icon selection. Static timezone/currency option lists keep configuration labels deterministic across server and browser renders.
- Payment history is audit-backed rather than a separate adjustment table: current payment values remain queryable for reports, while adjustment/correction/refund events retain reason, actor, and previous/current or refunded amounts.
- Payment confirmation uses the shared `AmountKeypad` for final amount, card/cash tip, and cash received; the keypad expands on focus/click and is collapsed by default. Initial confirmation keeps the original amount in the audit metadata for traceability but does not require a reason; later adjustment/correction/refund commands remain reasoned and audited.
- Critical APIs emit request IDs and structured completion timings; rejected commands, board snapshot version/time, and closing/retention outcomes are available for deployment logging.
- Closing and retention are protected job endpoints. The Worker scheduled handler evaluates the configured quarter-hour tick, passes the correct closing business date, and runs colliding jobs sequentially because both use the shop-wide D1 lease. Deployment operators still own cron enablement, retries, alerting, and secret rotation.

## Security design

- Passwords and staff PINs use Worker-compatible PBKDF2 hashes.
- Auth.js session cookie is httpOnly, strict same-site, and secure in production unless explicitly disabled for local development.
- Five failed PIN attempts temporarily lock that staff ID for 60 seconds. A process-local fast path protects the current instance and a `StaffPinLockout` row makes the lockout durable across restarts/processes.
- Staff mutations require a four-digit PIN or an unexpired verified session; admin payment confirmation requires an admin role.
- The public board read endpoints intentionally expose operational turn codes, redacted guest labels, service details, and staff availability needed for the floor display; customer phone numbers and names stay hidden, while mutations remain protected by station/admin auth and staff verification.
- Admin management mutations require an admin role, validate all body fields with Zod, enforce trusted origins, and append audit events. Staff initials are derived server-side from the staff name; customer records with appointment history are not hard-deleted; skills in use cannot be deleted; staff and services are deactivated/archived; and the last active admin/current admin session cannot be removed from admin access.
- `proxy.ts` sets CSP, frame/content/referrer/permissions headers and HSTS in production.
- JSON request bodies are bounded before validation; forwarded host/protocol/IP headers are trusted only when the build-time `TRUST_PROXY_HEADERS=true` setting is explicitly enabled by a rewriting ingress (Cloudflare's `CF-Connecting-IP` remains the canonical edge address). The CSP does not allow `unsafe-eval`.
- Secrets are environment variables and must be rotated through the deployment secret store.

## Deployment architecture

```text
Browser/tablet
      |
Cloudflare Worker (canonical) ---> D1
```

The Worker artifact is built by vinext and verified through `npm run test:e2e:d1`. The current workers.dev deployment is the supervised Worker target; domain changes, merchant terminals, remote migration/reset, traffic cutover, and rollback remain approval gates.

## Environment configuration

See `.env.example`, `wrangler.local.jsonc`, and `wrangler.production.jsonc`.

| Variable | Meaning | Local default |
| --- | --- | --- |
| `AUTH_SECRET` | Worker session signing secret. | Placeholder only |
| `AUTH_COOKIE_SECURE` | Explicit secure-cookie override. | `false` locally |
| `AUTH_TRUST_HOST` | Auth.js trusted-host setting. | `true` |
| `NEXTAUTH_URL` | Canonical local/configured origin. | `http://127.0.0.1:3001` |
| `TRUST_PROXY_HEADERS` | Opt-in trust for ingress-rewritten `X-Forwarded-Host`/`X-Forwarded-Proto` during origin checks. | `false` |
| `SHOP_TIMEZONE` | Bootstrap fallback only when `ShopConfig` has not been seeded. | `Asia/Ho_Chi_Minh` |
| `CRON_SECRET` | Required scheduler authorization for closing and retention jobs. | Set through `.env` |

## Coding standards

- Follow `AGENTS.md` and the installed Next.js documentation before changing framework code.
- Keep business rules in pure domain modules; keep persistence/auth concerns in `src/server`.
- Validate external input with Zod and enforce authorization at route boundaries.
- Use guarded D1 batches/leases for related state changes and append an `AuditEvent` for meaningful business transitions.
- Preserve idempotency keys for retried kiosk/staff/payment commands.
- Add or update unit/integration/E2E coverage with behavior changes and update the project-memory docs in the same task.
