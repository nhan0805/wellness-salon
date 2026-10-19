# Remote smoke scope

**Date:** 2026-10-19
**Status:** The deployed Worker passed the read-only public and authenticated admin smoke. Business mutations and scheduled jobs remain deliberately operator-gated.

## Latest evidence

`npm run smoke:remote` completed with 19/19 checks passing on the deployed Worker:

- health, catalog, board, kiosk page, and SSE initial snapshot;
- admin login and session revalidation;
- dashboard, configuration, service/category/skill/account/staff reads;
- attendance, customers, first appointment page, current report, and logout.

The smoke used the existing approved admin credential from the local operator environment, did not print it, and did not create business records.

## Intentionally excluded

These operations are not safe to invoke automatically against the real salon database:

- kiosk check-in and staff turn actions;
- payment confirmation, correction, adjustment, or refund;
- appointment cancellation/reassignment/service changes;
- closing, retention, or demo-turn backfill;
- catalog/account/staff/configuration mutations.

Their local Worker/D1 coverage remains the canonical automated gate. A human may run a single approved end-to-end mutation with a documented demo record, then clean up through the normal audited workflow; never use a hidden or destructive test fixture in production.
