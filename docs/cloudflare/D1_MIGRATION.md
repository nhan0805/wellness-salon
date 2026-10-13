# D1 Migration Plan

**Date:** 2026-10-13  
**Status:** Separate D1 schema, two local migrations, Worker bridge, explicit critical-mutation branches, and clean bootstrap workflow are present; remote database and migration intentionally not run.

## Source of truth and safety

prisma/schema.prisma and the existing PostgreSQL migrations remain the reference implementation. The D1 schema is separate; do not overwrite the PostgreSQL provider or run prisma migrate deploy against D1.

Production starts with a fresh D1 database. The migration excludes real production-data import, and existing PostgreSQL/Docker volumes must be preserved.

## D1 representations

| PostgreSQL/reference value | D1 representation |
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
- wrangler.local.jsonc applies both migrations to disposable local Wrangler state.

## Transaction constraint

Prisma's D1 adapter is not a substitute for the PostgreSQL transaction model. D1 command branches now use D1Database.batch() with conditional updates and idempotency receipts for check-in, staff actions, payment lifecycle, appointment changes, reconciliation, closing, retention, and admin writes. The local lease remains a compatibility guard for reads/legacy fallback paths. Production is still not cleared until interruption/fault-injection, concurrency, remote Worker, cron authorization, and capacity evidence is complete.

## Clean bootstrap

npm run db:seed:d1:sql runs scripts/seed-d1-bootstrap.ts. With owner-supplied environment values and D1_BOOTSTRAP_CONFIRM=YES, it emits idempotent SQL for:

- a compact editable service catalog and categories;
- skills, six active staff records, and a shared initial PIN hash;
- ADMIN and STATION accounts with Worker-compatible PBKDF2 hashes;
- skip reasons and ShopConfig with the selected IANA timezone.

It does not create appointments, payments, demo history, or import PostgreSQL data. The operator reviews the generated file before applying it to the fresh remote D1.

## Local workflow

~~~bash
npm run db:generate:all
npx wrangler d1 migrations apply wellness-salon --local --config=wrangler.local.jsonc
# Generate a reviewed SQL file only after supplying disposable local values:
D1_BOOTSTRAP_CONFIRM=YES npm run db:seed:d1:sql > /private/tmp/wellness-salon-d1-bootstrap.sql
npx wrangler d1 execute wellness-salon --local --config=wrangler.local.jsonc --file=/private/tmp/wellness-salon-d1-bootstrap.sql
npx vinext check
npm run dev:vinext
~~~

The local database is disposable and must never be treated as a production seed or data import.

## References

- [Cloudflare D1 pricing and quotas](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 Worker API and batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Prisma D1 adapter limitations](https://www.prisma.io/docs/orm/v6/overview/databases/cloudflare-d1)
