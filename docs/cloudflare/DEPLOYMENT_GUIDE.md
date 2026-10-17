# Cloudflare Free Deployment Guide

**Date:** 2026-10-17
**Status:** The P0 hardening follow-up and D1 migrations are deployed to workers.dev; the post-deploy health check passed. Full remote auth/mutation/scheduler evidence and final production approval remain open.

## Latest deployment record

- Worker URL: `https://wellness.n8l.workers.dev`
- Worker version: `1a2b699a-e573-450c-bdd6-b82cda87e81e`
- Source commit: `7fb7f55d6e288a37e2c2cb0eb17b62cb57163c31` (documentation sync on top of application commit `6f379c0`)
- Trigger: `*/15 * * * *`
- Deployed with `npm run deploy:vinext` on 2026-10-17 after GitHub Actions run `38992751463` passed verification: lint, typecheck, coverage, build, audit, and Worker/D1 E2E (37 passed, 1 intentional skip).
- Post-deploy read-only health check passed for `/api/health`.
- D1 migrations `0003_appointment_read_indexes.sql` and `0004_p0_hardening.sql` were applied remotely at `2026-10-17 01:07:38Z`; migration verification reports no pending migrations.
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
3. Apply the reviewed migrations to the remote database (completed for the current deployment):

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
8. **Completed 2026-10-13:** Run the dry build/deploy validation above, then deploy the reviewed Worker with `npm run deploy:vinext` (`cf deploy`) using workers.dev only; no custom domain or real production data import was used.
9. **Partially complete:** The deployed URL passed health, service-catalog, board, and kiosk page smoke. Login/session/logout, public board redaction, kiosk mutation/idempotent replay, staff actions, admin payment confirmation, reports, audit history, and error-log verification still require an approved remote test scope.
10. **Not run:** Verify the scheduler with Cloudflare's local scheduled-event endpoint and then with the deployed Worker. Confirm that a `21:00` close runs at the first quarter-hour after `21:05` local time and retention runs at `03:15` local time for the configured timezone.

## Non-negotiable safeguards

- Do not create a custom domain during the first deployment.
- Do not import real production data.
- Do not reset or overwrite remote D1 data during a deployment.
- Do not report success from a build alone.
- Never deploy automatically from a local build or test command.
- Stop and obtain owner direction if any D1/concurrency/auth/money/timezone gate is incomplete.
