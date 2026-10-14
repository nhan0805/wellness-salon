# Chạy local

## Worker + D1 (đường chạy duy nhất)

Cloudflare Worker + D1 là runtime local và cổng kiểm chứng duy nhất của dự án. Không cần database server riêng.

Để chạy ứng dụng Worker-compatible với local D1:

```bash
npm install
npm run db:generate
npm run dev
```

Mở `http://127.0.0.1:3001`. Để chạy toàn bộ cổng kiểm chứng disposable, gồm build Worker, apply migrations, bootstrap dữ liệu và Playwright E2E:

```bash
npm run test:e2e:d1
```

State D1 của E2E là disposable và không được trỏ vào database production. Credential test lấy từ các biến `D1_TEST_*` nếu cần override.

## Kiểm tra flow

1. Mở `/kiosk`, chọn service đang active trong D1, nhập thông tin khách hàng.
2. Mở `/board` để xem live queue. Board dùng SSE và polling fallback; đăng nhập station khi cần thao tác.
3. Vào `/admin`, mở Payments và xác nhận CARD/CASH sau khi lượt chuyển PAYMENT_PENDING.
4. Trong `/admin`, Attendance cho phép check-in/out; Customers, Staff và Services hỗ trợ lifecycle an toàn.
5. Mở Dashboard hoặc Reports để xem doanh thu, payment split và reconciliation theo business date.

## Jobs

Worker có cron quarter-hour và đọc timezone/closing time hiện tại từ `ShopConfig` trong D1. Không cần cron local riêng khi chạy deployment Cloudflare.

Để trigger thủ công local khi cần debug:

```bash
CLOSING_URL="http://127.0.0.1:3001/api/jobs/closing" \
CRON_SECRET="your-configured-secret" \
zsh scripts/trigger-closing.sh
```

Retention dùng cùng cơ chế bảo vệ `CRON_SECRET` tại `POST /api/jobs/retention`; không chạy trên production cho đến khi retention window, backup/restore và approval vận hành được xác nhận.

## Cấu hình

Các giá trị Worker local nằm trong `wrangler.local.jsonc`. `.env.example` chỉ chứa các biến bootstrap/secret cần thiết; không in nội dung `.env` và không dùng local test để mutate remote D1.
