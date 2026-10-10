# Approval gates

Thư mục này cố ý không chứa credential thật. Trước production cần thêm artifact được người có quyền duyệt cho:

- domain và TLS certificate;
- AUTH_SECRET / database credentials / secret manager;
- merchant terminal integration nếu sau này scope thay đổi;
- migration destructive trên dữ liệu thật;
- production deploy và rollback window.
