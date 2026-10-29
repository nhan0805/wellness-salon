# UI/UX refresh — 2026-10-19

## 2026-10-28 — Web Interface Guidelines pass

- Added a shared keyboard skip link to every route and a stable `main-content` landmark so keyboard and assistive-technology users can bypass sticky navigation.
- Restored visible `:focus-visible` treatment for form controls, preserved the existing pastel focus ring, and removed legacy `outline: none` overrides.
- Added safe-area-aware modal padding and `overscroll-behavior: contain` so mobile dialogs do not leak scroll into the page.
- Returned focus to the work-email field after a failed sign-in, made search controls explicit search inputs with mobile search hints, and kept custom keypad paste available.
- Synced Admin section and Settings subsection navigation to URL query parameters so operational views can be refreshed, shared, and restored with browser Back/Forward.

The Vercel guideline pass did not change product behavior, API contracts, database schema, or the existing system-font performance decision.

## Visual redesign rollback — 2026-10-19

The Warm Editorial Salon OS experiment was reverted after owner review. The app is back on the previous pastel visual baseline from the operational refresh, while keeping the functional improvements that were already accepted:

- queue ticket identifiers remain one scan line on narrow screens;
- kiosk action-bar positioning and content clearance remain responsive;
- staff verification countdown announcements remain screen-reader friendly;
- the existing responsive/accessibility regression coverage remains in place.

The temporary `app/editorial-redesign.css` layer, split Home gateway, branded Sign-in narrative panel, and plum/ivory PWA theme were removed. No API, database, or authentication behavior changed.

## Mục tiêu

Giữ lại ngôn ngữ pastel ấm, dễ đọc của Wellness Salon nhưng làm các surface vận hành rõ ràng hơn, đặc biệt trên tablet và màn hình dùng chung ở salon. “Future-ready” trong app này được hiểu là hierarchy dữ liệu, trạng thái realtime, accessibility và khả năng bảo trì tốt hơn; không dùng neon, 3D hoặc animation gây nhiễu.

## Đã triển khai

- Queue ticket code giữ trên một dòng, dùng tabular/monospace figures, có ellipsis có chủ đích và native title để xem mã đầy đủ ở viewport hẹp.
- Kiosk action bar nằm trong normal flow ở desktop/tablet có đủ chiều cao, chỉ sticky ở màn hình compact; khi sticky, catalog giữ thêm clearance để card cuối không bị che.
- Countdown xác thực staff vẫn cập nhật trực quan mỗi giây nhưng screen reader chỉ nhận thông báo theo mốc phút, dưới một phút và hết hạn.
- Tách lớp CSS refinement mới tại `app/operations-refinements.css` để các quyết định UI mới không tiếp tục làm phình cascade trong `app/globals.css`.
- Giữ motion pulse rất nhẹ cho trạng thái đang sync và tắt hoàn toàn khi `prefers-reduced-motion: reduce`.
- Thêm regression assertion để mã ticket không quay lại trạng thái wrap dọc trên phone/tablet/landscape.
- Staff edit modal dùng layout riêng cho tablet và mobile: tablet đặt profile/assignment availability cạnh PIN keypad, Skills thành lưới ba cột; mobile chuyển về một cột, có vùng cuộn nội bộ và footer action sticky. Full Name là input một dòng, còn availability là switch riêng có mô tả ngắn.
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
