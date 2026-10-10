---
artifact_id: ASSUMPTIONS-NSM-001
type: assumptions
stage: PO
status: accepted-defaults
version: 1
created_at: 2026-10-07
source_artifacts: [PO-NSM-001]
requirement_ids: [FR-KSK-001, FR-ENG-001, FR-ADM-003]
---

# Assumptions

- V1 có một shop và một board station; schema không khóa đường mở rộng tenant sau này.
- Fairness sort theo `last_service_finished_at` tăng dần; NULL (chưa từng phục vụ) đứng trước.
- Mã lượt là `A` + số tăng dần theo business date.
- Verified staff session mặc định 3 phút, cho phép cấu hình 2–5 phút.
- Auto closing-time checkout chạy bằng scheduled job/endpoint sử dụng `ShopConfig.closing_time`.
- Payment chỉ ghi nhận sau khi merchant terminal đã hoàn tất; app không đọc thẻ.
- PostgreSQL là persistence path duy nhất; local, CI và production đều phải cung cấp `DATABASE_URL` và credential tương ứng.
