# Realtime on Workers

**Date:** 2026-10-12  
**Status:** SSE initial snapshot plus a 15-second bounded polling fallback is implemented; local route and browser recovery smoke passes, while deployed reconnect evidence remains pending.

## Existing contract

The board uses SSE with reconnect/backoff and a bounded polling fallback. Responses carry a board snapshot/version and public views redact protected information. Kiosk and admin surfaces expose explicit loading, retry, abort, and reset states.

## Worker plan

- Keep SSE as a bounded initial snapshot/keepalive stream; the client ignores keepalives instead of turning them into database reads.
- Keep polling as the safe 15-second fallback, with abort signals, version guards, stale-state indication, and no unbounded connection retention.
- Read board snapshots through the D1 read model and compare version progression across Worker requests.
- Do not assume WebSockets, Durable Objects, or cross-request in-memory state. Any such choice requires an explicit free-tier capacity review.
- Test disconnect, retry, stale snapshot, authorization, redaction, and rapid mutation sequences under the Worker runtime.

## Current evidence

The local D1 runtime serves `/api/board` and public pages, and the browser resilience suite exercises SSE reconnect and board retry behavior. D1 HTTP smoke also verified public redaction and versioned snapshots. Cross-request event fan-out and deployed Worker reconnect behavior remain operator smoke gates.

## Free-tier request budget

The board fallback is intentionally 15 seconds rather than 5 seconds: one continuously visible board is at most 2,880 dynamic board reads during a 12-hour day. The admin dashboard uses the same 15-second cadence while visible. SSE keepalives do not trigger a second board read; this keeps the three-tablet default comfortably below the Workers Free request and D1 read budgets when reports and mutations are included. Scheduled jobs use one `*/15 * * * *` trigger and read the UI-owned timezone from D1, so changing the UI does not require a trigger redeploy.

