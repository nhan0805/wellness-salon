# Requirements

Last updated: 2026-10-13

This file is the implementation-facing summary of the approved lifecycle artifacts in `docs/lifecycle/`.

Current handoff target: Cloudflare Worker + D1. PostgreSQL/Docker remains a legacy compatibility/rollback path and is not the active database-backed test target.

## Business objectives

- Let a walk-in customer join the queue without creating an account.
- Assign work fairly to an eligible specialist who has every skill required by the selected service.
- Give staff one shared turn board with short-lived verification instead of repeated full login prompts.
- Let an admin close a transaction only after the real merchant-terminal payment has been collected.
- Produce an end-of-day report where system revenue equals card plus cash.

## Functional requirements

| ID | Requirement | Current implementation |
| --- | --- | --- |
| FR-KSK-001 | Customer selects one or more active services, sees duration/price, enters name and phone, and receives a turn code/status. | `/kiosk`; `GET /api/services`; `POST /api/kiosk/check-in`; `createDbCheckIn` creates the ordered `AppointmentService` bundle. |
| FR-KSK-002 | Kiosk is a guest flow and can reset after completion/timeout. | No customer account is created; page state owns the journey. Reset behavior should remain covered by UI tests. |
| FR-BRD-001 | Board shows all turns currently in service, the up-next queue, present staff, and availability. Each queue card keeps the complete selected service bundle visible with per-service progress and combined duration. The read-only view is public so a floor display can open without a login, and new check-ins appear automatically within the polling window. | `/board`; public `GET /api/board`; public SSE snapshot/keepalives plus a 5-second polling refresh in the client; queue and attendance are separated into two tabs. |
| FR-BRD-002 | Staff can accept, skip with a reason, finish, check in/out, and add supporting staff. Accept moves the assigned service directly into service; there is no separate Start action. Attendance is managed from a dedicated tab with prominent labeled Check in/Check out actions. | Protected `POST /api/board`; station/admin session plus verified staff session cookie. |
| FR-ADM-001 | Admin can view queue, appointments, turn history, attendance context, pending payments, payment history, and reports. | `/admin`; appointment, turn-history, payment-history/report APIs and management modules read/write the active Worker/D1 store. |
| FR-ADM-002 | Only an admin confirms CARD/CASH after the merchant terminal, records the configured-currency final amount, optional terminal-confirmed tip, and cash details; initial confirmation does not collect an adjustment reason. An appointment has at most one current payment. Admin may later record an audited amount adjustment, bookkeeping correction, or full/partial refund without deleting history. | `POST /api/admin/payments/confirm`, `/adjust`, `/correct`, and `/refund`; the confirm schema contains amount/tip/cash fields but no `adjustmentReason`, while post-confirmation commands retain their reason requirements. `Payment.appointmentId` is unique and `AuditEvent` retains the change trail. |
| FR-ADM-003 | Reports show revenue, completed count, card/cash split, service/staff attribution, and reconciliation difference. | `GET /api/admin/reports`; `calculateReconciliation`. |
| FR-ADM-004 | Admin can create/update customers, manage staff names, skills, PINs and activation, manage service categories and service records/icons, and review/check in/out attendance. Staff initials are derived automatically from the name. | `AdminManagement`; `/api/admin/attendance`, `/api/admin/customers`, `/api/admin/staff`, `/api/admin/service-categories`, `/api/admin/services`; Zod validation, role guards, audit events, and safe lifecycle rules. |
| FR-ADM-007 | Service records contain a name, category, icon, duration, price, one or more required skills, and active/archive state. Categories are ordered presentation data and may be archived only when no active service still uses them. | `ServiceCategory`/`Service`/`ServiceSkill` Prisma models, `/api/services`, `/api/admin/service-categories`, `/api/admin/services`, and the grouped kiosk/admin catalog forms. |
| FR-ADM-008 | Admin can inspect the append-only turn history for an appointment, including event, actor, assigned staff snapshot, reason, and time. | `/api/admin/appointments/[id]/turn-history`; `TurnEvent` migration/model; Admin appointment history modal. |
| FR-ADM-005 | Admin can create, rename, and safely remove skill definitions; skills assigned to staff or services cannot be deleted. | `AdminAccessManagement`; `/api/admin/skills`; Prisma relation counts, Zod validation, role guard, audit events, and safe-delete rule. |
| FR-ADM-006 | Admin can create, update, reset, activate/deactivate, and safely delete ADMIN/STATION accounts without removing the last active admin or the current admin session. Deleting an account preserves payment rows and clears only the optional account reference. | `AdminAccessManagement`; `/api/admin/accounts`; Argon2id password hashing, Zod validation, role guard, audit events, confirmation, and account lifecycle safeguards. |
| FR-ENG-001 | Assignment considers active, present, available staff with every skill required by the service and applies fairness ordering after those eligibility filters. | `src/domain/turn-routing.ts`; service skill matching uses an all-skills rule. |
| FR-ENG-002 | Appointment, turn, attendance, payment, and command operations enforce valid transitions/idempotency. | `state-machines.ts`, D1 guarded batches, Prisma constraints, `CommandReceipt` request hashes, and legacy transaction/advisory-lock fallback. |

## Hardening rules now enforced

- Exact-service skips persist a staff exclusion; only an authorized manager can override it with a reason, actor, timestamp, and audit event.
- Repeated exact-service skips do not auto-cancel or invent a new queue state in the MVP. The service remains waiting when no eligible staff remain, the board marks it for manager review, and a manager resolves it through attendance/routing or an audited exclusion override.
- Staff cannot check out while assigned to active work; Accept revalidates attendance, account state, ownership, and availability inside the transaction.
- Intentional same-day visits remain distinct; retries with the same idempotency key replay the original response, while changed payloads are rejected.
- Cancellation, service change, reassignment, skip override, queue repair, closing, and retention are explicit protected commands with validation/audit boundaries.
- Supporting staff are released atomically with the primary technician; historical participation is retained without keeping the staff member busy.
- Board reads are side-effect free and synchronize through a monotonic database version, SSE recovery, and bounded polling.
- Payment changes are admin-only, reasoned, idempotent where retried, and audit-backed; refunds are records of an external merchant action, not gateway execution.
- Turn history is append-only and stores display snapshots for actors and assigned staff so operational history remains readable after account/staff changes.

## Non-functional requirements

- Security: Argon2id for passwords/PINs; no plaintext secret logs; httpOnly strict same-site cookies; server-side account/session-version revalidation; database-backed PIN lockout with a process-local fast path; CSP and security headers; trusted-origin checks on mutations; rate limiting at nginx in the proxy profile.
- Consistency: one payment per appointment, one attendance record per staff/business date, append-only audit events, request-hash idempotency receipts, monotonic board versions, and serialized assignment per shop/business date.
- Availability: `/api/health` is suitable for container health checks; board SSE has keepalives and a polling fallback.
- UX: tablet-first layout, touch-friendly controls, visible focus states, reduced-motion support, status communication that is not color-only, and visible authentication actions on narrow/mobile widths; secondary status/navigation controls may collapse to preserve space.
- Time and money: default timezone `Asia/Ho_Chi_Minh`, default currency `USD`, closing time `21:00`; all are configurable through `ShopConfig`/environment defaults.
- Operations: Docker standalone image, non-root runner, migration service, healthcheck, protected closing/retention jobs, request/lock/sync/job telemetry, CI verification, and documented rollback/human gates.

## Assumptions

- V1 is one shop and one board station; the schema leaves room for a future tenant key but does not implement multi-tenancy.
- A new appointment code is `A` plus a sequence number for the business date.
- Fairness sorts staff who have never finished a service first, then by oldest `lastServiceFinishedAt`, then oldest assignment/id tie-breaker.
- Verified staff sessions default to 3 minutes and use the configured `ShopConfig.verifiedSessionTtlMin` value within the allowed 1–15 minute range.
- Automatic closing runs against the configured business date and marks checkout-eligible open attendance `CHECKED_OUT` with `closedBy=AUTO`; staff attached to `IN_SERVICE` or `PAYMENT_PENDING` appointments remain checked in until payment is completed.
- Payment is recorded only after a merchant terminal has completed; this app never reads card data.
- Returning-customer kiosk lookup follows the approved privacy option A: a matching phone may display the stored full name read-only; the response is limited, `no-store`, and does not expose the phone/customer record.
- Cloudflare Worker + D1 is the active application runtime store; missing D1 binding/configuration is a startup/health failure. PostgreSQL/Docker is retained only for legacy compatibility and rollback.

## Constraints

- Next.js 16 App Router conventions and the repository-specific `AGENTS.md` rules apply.
- D1 schema/migrations are the durable database path for the Worker target. PostgreSQL 16/Prisma migrations remain a legacy compatibility path.
- Auth.js Credentials is the current authentication mechanism; no external identity provider is configured.
- Production TLS/domain, real secrets, merchant integration, and deploy/rollback are human approval gates.
- The current workspace does not contain a `.git` directory; the current push uses the attached external Git metadata documented in `docs/handoff.md`.
- External scheduling/alerting for closing and retention is intentionally operator-owned and deferred until the operations decision is reopened.

## Out of scope for V1

Online booking, customer accounts, payroll, commissions, inventory, loyalty, card processing/payment gateway execution, multi-tenant administration, and production certificate provisioning remain out of scope. Payment correction/refund records only document an external merchant action and do not process card data.
