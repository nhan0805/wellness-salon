# Implementation decisions

Last updated: 2026-10-11

## 2026-10-11 follow-up decisions

- `ServiceCategory` is the current catalog contract; the earlier category-free decision is retained only as historical migration context. Categories organize presentation and may be archived only after active services move elsewhere.
- Payment correction/refund workflows update one current payment row and preserve a reasoned, actor-scoped audit trail instead of deleting/recreating financial records. Refunds document an external terminal action; the app does not process card data.
- `TurnEvent` is an append-only operational ledger with actor and assigned-staff snapshots so the Admin history view remains useful after staff/account changes.

This file records decisions that constrain implementation. Items marked `Business rule` came from the authorized implementation brief. Items marked `Implementation decision` are the simplest reliable choices made to make those rules enforceable in the current MVP architecture.

## Final business rules

### BR-01 — Exact service skip exclusion

When a technician skips an exact `AppointmentService`, the system persists an exclusion for that appointment service and technician. Automatic routing must honor it forever for that service. A manager may override the exclusion only with an explicit reason, actor, timestamp, and audit event. If no replacement is eligible, the service remains waiting.

### BR-02 — Attendance and checkout safety

An `ASSIGNED` technician cannot check out. Automatic closing follows the same blocking rule. Accepting a turn validates attendance, active staff status, and current assignment in one transaction. A checked-out technician cannot accept/enter service.

### BR-03 — Explicit same-day visits and idempotent retries

Two intentional same-day visits by the same customer are valid and must not be deduplicated by phone/date. A retry with the same idempotency key returns the original result. Concurrent explicit submissions must remain distinct and safe.

### BR-04 — Cancellation, not no-show

The product exposes `CANCELLED`, not `NO_SHOW`. Authorized cancellation is allowed for waiting/assigned work. Cancelling `IN_SERVICE` is manager-only and requires confirmation and a reason. `PAYMENT_PENDING` and `COMPLETED` work cannot be cancelled. Cancellation preserves history, releases or reroutes capacity, and supports an explicit service-level versus whole-visit choice for multi-service visits.

### BR-05 — Audited service changes

A manager previews service, price, skill, and staff impact before changing an active service. The change is transactional and audited, preserves the original snapshot, revalidates skills, and cannot overwrite completed or confirmed-payment history. A current technician who is no longer qualified cannot silently continue.

### BR-06 — Supporting technician participation

Supporting technicians finish with the primary technician. There is no independent support Finish action. Finish releases primary and support assignments atomically, preserves participation history, prevents double assignment, requires present/active/available staff, and updates support last-work timing at shared finish. Support does not create another visit or payment.

## Scope decisions

- No merchant payment gateway, card processing, staff mobile application, payroll/commissions, inventory, loyalty, multi-tenant expansion, microservices, event sourcing, or full offline-first architecture is being added in this batch.
- Existing payment confirmation remains an operational record, not a payment processor integration.
- `CANCELLED` is intentionally distinct from `COMPLETED`; cancelled services remain visible in history and are excluded from payment items.
- PostgreSQL remains the source of truth. Browser state is a cache and must never be used to authorize a mutation.

## Implementation decisions

- Board reads are side-effect free. Assignment reconciliation is invoked at safe mutation boundaries and through an explicit manager repair command, rather than during every GET/SSE read.
- Board synchronization uses a database-backed monotonic version plus snapshot refresh. SSE remains a notification channel; controlled polling and reconnect backoff remain the recovery path.
- Idempotency receipts are scoped to the business operation and include a request hash. A reused key with a different payload is rejected.
- Server-side authorization revalidates the active account and session version rather than trusting an old JWT role/status claim. Verified staff sessions can be revoked.
- Shop configuration is authoritative in `ShopConfig`; environment values are bootstrap fallbacks only. Time and currency presentation use configured values.
- `roundRobinEnabled` controls routing order: enabled uses the existing least-recently-served/fairness behavior; disabled uses a stable staff name/id order. It does not bypass skill, attendance, availability, or exclusion checks.
- Cancellation is explicit in the admin command. A service-level cancellation preserves other service work; whole-visit cancellation is rejected when it would cancel completed work and otherwise applies to all cancellable services.
- An active service change that would make the current technician unqualified is rejected until a manager explicitly reassigns the service. This avoids silent unsafe continuation.
- Skip reasons are master data with historical name snapshots. Disabling a reason prevents new use but does not rewrite history.
- A support technician's participation row is retained for history but receives `releasedAt` when the primary service finishes or the work is cancelled. Active-support queries require `releasedAt: null`, so historical participation cannot keep a technician busy.
- Public board responses redact customer name/phone and exclusion details; staff names and operational availability remain visible because the board is a shared staff-facing display.
- Queue repair is an explicit manager action. It is not performed by read-only board requests, which prevents an SSE/refresh storm from creating hidden writes.
- Retention cleanup is exposed as a protected job endpoint and is not automatically scheduled by the application. The deployment operator must schedule it with the configured job secret.
- Tests that require a database must use `TEST_DATABASE_URL`, and the test harness must refuse to run if it equals the configured application database URL.
- Public kiosk returning-customer lookup uses the approved full-name behavior: a matching phone may display the stored full name on the shared kiosk so the guest can confirm it. The lookup response is limited to `found`, `name`, and readiness/error fields, is marked `no-store`, and does not expose the phone or customer record. Rate limiting remains an infrastructure/operator concern because the shared kiosk is a trusted-origin surface.
