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
- [x] `npm run d1:recovery:rehearsal` exports and restores representative disposable D1 data without touching production.
- [x] `npm run smoke:remote` verifies public and authenticated admin read-only production paths without business mutations.
- [x] The Worker/D1 E2E suite passes in Chromium, tablet Chromium, and WebKit; route-interception tests block the PWA service worker.

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
- [ ] One approved authenticated remote mutation flow, deployed SSE reconnect, scheduler event, and live capacity observation.
- [x] Disposable D1 export/restore rehearsal; [ ] protected remote export/restore and retention/closing operational review.
- [ ] Physical iPad, real-network interruption, offline, Dynamic Type/VoiceOver, and installed-PWA review. WebKit emulation is complete.
- [x] Required Worker secrets are present (`AUTH_SECRET`, `CRON_SECRET`); [ ] domain/TLS, scheduler alerting, and final owner approval.

## Stop conditions

Do not call the system production-ready from local E2E alone. Do not point local tests at remote D1, print `.env`, or bypass the Worker `DB` binding.
