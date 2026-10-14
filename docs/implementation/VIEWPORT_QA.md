# Tablet viewport QA — 2026-10-10

## Scope

The test app ran against disposable local D1 through the Worker-compatible runtime. Chromium viewport emulation was used at 810×1080 (portrait) and 1080×810 (landscape) for the kiosk, public board, sign-in, and authenticated admin dashboard.

The screenshots were captured in `/private/tmp` during the audit:

- `wellness-kiosk-portrait.png`, `wellness-kiosk-landscape.png`
- `wellness-board-portrait.png`, `wellness-board-landscape.png`
- `wellness-signin-portrait.png`, `wellness-signin-landscape.png`
- `wellness-admin-portrait.png`, `wellness-admin-landscape.png`

## Measured results

| Viewport | Route group | Horizontal overflow | Primary interactive controls |
|---|---|---:|---:|
| 810×1080 | Kiosk, board, sign-in, admin | None (`scrollWidth = clientWidth`) | ≥44px in reviewed surfaces; admin brand link is a non-primary 42px-wide link |
| 1080×810 | Kiosk, board, sign-in, admin | None (`scrollWidth = clientWidth`) | ≥44px in reviewed surfaces |

The vertical page lengths are expected for tablet workflows: kiosk 1,118/1,131px, board 1,106/891px, and admin 1,550/1,493px for portrait/landscape respectively. These values imply scrolling, not clipping or horizontal overflow.

## Observations

### Customer kiosk

- Portrait shows all four service cards and the disabled Continue CTA in the initial viewport.
- Landscape shows the two-column catalog cleanly, but the second card row and Continue CTA continue below the 810px viewport. Validate whether the salon wants a sticky bottom CTA for landscape use.
- Service cards have clear icon/title/price/duration hierarchy and large touchable surfaces.

### Staff turn board

- Portrait prioritizes Current turns and places Up next below it; this is readable but requires a vertical scroll to see the queue after the active panel.
- Landscape uses a two-column current/up-next layout and makes the queue visible without horizontal scrolling.
- The public state shown in the screenshot redacts customer identity to `Guest A001`, consistent with the privacy implementation.

### Sign-in

- Portrait stacks the brand/secure-access visual above a centered form card; the form fits the viewport.
- Landscape uses a clear split visual/form layout; labels and primary action are visible without scrolling.

### Management tablet

- Landscape provides the clearest operations layout: persistent sidebar, topbar actions, KPI grid, revenue card, and recent activity are all visually organized.
- Portrait switches to a horizontal module strip. The first modules are visible, but module discoverability is weaker because later modules require horizontal scrolling with no explicit scroll affordance. This is a P1 UX follow-up, not a functional failure.
- KPI cards, date controls, refresh, and Open turn board actions remained within the viewport and measured touch-safe.

## Limitations and next validation

- WebKit was unavailable in the local Playwright cache, so this is Chromium emulation rather than Safari/WebKit or physical iPad hardware.
- Dynamic Type/largest text, VoiceOver, real touch latency, safe-area behavior on a notched device, and Wi-Fi loss/reconnect were not tested.
- The black circular Next.js development indicator visible in screenshots is tooling chrome, not application UI.
