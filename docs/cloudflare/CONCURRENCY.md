# D1 Concurrency and Invariants

**Date:** 2026-10-13  
**Status:** Critical D1 mutation branches now use explicit batch/guard/receipt orchestration; production still needs remote evidence and the final account/secret gate.

## Legacy PostgreSQL compatibility behavior

The legacy Next/Docker path uses Prisma `$transaction` and PostgreSQL advisory locks around queue routing, staff actions, idempotency receipts, reconciliation, closing, and retention. Those mechanisms are retained for rollback/compatibility; the active Worker/D1 gate exercises the D1 batch/guard/receipt paths below.

## D1 constraint and current bridge

Prisma's D1 adapter cannot preserve the PostgreSQL transaction guarantee: D1 transactions are not a rollback boundary and queries execute individually. The bridge uses a __app_locks row lease to serialize legacy callback paths. The lease prevents same-shop races during the callback, but it cannot undo a write that succeeded before a later write fails.

The explicit D1 branches use D1Database.batch() plus predicates and replay receipts:

- kiosk check-in core writes customer, appointment, service rows, audit, receipt, and shop version as one batch; routing is retry-repairable through a ROUTING receipt;
- staff check-in/out and turn actions cover accept, finish, skip, support, and continue-with-me with guarded state changes;
- payment confirmation, adjustment, correction, and refund write payment history, guarded appointment/payment state, staff release, audit, receipt, and shop version as batches;
- appointment cancellation, reassignment, exclusion override, service change, and queue reconciliation use guarded D1 batches;
- closing and retention use explicit D1 batches; catalog, account, customer, staff, attendance, category, service, skill, skip-reason, and ShopConfig admin writes have D1 branches;
- business-date direct writes use the same +00:00 DateTime representation as Prisma's D1 adapter;
- exact money arithmetic is performed in integer minor units at validation and service boundaries.

These branches remove the known D1 write-path gap. Reads and compatibility fallback code still use the Prisma D1 adapter. Local batch/guard/replay tests and HTTP smoke cover the critical command families, but remote D1 evidence and a production capacity observation remain deployment gates. Do not describe local smoke as a substitute for remote behavior or quota telemetry.

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
