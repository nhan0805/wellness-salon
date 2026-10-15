# Release checklist

The only active database-backed release path is Cloudflare Worker + D1. Local verification uses disposable D1; remote changes require explicit approval.

## Implementation evidence

- [x] `prisma/d1/schema.prisma` and both D1 migrations are the sole schema/migration source.
- [x] Worker `DB` binding, D1 adapter, query-compiler WASM, and missing-binding failure path are implemented.
- [x] Critical writes use D1 batches, guarded predicates, leases, command receipts, and audit records.
- [x] Worker-compatible PBKDF2/HS256 auth, session-version revalidation, and D1 lockouts are implemented.
- [x] Kiosk, board, staff, admin, payments, reports, closing, retention, and public-redaction paths are covered by unit/HTTP/Worker tests.
- [x] Admin reads and mutations have bounded client deadlines, cancellation/stale-response guards, visible Retry/error states, and partial Dashboard refresh handling.
- [x] `npm run test:e2e:d1` is the repeatable local gate and does not target remote D1.
- [x] No production D1 reset, custom domain, or remote data import was performed during local verification.

## Commands

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build:vinext
npm run test:e2e:d1
npx cf deploy --dry-run
```

## Remaining approval gates

- [ ] D1 interruption/failure-injection and broader concurrency matrix.
- [ ] Authenticated remote Worker mutation, SSE recovery, scheduler, and capacity smoke.
- [ ] D1 export/restore rehearsal and retention/closing operational review.
- [ ] Physical iPad/WebKit, real-network, offline, accessibility, and PWA review.
- [ ] Production secrets, domain/TLS, scheduler alerting, and owner approval.

## Stop conditions

Do not call the system production-ready from local E2E alone. Do not point local tests at remote D1, print `.env`, or bypass the Worker `DB` binding.
