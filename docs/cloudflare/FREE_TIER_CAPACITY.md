# Cloudflare Free-Tier Capacity

**Date:** 2026-10-25
**Status:** Conservative single-salon model completed; the Worker now has a read-only smoke, scheduled observability runbook, and a code-level board/admin CPU reduction, while live quota/CPU metrics still require Cloudflare dashboard review.

## Published limits to design against

According to the current Cloudflare documentation:

| Resource | Free limit | Design implication |
| --- | ---: | --- |
| Worker requests | 100,000 dynamic requests/day | Bound polling/SSE reconnects and avoid background chatter. Static asset requests are not charged as Worker requests. |
| Workers HTTP/Cron CPU | 10 ms/invocation | Keep handlers and cron batches small; benchmark Argon2id separately. |
| Worker memory | 128 MB | Avoid loading large history/report results or heavyweight Node-only dependencies. |
| Worker subrequests | 50/request | Keep D1/auth/asset calls bounded. |
| Worker script size | 64 MiB | Inspect production output and avoid accidental native/runtime bundles. |
| Cron triggers | 5/account | One quarter-hour trigger is used; it dispatches both jobs from D1 configuration. |
| D1 rows read | 5 million/day | Use narrow indexed projections and bounded pagination. |
| D1 rows written | 100,000/day | Count index maintenance and mutation fan-out, not only business rows. |
| D1 storage | 5 GB/account | Fresh salon data should remain well below this, but audit/receipt retention must be bounded. |

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## Workload assumptions

The target is one salon, three shared tablets, and a 12-hour operating day. The model assumes one visible board, one visible Admin dashboard, and one kiosk; it treats all three as dynamic Worker clients. It uses the current implementation's bounded intervals:

- board fallback: one `/api/board` read every 15 seconds (2,880/day);
- Admin dashboard: four read requests per 15-second refresh cycle (11,520/day; deliberately conservative because some sections issue fewer requests);
- kiosk: three requests per customer (catalog, lookup, check-in);
- staff/queue/payment activity: eight mutation requests per customer;
- 100 extra admin/history requests, 30 auth/session requests, and 96 scheduled ticks per day;
- 25% retry/reconnect headroom applied after the base count;
- static assets excluded from the dynamic Worker request count, as documented by Cloudflare.

The per-request D1 estimates are deliberately rounded high: 45 rows for a board read, 100 rows for an Admin refresh, 65 rows per customer across kiosk and commands, and 50 rows per extra Admin request. Writes use 50 rows per customer plus 3 rows per extra Admin request, 2 per auth/session request, and 30 per executed job. Index maintenance is included in the safety multiplier rather than ignored.

## Daily projection

| Scenario | Customers/day | Dynamic Worker requests/day | D1 rows read/day | D1 rows written/day | Free-tier headroom |
| --- | ---: | ---: | ---: | ---: | --- |
| A | 50 | ~18,985 | ~1.61M | ~3,650 | Requests 81%; reads 68%; writes 96% headroom |
| B | 100 | ~19,673 | ~1.62M | ~6,775 | Requests 80%; reads 68%; writes 93% headroom |
| C | 200 | ~21,048 | ~1.63M | ~13,025 | Requests 79%; reads 67%; writes 87% headroom |

The fixed polling workload dominates this small-salon model. The request and D1 projections remain below the published Free limits even at Scenario C, but they are not a promise about arbitrary traffic: multiple continuously open boards, very large reports, repeated refreshes, or a changed polling interval can consume the margin quickly. The application keeps the board fallback at 15 seconds and ignores SSE keepalives instead of turning them into extra database reads.

The current board startup accepts the SSE snapshot as the normal first read and invokes `GET /api/board` only as a 2.5-second fallback when SSE cannot bootstrap. Subsequent board polls use the cheap D1 version check when the snapshot is unchanged. Admin Appointments no longer requests unused report aggregates, and board projections select only the fields consumed by the queue. These are code-level reductions; they do not change the Free-plan limits or replace deployed CPU measurement.

## Measured artifact and unmeasured runtime values

- `npx cf build` and `npx cf deploy --dry-run` pass. The generated Worker entry is approximately 294 KB raw / 76 KB gzip in the local output, with the Prisma query compiler shipped as a separate ~1.9 MB WASM asset; both are well below the current script and asset limits.
- Local D1 HTTP smoke passed the critical read/write paths, but local loopback does not measure Cloudflare's 10 ms CPU accounting. Login/PIN PBKDF2, report size, and remote D1 row metrics must be checked on the deployed workers.dev Worker.
- The scheduled handler uses one `*/15 * * * *` trigger, reads D1 `ShopConfig`, and performs only two business jobs per day. The other quarter-hour ticks exit after a single configuration read.

## Upgrade conditions

Stay on Free while observed daily metrics remain below the model with at least 30% operational headroom. Revisit the plan if measured dynamic requests approach 70,000/day, D1 reads approach 3.5M/day, D1 writes approach 70,000/day, or any invocation repeatedly exceeds the 10 ms Free CPU limit. A paid upgrade is not part of this migration and must be an explicit owner decision.

## Safety response

The app uses bounded retries, backpressure, page limits, stale-read tolerance where safe, and explicit degraded/read-only UI states. After deployment, inspect D1 row metrics and Workers logs daily during the first operating week; surface quota pressure before business commands fail. Do not create or upgrade a paid resource as part of this migration.

The automated read-only checks and event/metric review procedure are documented in [OBSERVABILITY.md](OBSERVABILITY.md). They are intentionally not a substitute for Cloudflare account quota alerts.

