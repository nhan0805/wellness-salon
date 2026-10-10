# Requirements

Last updated: 2026-10-09

This file is the implementation-facing summary of the approved lifecycle artifacts in `docs/lifecycle/`.

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
| FR-BRD-001 | Board shows all turns currently in service, the up-next queue, present staff, and availability. Each queue card keeps the complete selected service bundle visible with per-service progress and combined duration. The read-only view is public so a floor display can open without a login, and new check-ins appear automatically within the polling window. | `/board`; public `GET /api/board`; public SSE snapshot/keepalives plus a 3-second polling refresh in the client; queue and attendance are separated into two tabs. |
| FR-BRD-002 | Staff can accept, skip with a reason, finish, check in/out, and add supporting staff. Accept moves the assigned service directly into service; there is no separate Start action. Attendance is managed from a dedicated tab with prominent labeled Check in/Check out actions. | Protected `POST /api/board`; station/admin session plus verified staff session cookie. |
| FR-ADM-001 | Admin can view queue, appointments, attendance context, pending payments, and reports. | `/admin`; appointment/report APIs and management modules read/write PostgreSQL. |
| FR-ADM-002 | Only an admin confirms CARD/CASH and records optional tips after the merchant terminal; an appointment has at most one payment. | `POST /api/admin/payments/confirm`; `Payment.appointmentId` is unique. |
| FR-ADM-003 | Reports show revenue, completed count, card/cash split, service/staff attribution, and reconciliation difference. | `GET /api/admin/reports`; `calculateReconciliation`. |
| FR-ADM-004 | Admin can create/update customers, manage staff names, skills, PINs and activation, manage service catalog records, and review/check in/out attendance. Staff initials are derived automatically from the name. | `AdminManagement`; `/api/admin/attendance`, `/api/admin/customers`, `/api/admin/staff`, `/api/admin/services`; Zod validation, role guards, audit events, and safe lifecycle rules. |
| FR-ADM-007 | Service records contain only the service name, duration, price, one or more required skills, and active/archive state; category is intentionally excluded from the V1 catalog. | `Service`/`ServiceSkill` Prisma models, `/api/services`, `/api/admin/services`, and the kiosk/admin service forms. |
| FR-ADM-005 | Admin can create, rename, and safely remove skill definitions; skills assigned to staff or services cannot be deleted. | `AdminAccessManagement`; `/api/admin/skills`; Prisma relation counts, Zod validation, role guard, audit events, and safe-delete rule. |
| FR-ADM-006 | Admin can create, update, reset, activate/deactivate, and safely delete ADMIN/STATION accounts without removing the last active admin or the current admin session. Deleting an account preserves payment rows and clears only the optional account reference. | `AdminAccessManagement`; `/api/admin/accounts`; Argon2id password hashing, Zod validation, role guard, audit events, confirmation, and account lifecycle safeguards. |
| FR-ENG-001 | Assignment considers active, present, available staff with every skill required by the service and applies fairness ordering after those eligibility filters. | `src/domain/turn-routing.ts`; service skill matching uses an all-skills rule. |
| FR-ENG-002 | Appointment, turn, attendance, payment, and command operations enforce valid transitions/idempotency. | `state-machines.ts`, Prisma constraints, `CommandReceipt`, and transactions. |

## Non-functional requirements

- Security: Argon2id for passwords/PINs; no plaintext secret logs; httpOnly strict same-site cookies; CSP and security headers; trusted-origin checks on mutations; rate limiting at nginx in the proxy profile.
- Consistency: one payment per appointment, one attendance record per staff/business date, append-only audit events, and serialized assignment per shop/business date.
- Availability: `/api/health` is suitable for container health checks; board SSE has keepalives and a polling fallback.
- UX: tablet-first layout, touch-friendly controls, visible focus states, reduced-motion support, status communication that is not color-only, and visible authentication actions on narrow/mobile widths; secondary status/navigation controls may collapse to preserve space.
- Time and money: default timezone `Asia/Ho_Chi_Minh`, default currency `USD`, closing time `21:00`; all are configurable through `ShopConfig`/environment defaults.
- Operations: Docker standalone image, non-root runner, migration service, healthcheck, CI verification, and documented rollback/human gates.

## Assumptions

- V1 is one shop and one board station; the schema leaves room for a future tenant key but does not implement multi-tenancy.
- A new appointment code is `A` plus a sequence number for the business date.
- Fairness sorts staff who have never finished a service first, then by oldest `lastServiceFinishedAt`, then oldest assignment/id tie-breaker.
- Verified staff sessions are normally 3 minutes and clamped to 2–5 minutes in the database service.
- Automatic closing runs against the configured business date and marks checkout-eligible open attendance `CHECKED_OUT` with `closedBy=AUTO`; staff attached to `IN_SERVICE` or `PAYMENT_PENDING` appointments remain checked in until payment is completed.
- Payment is recorded only after a merchant terminal has completed; this app never reads card data.
- PostgreSQL is the only application runtime store; missing database configuration is a startup/configuration error.

## Constraints

- Next.js 16 App Router conventions and the repository-specific `AGENTS.md` rules apply.
- PostgreSQL 16 and Prisma migrations are the durable database path.
- Auth.js Credentials is the current authentication mechanism; no external identity provider is configured.
- Production TLS/domain, real secrets, merchant integration, and deploy/rollback are human approval gates.
- The current workspace does not contain `.git`, so source-control history is not available to the agent.

## Out of scope for V1

Online booking, customer accounts, payroll, commissions, inventory, loyalty, card processing/payment gateway integration, multi-tenant administration, and production certificate provisioning.
