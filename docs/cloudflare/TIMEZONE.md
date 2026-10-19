# Timezone and Scheduling

**Date:** 2026-10-19
**Status:** Owner confirmed `Asia/Ho_Chi_Minh`; the Worker uses one UTC quarter-hour trigger and reads the current D1 timezone before deciding whether to run a job. Local mapping/authorization tests and deployed read-only smoke pass; event-level scheduler execution remains operator-gated.

## Configuration rule

Runtime/bootstrap defaults now use `UTC` as a safe unconfigured sentinel. `UTC` is not the salon's final business timezone. The authoritative value is `ShopConfig.timezone`, and the owner-confirmed salon timezone is `Asia/Ho_Chi_Minh`; production traffic, closing, retention, and date-sensitive reporting still require the scheduler gate to be enabled deliberately.

The prior Vietnam fallback was removed from runtime defaults. The owner has now explicitly confirmed `Asia/Ho_Chi_Minh` for this salon; the deployed remote D1 service catalog reports that timezone and the remote scheduler behavior still needs an approved event-level check.

## Required gate

Before unattended scheduler operations, the operator must validate and preserve `Asia/Ho_Chi_Minh` in the deployed D1 ShopConfig row, inspect one Cloudflare scheduled-event log, and configure an alert destination. The Worker must refuse or safely disable scheduled jobs when the timezone is missing/invalid or when `PRODUCTION_TIMEZONE_CONFIRMED` is false. No password, token, or secret is requested in this document.

## Covered behavior

The port must verify opening/closing boundaries, business dates, retention cutoffs, reports, appointment display, cron authorization, DST transitions where applicable, and browser/server serialization. The D1 implementation must use explicit timezone conversion at the boundary; SQLite/D1 does not provide a business timezone by itself.

## Current changes

- Added `DEFAULT_TIMEZONE = 'UTC'` as a documented bootstrap value.
- Updated D1 schema, bootstrap, and empty-state defaults to avoid a hidden Vietnam production assumption.
- The owner decision is complete and the deployed remote D1 catalog reports `Asia/Ho_Chi_Minh`; a scheduled-event execution check remains open and must be observed from Cloudflare's scheduler/event tooling rather than invoked as a production data mutation by an automated smoke.

## Scheduler behavior after a UI change

Cloudflare receives `*/15 * * * *` in UTC. The Worker reads `ShopConfig.timezone` and `closing_time` from D1 on each scheduled tick. It runs retention at 03:15 in the configured local timezone and runs closing at the first quarter-hour at least five minutes after the configured closing time. Therefore changing timezone or closing time in Admin remains effective without changing application code or redeploying; the next quarter-hour tick is the boundary. Invalid or missing ShopConfig disables the jobs safely.

