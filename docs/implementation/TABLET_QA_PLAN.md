# Tablet and network QA plan — 2026-10-12

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
- The combined local Worker/D1 gate now runs the tablet project in Chromium and an optional iPad-sized WebKit project. The latest run passed 61 cases with two intentional skips; WebKit is emulation, not physical iPad evidence.
- Browser resilience E2E passed 3/3 on the tablet project: transient SSE recovery, deterministic board snapshot network failure plus Retry recovery, and same-key kiosk retry; see [`tests/e2e/resilience.spec.ts`](../../tests/e2e/resilience.spec.ts).
- Returning-guest kiosk E2E passed 2/2 for the approved full-name/read-only behavior; see [`tests/e2e/kiosk.spec.ts`](../../tests/e2e/kiosk.spec.ts).
- The local pool-constrained HTTP profile passed 350/350 operations with zero errors using Prisma `connection_limit=3`/`pool_timeout=5`; this is not staging-network evidence.
- Physical iPad, distance readability, real Wi-Fi interruption, Dynamic Type, VoiceOver, and offline submission are **NOT RUN** in this environment. WebKit emulation is covered locally.

## Manual run sheet for the next device session

1. If an older Wellness Salon Home Screen icon exists, remove it first; open the LAN URL in Safari, use Share → Add to Home Screen, then launch the new icon. Confirm the app opens without Safari chrome and that the URL uses the current manifest version.
2. Open the three roles on separate Safari tabs/devices and confirm the same business date. For the installed PWA login, verify the email/password fields are visible; if the keyboard is missing, open the same login URL in a Safari tab and record the iPadOS version.
3. Check in one staff member, create one kiosk visit, and confirm board assignment appears without a full-page refresh.
4. Accept/finish the assigned turn from the staff display while management observes the state change; Accept enters service directly.
5. Open Admin → Payments → Confirm payment. Focus the final amount, card-terminal tip, and cash-received fields one at a time; verify the same keypad expands, quick values work, and no reason field appears when the final amount differs. Confirm Card still records the terminal-confirmed tip as a numeric amount.
6. Tap kiosk submit twice and confirm one ticket; refresh or navigate away only after recording the observed result.
7. Disable Wi-Fi for 10–15 seconds on the board, then restore it; record time to `Live` and whether any stale snapshot overwrites a newer one.
8. Repeat one admin mutation during a short interruption and verify the final state before retrying.
9. Repeat in portrait and landscape, then capture screenshots for any clipping, focus, or readability issue.

For service-worker/offline checks, use HTTPS on the LAN. A plain `http://192.168.x.x` origin is not a secure context, so service-worker registration may be unavailable even when the Home Screen app shell opens.
