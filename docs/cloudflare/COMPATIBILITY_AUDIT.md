# Cloudflare Compatibility Audit

**Date:** 2026-10-17
**Status:** Local Worker/D1 build and smoke path verified; production readiness remains blocked by incomplete critical-command atomicity and unrun remote validation.

## Scope

This audit covers the Cloudflare Workers Free + D1 runtime for Wellness Salon. Worker + D1 is the only active behavioral target; local E2E uses disposable state and no real data is imported.

## Findings

| Area | Result | Evidence / consequence |
| --- | --- | --- |
| Vinext initialization | Pass | vinext@1.1.0 uses the Cloudflare platform path with CDN cache and image optimization disabled. |
| Cloudflare build configuration | Pass | npx cf build emits .cloudflare/output/v0/workers/default, the Worker name nail-shop-management, nodejs_compat, assets, D1 DB, and the scheduled-handler wrapper. |
| Direct local vinext runtime | Pass for smoke scope | Local Worker artifact served public pages, health, catalog, board, SSE initial snapshot, check-in, authentication, and payment-confirmation paths. |
| Canonical Worker/D1 E2E gate | Pass for local scope | `npm run test:e2e:d1` applied all four migrations/bootstrap and passed 37/38 cases; one desktop-project skip is intentional because the responsive queue case runs on the tablet project. |
| cf dev runtime | Blocked for current plugin combination | The local Build Output/SSR child-environment combination still cannot initialize the SSR environment. This is a tooling limitation, not proof of remote success. |
| Worker password/session boundary | Pass for local scope | PBKDF2-HMAC-SHA-256 via Web Crypto, custom HS256 session cookies, active-user/session-version checks, and DB login lockouts are present; local HTTP login/session smoke passes. The direct `next-auth` dependency was removed from the Worker dependency graph. |
| D1 schema and migrations | Pass locally and remotely | Separate SQLite schema applied through 0001–0004 locally; remote D1 now records all four migrations with no pending migration. |
| D1 bootstrap | Pass locally | The production bootstrap generator emitted 101 idempotent statements for a clean catalog, staff, accounts, and ShopConfig; local Wrangler applied all 101 successfully. It creates no demo appointments. |
| D1 batch command paths | Partial / broadened | Critical branches now cover check-in, staff actions, payment lifecycle, appointment mutations, reconciliation, closing, retention, and admin CRUD with batches, guards, and receipts. Fault-injection, full concurrency, and remote rollback/retry evidence is still missing. |
| Money handling | Partial | Validation and application arithmetic use integer minor units; the D1 schema still stores compatibility numeric columns and needs production accounting review. |
| Timezone/scheduler | Compatible with a guarded dynamic trigger | Owner confirmed `Asia/Ho_Chi_Minh`. One `*/15 * * * *` UTC trigger reads the current D1 `ShopConfig` timezone/closing time, so the Admin UI remains authoritative; invalid or missing configuration fails closed. |
| Production deployment | Supervised workers.dev deployment | GitHub Actions run `38989593416` deployed Worker version `da7b9972-2173-4e2a-9f24-49ab9140a3b1`; read-only remote health and migration checks passed, with no pending D1 migrations. Authenticated remote mutation/scheduler evidence remains open. |
| Production dependency audit | Pass | Build/seed-only dependencies were moved to devDependencies; the last successful `npm audit --omit=dev --omit=optional` reported 0 vulnerabilities. |

## Compatibility decision

The repository is at the deployed-supervised-pilot stage, not full production-readiness stage. The Worker artifact and critical D1 branches are deployed to workers.dev, but production cutover remains gated by failure/concurrency evidence, scheduler authorization, capacity, and authenticated remote smoke.

## Official references

- [Cloudflare Next.js / vinext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare Vite plugin API](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Prisma Cloudflare D1 documentation](https://www.prisma.io/docs/orm/v6/overview/databases/cloudflare-d1)
