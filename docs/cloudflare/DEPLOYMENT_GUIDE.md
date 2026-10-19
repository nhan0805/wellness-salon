# Cloudflare Free Deployment Guide

**Date:** 2026-10-19
**Status:** Release commit `9474c0e` passed local and GitHub verification, migration `0005_free_quota_hardening.sql` remains applied remotely, and the Worker deploy plus public/authenticated read-only smoke succeeded. Business mutation/scheduler evidence and final production approval remain intentionally owner-gated.

## Latest deployment record

- Worker URL: `https://wellness.n8l.workers.dev`
- Source commit: `9474c0e0cdad901e356227bddd98712c0c8daa14`
- Trigger: `*/15 * * * *`
- Deployed with `npm run deploy:vinext` after GitHub Actions run [39191668530](https://github.com/nhan0805/wellness-salon/actions/runs/39191668530) passed verification: lint, typecheck, coverage, build, audit, and Worker/D1 E2E (41 passed, 1 intentional skip).
- Cloudflare Version ID: `967a657b-d9b7-4e17-bd58-ce9c69e77393`.
- Post-deploy read-only health check passed for `/api/health`.
- `npm run smoke:remote` passed 19/19 public and authenticated admin read-only checks, including the initial SSE snapshot.
- D1 migrations through `0005_free_quota_hardening.sql` are recorded remotely; the post-apply migration check reports no pending migrations.
- The existing remote D1 schema/data were preserved; this deployment did not delete/reset D1, create a custom domain, or import production data.
- This is a workers.dev deployment, not a claim that every production sign-off gate is complete.

## Local checks

~~~bash
npm run lint
npm run typecheck
npm test -- --run
npm run db:generate:all
npx wrangler d1 migrations apply wellness-salon --local --config=wrangler.local.jsonc
npx vinext check
npm run build
npm run build:vinext
npx cf build
npx cf deploy --dry-run
npm run dev:vinext
~~~

The direct vinext dev server is the verified local D1 route smoke path. cf dev remains blocked by the current SSR child-environment/build-output interaction documented in COMPATIBILITY_AUDIT.md.

## Approval gate

The following steps are for the owner/operator after the D1 command port, tests, capacity review, scheduler review, and explicit production approval. They are not to be run automatically by a migration audit:

1. Authenticate to Cloudflare through the secure interactive Wrangler flow. Do not paste or request tokens in chat.
2. Create or select the reviewed D1 database with the name wellness-salon and record the generated database ID. Do not import production data.
3. Apply the reviewed migrations to the remote database before activating a future schema-dependent release:

~~~bash
npx wrangler d1 migrations apply wellness-salon --remote --config=wrangler.production.jsonc
~~~

4. Generate a bootstrap SQL file outside the repository with the approved admin/station credentials, initial PIN, and `SHOP_TIMEZONE=Asia/Ho_Chi_Minh`. Use D1_BOOTSTRAP_CONFIRM=YES and review the file; it contains password hashes and must be protected.
5. Apply that reviewed file to the fresh remote D1:

~~~bash
npx wrangler d1 execute wellness-salon --remote --file=/private/tmp/wellness-salon-d1-bootstrap.sql
~~~

6. Upload runtime secrets using the current Wrangler secret command. At minimum: AUTH_SECRET and CRON_SECRET. Never store them in .env committed to the repository.
7. The Worker configuration uses one `*/15 * * * *` UTC trigger and `PRODUCTION_TIMEZONE_CONFIRMED=true`. The scheduled handler reads the current D1 `ShopConfig.timezone` and `closing_time`, so an Admin UI timezone/closing-time change does not require a code change or trigger redeploy. It disables itself when ShopConfig is missing or invalid.
8. **Completed 2026-10-19 for release `3e7f853`:** The verified commit was pushed to `main`; GitHub Actions run `39179544598` passed verification and deployed the Worker using workers.dev only. The post-deploy `/api/health` check returned HTTP 200 with `status: ok`; no custom domain or real production data import was used.
9. **Read-only complete:** The deployed URL passed health, service-catalog, board, kiosk page, SSE initial snapshot, login/session/logout, dashboard/config/catalog/staff/attendance/customer/appointment/report reads, and public redaction smoke. Business mutations remain excluded so the smoke cannot create real appointments or payments.
10. **Operator gate:** Verify a single approved mutation flow, inspect the scheduled-event logs, and configure Cloudflare quota/error notifications. With `Asia/Ho_Chi_Minh` and default `21:00` closing, the current dynamic trigger evaluates closing at `21:15` local and retention at `03:15` local.

## Non-negotiable safeguards

- Do not create a custom domain during the first deployment.
- Do not import real production data.
- Do not reset or overwrite remote D1 data during a deployment.
- Do not report success from a build alone.
- Never deploy automatically from a local build or test command.
- Stop and obtain owner direction if any D1/concurrency/auth/money/timezone gate is incomplete.
