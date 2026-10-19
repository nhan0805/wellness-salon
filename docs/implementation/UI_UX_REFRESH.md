# UI/UX refresh — 2026-10-19

## Warm Editorial Salon OS — visual redesign

The follow-up pass intentionally changes the visual identity, not just spacing:

- Replaced the repeated pastel-card treatment with a warm ivory canvas, deep plum navigation/stage surfaces, terracotta primary actions, sage success states, and lavender secondary states.
- Rebuilt the Home entry card as a split workspace gateway with an editorial display face, a primary check-in action, and a distinct live-queue action.
- Reworked the Kiosk header, progress rail, category tabs, service cards, selection tray, and confirmation surface so the flow reads as a premium service menu while staying touch-first.
- Reworked the Board around a dark “current turn” stage, a calmer up-next rail, stronger ticket scan hierarchy, and a clear sync state.
- Reworked Admin with a dark active navigation rail, warm workbench background, stronger topbar hierarchy, and bento-style KPI surfaces.
- Added a branded split Sign-in experience with an operational narrative panel and kept the existing authentication form, focus behavior, error messaging, and route logic intact.
- Added a local-only editorial display fallback and updated PWA/browser theme colors to plum/ivory. No remote font dependency was introduced.

The implementation is isolated in `app/editorial-redesign.css`, imported after the existing refinement layer. This keeps the older route-era cascade stable while making the new visual decisions easy to iterate or replace.

The visual redesign was checked with the UI/UX Pro Max design guidance and its local UX/accessibility references. The implementation keeps the project constraints: Lucide icons, no emoji UI, minimum touch targets, visible focus, reduced-motion fallback, and no API/database contract changes.

## Mục tiêu

Giữ lại ngôn ngữ pastel ấm, dễ đọc của Wellness Salon nhưng làm các surface vận hành rõ ràng hơn, đặc biệt trên tablet và màn hình dùng chung ở salon. “Future-ready” trong app này được hiểu là hierarchy dữ liệu, trạng thái realtime, accessibility và khả năng bảo trì tốt hơn; không dùng neon, 3D hoặc animation gây nhiễu.

## Đã triển khai

- Queue ticket code giữ trên một dòng, dùng tabular/monospace figures, có ellipsis có chủ đích và native title để xem mã đầy đủ ở viewport hẹp.
- Kiosk action bar nằm trong normal flow ở desktop/tablet có đủ chiều cao, chỉ sticky ở màn hình compact; khi sticky, catalog giữ thêm clearance để card cuối không bị che.
- Countdown xác thực staff vẫn cập nhật trực quan mỗi giây nhưng screen reader chỉ nhận thông báo theo mốc phút, dưới một phút và hết hạn.
- Tách lớp CSS refinement mới tại `app/operations-refinements.css` để các quyết định UI mới không tiếp tục làm phình cascade trong `app/globals.css`.
- Tách lớp visual redesign mới tại `app/editorial-redesign.css` để thay đổi nhận diện không làm lẫn với các rule responsive vận hành.
- Giữ motion pulse rất nhẹ cho trạng thái đang sync và tắt hoàn toàn khi `prefers-reduced-motion: reduce`.
- Thêm regression assertion để mã ticket không quay lại trạng thái wrap dọc trên phone/tablet/landscape.
- Giữ scheduler guard nhỏ ngay trong Worker entrypoint để Vinext dev runner không phụ thuộc resolver TypeScript ngoài app graph; production bundle và domain scheduler vẫn dùng cùng contract.

## Quy ước thiết kế

- Body text giữ tối thiểu 16px; control chính giữ touch target 48–56px.
- Lucide là icon family duy nhất; không dùng emoji làm icon.
- Status phải có text/icon đi kèm, không dựa vào màu đơn độc.
- Fixed/sticky UI phải có content clearance và không che focus.
- Motion dùng token chung và luôn có reduced-motion fallback.
- Font vẫn dùng local system stack để tránh chờ Google Fonts trên Wi-Fi salon; đây là quyết định performance có chủ đích, không phải thiếu font branding.

## Kiểm chứng cần chạy sau mỗi UI change

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e:d1
```

Manual release gate vẫn cần iPad Safari/WebKit thật, VoiceOver, Dynamic Type cỡ lớn, safe-area, touch latency và Wi-Fi loss/reconnect. Local Chromium/D1 pass không thay thế các gate phần cứng này.
