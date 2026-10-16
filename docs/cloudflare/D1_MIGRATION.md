# D1 Migration Plan

**Date:** 2026-10-13  
**Status:** Separate D1 schema, three local migrations, Worker bridge, explicit critical-mutation branches, and clean bootstrap workflow are present; remote database migration remains an explicit deployment step.

## Source of truth and safety

`prisma/d1/schema.prisma`, `prisma/d1/migrations/*`, and the Worker D1 branches are the only source of truth for the runtime/test target. Use the explicit D1 migration commands; do not run a server-database migration workflow against the Worker.

Production starts with a reviewed D1 database state. The migration excludes real production-data import; local E2E state is disposable and remote D1 state must be backed up before reviewed changes.

## D1 representations

| Application value | D1 representation |
| --- | --- |
| Decimal money | Numeric compatibility columns remain in the baseline; validation and application arithmetic normalize values through integer minor units. Production financial review is still required before release. |
| DateTime | UTC ISO text; direct D1 writes use the adapter-compatible +00:00 form and business-date conversion uses the owner-selected IANA timezone. |
| Enum | Text values with schema/domain validation. |
| Json | Canonical JSON text with application shape validation. |
| IDs | Text identifiers generated in the application layer. |
| Boolean | SQLite integer boolean normalized by Prisma/queries. |

## Migrations

- prisma/d1/migrations/0001_init.sql creates the fresh operational schema.
- prisma/d1/migrations/0002_auth_login_lockouts.sql adds cross-request login lockout state.
- prisma/d1/migrations/0003_appointment_read_indexes.sql adds the date-scoped appointment read index used by queue/history projections.
- wrangler.local.jsonc applies all three migrations to disposable local Wrangler state.

## Transaction constraint

Prisma's D1 adapter does not provide a rollback transaction boundary. D1 command branches use D1Database.batch() with conditional updates, a local lease, and idempotency receipts for check-in, staff actions, payment lifecycle, appointment changes, reconciliation, closing, retention, and admin writes. Production is still not cleared until interruption/fault-injection, concurrency, remote Worker, cron authorization, and capacity evidence is complete.

## Clean bootstrap

npm run db:seed:d1:sql runs scripts/seed-d1-bootstrap.ts. With owner-supplied environment values and D1_BOOTSTRAP_CONFIRM=YES, it emits idempotent SQL for:

- a compact editable service catalog and categories;
- skills, six active staff records, and a shared initial PIN hash;
- ADMIN and STATION accounts with Worker-compatible PBKDF2 hashes;
- skip reasons and ShopConfig with the selected IANA timezone.

It does not create appointments, payments, demo history, or import production data. The operator reviews the generated file before applying it to the reviewed remote D1.

## Local workflow

~~~bash
npm run test:e2e:d1
~~~

The command builds the Worker artifact, applies all three local migrations, emits/applies the disposable 101-statement bootstrap, and runs the D1 Playwright gate. For a manual migration/bootstrap review, use `wrangler.local.jsonc` and disposable values only. The local database is disposable and must never be treated as a production seed or data import.

## References

- [Cloudflare D1 pricing and quotas](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 Worker API and batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Prisma D1 adapter limitations](https://www.prisma.io/docs/orm/v6/overview/databases/cloudflare-d1)
