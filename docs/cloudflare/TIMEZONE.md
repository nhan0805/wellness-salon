# Timezone and Scheduling

**Date:** 2026-10-13  
**Status:** Owner confirmed `Asia/Ho_Chi_Minh`; the Worker uses one UTC quarter-hour trigger and reads the current D1 timezone before deciding whether to run a job.

## Configuration rule

Runtime/bootstrap defaults now use `UTC` as a safe unconfigured sentinel. `UTC` is not the salon's final business timezone. The authoritative value is `ShopConfig.timezone`, and the owner-confirmed salon timezone is `Asia/Ho_Chi_Minh`; production traffic, closing, retention, and date-sensitive reporting still require the scheduler gate to be enabled deliberately.

The prior Vietnam fallback was removed from runtime defaults. The owner has now explicitly confirmed `Asia/Ho_Chi_Minh` for this salon; it is persisted by the reviewed local bootstrap/config path and must be written to the fresh remote D1 bootstrap.

## Required gate

Before deployment, the operator must validate and persist `Asia/Ho_Chi_Minh` in the fresh D1 ShopConfig row. The Worker must refuse or safely disable scheduled jobs when the timezone is missing/invalid or when `PRODUCTION_TIMEZONE_CONFIRMED` is false. No password, token, or secret is requested in this document.

## Covered behavior

The port must verify opening/closing boundaries, business dates, retention cutoffs, reports, appointment display, cron authorization, DST transitions where applicable, and browser/server serialization. The D1 implementation must use explicit timezone conversion at the boundary; SQLite/D1 does not provide a business timezone by itself.

## Current changes

- Added `DEFAULT_TIMEZONE = 'UTC'` as a documented bootstrap value.
- Updated schema, seed, Docker bootstrap, and empty-state defaults to avoid a hidden Vietnam production assumption.
- Added a PostgreSQL reference migration that changes only the schema default and preserves existing configured rows.
- The owner decision is complete, but no remote database has been created or written yet.

## Scheduler behavior after a UI change

Cloudflare receives `*/15 * * * *` in UTC. The Worker reads `ShopConfig.timezone` and `closing_time` from D1 on each scheduled tick. It runs retention at 03:15 in the configured local timezone and runs closing at the first quarter-hour at least five minutes after the configured closing time. Therefore changing timezone or closing time in Admin remains effective without changing application code or redeploying; the next quarter-hour tick is the boundary. Invalid or missing ShopConfig disables the jobs safely.

