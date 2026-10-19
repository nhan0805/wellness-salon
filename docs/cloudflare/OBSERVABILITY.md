# Production observability and smoke checks

**Date:** 2026-10-19
**Status:** Read-only production smoke is automated locally and in GitHub Actions; quota and scheduler metrics still require Cloudflare dashboard/operator review.

## What is automated

`npm run smoke:remote` checks the deployed workers.dev Worker without creating an appointment, payment, customer, or staff mutation:

- health, public catalog, board snapshot, kiosk page, and the first SSE snapshot;
- admin login/session revalidation when the local `.env` has the approved admin credentials;
- authenticated admin GETs for dashboard, config, catalog, staff, attendance, customers, appointments, and reports;
- logout and response timing/status collection.

The script never prints credentials or response bodies. It reports only endpoint names, HTTP status, and elapsed time. The scheduled GitHub workflow runs the public checks every six hours and can run the authenticated checks when the optional `REMOTE_SMOKE_ADMIN_EMAIL` and `REMOTE_SMOKE_ADMIN_PASSWORD` repository secrets are configured.

```bash
npm run smoke:remote
```

The check is intentionally read-only at the business level. Do not turn it into a payment, check-in, closing, retention, or catalog-mutation test against the real database.

## What to inspect in Cloudflare

During the first demo week, inspect Workers Metrics and D1 Metrics at least once per operating day. Review:

- Worker requests, CPU time, errors, duration, and subrequests;
- D1 rows read/written and database storage;
- the proportion of `GET /api/board` and `GET /api/sse/board` traffic;
- slow or failed structured events: `api.request.failed`, `api.request.completed` with `slow: true`, `db.prisma.operation`, `db.lease.*`, `job.*`, and `command.rejected`.

The Free-tier planning thresholds remain in [FREE_TIER_CAPACITY.md](FREE_TIER_CAPACITY.md). Treat 70% of a daily limit as the investigation threshold, not as a guaranteed safe operating point. If usage rises unexpectedly, close extra board tabs first, stop repeated manual refreshes, and keep the kiosk on the published 15-second visibility-aware polling behavior.

## Scheduler evidence

The Worker has one `*/15 * * * *` trigger. The scheduled handler reads the current D1 timezone and closing time and forwards a secret to the protected job endpoint. Local unit coverage verifies the mapping and authorization. Production scheduler verification must be done from Cloudflare's scheduled-event tooling or the Worker event log; do not invoke closing or retention manually against production just to create evidence.

For `Asia/Ho_Chi_Minh` and the default `21:00` closing time, the current implementation evaluates the closing job at the first quarter-hour at least five minutes after closing, `21:15` local time. Retention runs at `03:15` local time. A future timezone with seasonal offset changes needs a reviewed scheduling decision before use.

## Alerting

The repository cannot create Cloudflare account alerts without changing the owner's account configuration. Configure dashboard notifications for Worker errors and D1 quota pressure in the Cloudflare account, then record the alert destination and owner in the deployment handoff. Until that is configured, the six-hour GitHub smoke is the availability signal, not a quota alert.
