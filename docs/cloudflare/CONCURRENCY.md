# D1 Concurrency and Invariants

**Date:** 2026-10-19
**Status:** Critical D1 mutation branches use explicit batch/guard/receipt orchestration; local concurrency/replay smoke and deployed authenticated read-only smoke pass. Interruption/failure-injection, broader mutation concurrency, and live capacity evidence remain open.

## D1 constraint and current orchestration

Prisma's D1 adapter does not provide a rollback transaction boundary: D1 statements execute individually and a later failure cannot undo an earlier successful write. The Worker therefore uses a `__app_locks` row lease to serialize same-shop critical sections, plus guarded predicates, explicit batches, and replay receipts. The lease prevents same-shop races during the callback but does not make a partial write reversible.

The explicit D1 branches use D1Database.batch() plus predicates and replay receipts:

- kiosk check-in core writes customer, appointment, service rows, audit, receipt, and shop version as one batch; routing is retry-repairable through a ROUTING receipt;
- staff check-in/out and turn actions cover accept, finish, skip, support, and continue-with-me with guarded state changes;
- payment confirmation, adjustment, correction, and refund write payment history, guarded appointment/payment state, staff release, audit, receipt, and shop version as batches;
- appointment cancellation, reassignment, exclusion override, service change, and queue reconciliation use guarded D1 batches;
- closing and retention use explicit D1 batches; catalog, account, customer, staff, attendance, category, service, skill, skip-reason, and ShopConfig admin writes have D1 branches;
- business-date direct writes use the same +00:00 DateTime representation as Prisma's D1 adapter;
- exact money arithmetic is performed in integer minor units at validation and service boundaries.

These branches are the only active write path. Local batch/guard/replay tests and HTTP smoke cover the critical command families, and the deployed read-only smoke covers auth and read projections. Remote business mutation, interruption/rollback, and production capacity observation remain deployment gates. Do not describe local smoke or read-only smoke as a substitute for remote mutation behavior or quota telemetry.

## Required invariants

Every mutation must prove:

- one logical command produces at most one state transition;
- retries with the same idempotency key replay the same result;
- a conflicting payload hash is rejected;
- stale board/session/version commands cannot overwrite newer state;
- staff skill, assignment, checkout, cancellation, and payment invariants hold after concurrent requests;
- an interrupted request cannot leave a half-applied business operation.

## Local evidence

The disposable local D1 smoke produced unique concurrent appointment codes, replayed the original check-in, rejected a conflicting check-in, exercised staff routing/actions and appointment changes, exercised admin CRUD and attendance, confirmed/replayed/conflicted payments, ran retention, and verified both closing blockers and a successful closing mutation. Unit coverage also exercises guarded scheduler authorization and replay behavior. This remains local evidence; the initial workers.dev health/catalog/page smoke passed, but deployed mutation behavior and quota telemetry still require a broader approved remote run.
