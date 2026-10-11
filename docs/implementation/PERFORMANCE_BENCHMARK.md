# Performance and resilience evidence — 2026-10-10

## Scope and safety

These measurements used a disposable native PostgreSQL cluster and a production build connected only to that cluster. The cluster was stopped after the run. No application Docker container, production database, deployment, schema, or dependency was changed.

The scale fixture was created with:

```text
18,000 historical appointments across the previous 30 days
2,000 appointments on the benchmark business date
20,000 customers and appointment-service snapshots
300 assigned turn records
```

The fixture helper is [`scripts/seed-benchmark-fixture.ts`](../../scripts/seed-benchmark-fixture.ts) and is disposable-only. Do not run it against the application database.

## Database benchmark

Command:

```text
DATABASE_URL=<disposable-db-url> BENCHMARK_ITERATIONS=20 BENCHMARK_WARMUP=2 npm run benchmark:db
```

Results from 20 measured iterations after 2 warmups:

| Operation | Payload | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| `board.private` | 3,899 bytes | 73.70ms | 107.89ms | 107.89ms |
| `appointments.filtered` (legacy full read) | 1,515,072 bytes | 96.08ms | 104.48ms | 104.48ms |
| `appointments.page` (25-row projection) | 34,360 bytes | 5.16ms | 6.34ms | 6.34ms |
| `report.day` | 386 bytes | 4.43ms | 5.32ms | 5.32ms |
| `report.month` | 1,085 bytes | 15.65ms | 16.27ms | 16.27ms |

The new `appointments.page` path is the one used by the admin history screen and now applies filters, bounded pagination, summary aggregates, deterministic ordering, and a lean response projection in the service/API layer. Compared with the legacy full-read path in the same run, the page payload is about 97.7% smaller and p95 is about 94% lower. These are service-layer timings on local hardware, not production SLOs.

## Concurrent read/write load profile

Command:

```text
DATABASE_URL=<disposable-db-url> LOAD_PROFILE_ALLOW_DISPOSABLE=true LOAD_PROFILE_CLIENTS=3 LOAD_PROFILE_CYCLES=10 npm run load:profile
```

The disposable-only profile ran three concurrent service-layer clients for ten cycles. Each cycle issued board/history/report reads concurrently, then one transactional kiosk check-in write per client. The script cleaned up its temporary customers, appointments, and receipts before disconnecting.

| Operation | Count | p50 | p95 | p99 | Max | Errors |
|---|---:|---:|---:|---:|---:|---:|
| `board.read` | 30 | 92.40ms | 152.20ms | 170.98ms | 170.98ms | 0 |
| `history.read` | 30 | 9.58ms | 35.97ms | 37.15ms | 37.15ms | 0 |
| `report.read` | 30 | 6.59ms | 22.24ms | 22.79ms | 22.79ms | 0 |
| `check-in.write` | 30 | 37.38ms | 78.53ms | 128.86ms | 128.86ms | 0 |

Seven structured `db.advisory_lock.wait` events exceeded the 10ms warning threshold during the run; the largest observed wait was 56.87ms. This is evidence of lock behavior under a small local disposable profile, not a production capacity limit. The profile does not exercise authenticated HTTP middleware, browser rendering, a saturated connection pool, or real three-device network conditions.

## Query-plan observations

The primary board/date/status query used `appointments_business_date_status_idx` and completed in 0.563ms with 2,000 rows in the scale fixture. The month-range appointment query used the business-date/code index and completed in 2.219ms for 7,400 rows. The service-snapshot join completed in 2.645ms and used a sequential scan over 20,000 small fixture rows; no index change is justified from this run alone.

The main measured issue was response shape: the legacy filtered appointment read returned about 1.51MB because `appointmentInclude` included broad customer/service/turn/payment/turn data before some filtering/sorting was completed in application code. The admin history path now uses `getDbAppointmentsPage` with a bounded 25-row page and `historyAppointmentInclude`; the legacy service function remains for compatibility and benchmark comparison. Duration sorting still performs a lightweight summary read across matching appointments because duration is derived from service snapshots rather than stored as a queryable total.

## HTTP smoke

The production build ran on `127.0.0.1:3101` against the same disposable database. Three concurrent clients each issued ten `GET /api/board` requests:

```text
30/30 responses: HTTP 200
p50: 114.59ms
p95: 219.84ms
max: 221.13ms
request-id echo: 30/30
```

This is a bounded loopback smoke, not a network, three-device, or capacity test. It does confirm that the request-ID propagation and structured API timing logs operate under concurrent reads.

## Authenticated HTTP load profile

The disposable-only `scripts/http-load-profile.ts` started the production build on `127.0.0.1:3102`, logged one admin browser context in, and exercised three role flows concurrently: management admin reads, public turn-board reads, and kiosk service/lookup/check-in. Each flow ran ten cycles. The script refused non-local application/database targets and cleaned its temporary customers, appointments, and receipts before exit.

Command:

```text
DATABASE_URL=<disposable-db-url> HTTP_LOAD_PROFILE_ALLOW_DISPOSABLE=true HTTP_LOAD_PROFILE_BASE_URL=http://127.0.0.1:3102 HTTP_LOAD_PROFILE_CLIENTS=3 HTTP_LOAD_PROFILE_CYCLES=10 npm run load:http
```

Results: 70 HTTP operations, zero errors, and expected statuses for all operations (`200` reads and `201` check-ins). p50/p95 timings were: management appointments `9.25/36.26ms`, management reports `7.18/34.62ms`, management config `6.71/31.91ms`, board `7.58/30.20ms`, kiosk services `2.09/25.91ms`, customer lookup `1.61/8.65ms`, and kiosk check-in `11.03/45.83ms`. A lightweight `pg_stat_activity` sample observed a maximum of 13 database connections and 3 active connections during the run; this is an activity sample, not proof of pool saturation capacity.

This confirms local authenticated HTTP behavior against a disposable database only. It does not establish production network latency, browser rendering cost, SSE connection capacity, or a production connection-pool SLO.

## Pool-constrained authenticated HTTP profile

The same production build was rerun against a fresh disposable PostgreSQL cluster with Prisma `connection_limit=3` and `pool_timeout=5`. This is a local pool-constrained baseline, not a staging network or production capacity test.

Command:

```text
NEXTAUTH_URL=http://127.0.0.1:3102 DATABASE_URL=<disposable-db-url>?connection_limit=3\&pool_timeout=5 HTTP_LOAD_PROFILE_ALLOW_DISPOSABLE=true HTTP_LOAD_PROFILE_BASE_URL=http://127.0.0.1:3102 HTTP_LOAD_PROFILE_CLIENTS=3 HTTP_LOAD_PROFILE_CYCLES=50 npm run load:http
```

Results: 350 HTTP operations (7 operation types × 50 cycles), zero errors, and expected statuses for all reads/writes. p50/p95/p99 timings were: admin appointments `11.23/26.40/33.47ms`, admin reports `8.87/18.36/21.59ms`, admin config `7.82/19.39/21.47ms`, board `7.19/17.75/25.86ms`, kiosk services `2.01/4.94/19.09ms`, customer lookup `1.45/6.42/10.93ms`, and kiosk check-in `10.41/45.44/50.12ms`. The lightweight activity sample observed a maximum of 6 database connections total and 2 active connections; fixture cleanup verified 0 customers, 0 appointments, and 0 command receipts.

The run confirms the critical flows remain successful with a small Prisma pool on local loopback. It does not establish behavior under a real staging proxy, WAN latency, connection exhaustion, or production lock/pool SLOs.

## Browser resilience

[`tests/e2e/resilience.spec.ts`](../../tests/e2e/resilience.spec.ts) passed 3/3 on the tablet Playwright project:

1. The first SSE request is aborted; the board exposes `Reconnecting` and then returns to `Live` after the next connection.
2. The board snapshot endpoint is made unavailable, the tablet UI shows a recoverable error and `Retry`, then returns to `Live` after the route is restored.
3. Two concurrent kiosk submissions with the same idempotency key both return `201` and the same `appointmentId`.

This is deterministic browser network emulation at the iPad viewport, not a physical iPad or Wi-Fi measurement. Still open: physical iPad/WebKit, real Wi-Fi loss/recovery, offline submission, refresh during an in-flight mutation, production lock-wait behavior, connection-pool saturation on staging/deployment, and deployed-network latency.
