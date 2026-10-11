# Tablet and network QA plan — 2026-10-10

## Proposed test target

The MVP should be signed off on at least one 10.9–11 inch iPad running the supported iPadOS/Safari version, in both portrait and landscape. The three shared roles should be exercised together:

1. Management tablet: authenticated `/admin` session.
2. Staff turn display: `/board` with a readable distance of approximately 2–3 metres.
3. Customer kiosk: `/kiosk` with touch keyboard and automatic reset.

Use the salon Wi-Fi in both normal conditions and a controlled interruption. A 5 GHz network is preferred for the primary run; a 2.4 GHz or weaker-signal position is useful as a resilience check. Do not use a production database for this test until backup/restore and rollback approval are complete.

## Acceptance criteria

| Area | Pass condition |
|---|---|
| Layout | No horizontal clipping or hidden sticky actions in portrait or landscape. |
| Touch | Primary controls are at least 44×44 CSS pixels and provide visible pressed/disabled feedback. |
| Kiosk | Service selection, full-name returning lookup, check-in, duplicate tap, reset, and error retry remain understandable without staff help. |
| Board | Ticket code and current/up-next hierarchy are readable from the target distance; stale/reconnecting state is visible. |
| Management | Attendance, queue, appointment, and payment actions remain usable with the software keyboard and after a refresh. |
| Network | A transient board disconnect returns to `Live`; a check-in retry does not create a duplicate appointment; an interrupted admin action shows a recoverable result. |
| Accessibility | Labels, focus order, keyboard dismissal, contrast, and status meaning do not depend on color alone. |

## Evidence already available

- Chromium tablet emulation passed at 810×1080 and 1080×810 with no horizontal overflow and primary controls at least 44px; see [`VIEWPORT_QA.md`](VIEWPORT_QA.md).
- Browser resilience E2E passed 3/3 on the tablet project: transient SSE recovery, deterministic board snapshot network failure plus Retry recovery, and same-key kiosk retry; see [`tests/e2e/resilience.spec.ts`](../../tests/e2e/resilience.spec.ts).
- Returning-guest kiosk E2E passed 2/2 for the approved full-name/read-only behavior; see [`tests/e2e/kiosk.spec.ts`](../../tests/e2e/kiosk.spec.ts).
- The local pool-constrained HTTP profile passed 350/350 operations with zero errors using Prisma `connection_limit=3`/`pool_timeout=5`; this is not staging-network evidence.
- Physical iPad/WebKit, distance readability, real Wi-Fi interruption, Dynamic Type, and offline submission are **NOT RUN** in this environment.

## Manual run sheet for the next device session

1. Open the three roles on separate Safari tabs/devices and confirm the same business date.
2. Check in one staff member, create one kiosk visit, and confirm board assignment appears without a full-page refresh.
3. Accept/finish the assigned turn from the staff display while management observes the state change; Accept enters service directly.
4. Tap kiosk submit twice and confirm one ticket; refresh or navigate away only after recording the observed result.
5. Disable Wi-Fi for 10–15 seconds on the board, then restore it; record time to `Live` and whether any stale snapshot overwrites a newer one.
6. Repeat one admin mutation during a short interruption and verify the final state before retrying.
7. Repeat in portrait and landscape, then capture screenshots for any clipping, focus, or readability issue.
