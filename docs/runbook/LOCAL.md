# Chạy local

## PostgreSQL bắt buộc

```bash
cp .env.example .env
# Điền secret, credential seed và DATABASE_URL trong .env.
# Nếu chạy trực tiếp qua HTTP localhost, đổi NEXTAUTH_URL=http://localhost:3000
# và AUTH_COOKIE_SECURE=false; production HTTPS phải giữ AUTH_COOKIE_SECURE=true.
docker compose --env-file .env -f docker/docker-compose.yml up -d --build
curl -fsS http://localhost:3000/api/health
```

Compose khởi động PostgreSQL, chạy migration + seed, rồi mới mở app ở port 3000. Healthcheck là `/api/health`; dashboard, kiosk catalog và board đều lấy dữ liệu từ database.

Nếu chạy Next.js ngoài Docker, dùng PostgreSQL có sẵn và chạy:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Kiểm tra flow

1. Mở `/kiosk`, chọn service đang active trong database, nhập thông tin khách hàng.
2. Mở `/board` để xem live queue mà không cần đăng nhập. Board tự lấy lại dữ liệu mỗi 3 giây, nên khách mới check-in sẽ xuất hiện mà không cần reload trang. Đăng nhập station bằng credential trong `.env` khi cần thao tác, rồi dùng PIN staff trong `.env` để finish/skip hoặc check-in/out.
3. Vào `/admin`, mở Payments và xác nhận CARD/CASH sau khi lượt chuyển PAYMENT_PENDING.
4. Trong `/admin`, Attendance cho phép check-in/out và chạy closing review; Customers, Staff và Services có Add/Edit cùng lifecycle an toàn (customer có lịch sử không xóa cứng, staff/service deactivate/archive).
5. Trong `/admin`, Services có hai lớp quản lý: category có thứ tự/trạng thái archive và service có icon, category, skills, duration, price; kiosk nhóm service theo category. Customers mở được history theo filter ngày/status; Appointments có menu `...` cho payment, history, change service, reassignment, override và cancellation.
6. Mở Dashboard hoặc Reports, chọn `Business date` để xem system revenue, card/cash split, revenue by service/staff và reconciliation của ngày đó. Trong Appointments, Day/Month tự tải khi chọn; Range tự tải khi hai ngày hợp lệ. Queue và Payments vẫn hiển thị ngày hiện tại.
7. Payment history cho phép admin kiểm tra audit trail; adjustment/correction/refund chỉ ghi nhận thao tác terminal bên ngoài, không xử lý card data trong app.

## Tự động Checkout Staff (Closing Job)

Hệ thống cung cấp API `POST /api/jobs/closing` để tự động checkout staff khi hết ngày.
Secret phải được đặt qua `CRON_SECRET` trong `.env`; không có fallback.

### Chạy thủ công (Local)
Sử dụng script trigger:
```bash
zsh scripts/trigger-closing.sh
```

Có thể ghi đè endpoint hoặc secret bằng biến môi trường:
```bash
CLOSING_URL="http://localhost:3000/api/jobs/closing" \
CRON_SECRET="your-configured-secret" \
zsh scripts/trigger-closing.sh
```

Script fail khi server không kết nối được, timeout hoặc API trả HTTP 4xx/5xx.

## Retention Job

Hệ thống cung cấp `POST /api/jobs/retention` để dọn các `VerifiedStaffSession` và `CommandReceipt` hết hạn theo policy. Endpoint nhận `CRON_SECRET` hoặc admin session; app không tự chạy scheduler và không tự retry. Trước production, operator phải cấu hình lịch chạy, retry/alerting và secret rotation ở lớp triển khai.

Không chạy retention trên production cho đến khi retention window, backup/restore và approval vận hành được xác nhận.

### Ví dụ scheduler bên ngoài cho Closing
Để tự động chạy mỗi ngày vào lúc 21:00, thêm dòng sau vào crontab (`crontab -e`):
```cron
0 21 * * * CRON_SECRET="your-secret" /bin/zsh /path/to/wellness-salon/scripts/trigger-closing.sh >> /path/to/wellness-salon/closing.log 2>&1
```

Retention cần một request scheduler riêng tới `/api/jobs/retention`; không dùng lại dòng trigger closing ở trên.

Sau khi sửa biến môi trường trong `.env` hoặc `docker/docker-compose.yml`, dùng `docker compose --env-file .env -f docker/docker-compose.yml up -d --build` để recreate container; `restart` chỉ khởi động lại container hiện tại và không áp dụng giá trị environment mới. Kiểm tra `docker compose --env-file .env -f docker/docker-compose.yml ps` và `curl -fsS http://127.0.0.1:3000/api/health`; không in nội dung `.env`.
