# Quy ước làm việc với LinguaNest

Các hướng dẫn này áp dụng cho toàn bộ repository và đi cùng mã nguồn khi chuyển máy.

## Bắt đầu một yêu cầu

- Đọc `README.md` trước khi sửa project; dùng phần bắt đầu trên máy khác, bản đồ project và mapping yêu cầu để tìm đúng mã nguồn/test. Đối chiếu code hiện tại nếu tài liệu chưa khớp.
- Phân biệt frontend demo/localStorage với frontend cloud, Supabase SQL và Cloudflare Worker/R2. Không suy ra trạng thái triển khai dịch vụ thật từ file cấu hình hoặc số migration trong repo.

## Yêu cầu của chủ dự án: luôn cập nhật README

- Mỗi lần thực hiện yêu cầu thay đổi project, phải cập nhật `README.md` ngay trong cùng lần làm việc, kể cả thay đổi nhỏ hoặc chỉ sửa hướng dẫn.
- Sửa các mục hiện hành có liên quan: chức năng, menu/quyền, mapping file/hàm, dữ liệu/API, cấu hình, migration, cách chạy/triển khai và kiểm thử. Không chỉ thêm nhật ký trong khi hướng dẫn cũ vẫn sai.
- Ghi ngắn gọn thay đổi và cách đã kiểm tra; phân biệt kết quả vừa chạy với lịch sử kiểm thử, mock/local với dịch vụ thật. Không ghi một lệnh đã đạt nếu chưa chạy hoặc chưa có bằng chứng.
- Không coi công việc hoàn tất khi README còn lệch với mã nguồn. Giữ quy ước này trong cả `AGENTS.md` và phần đầu README để các phiên/máy khác tiếp tục áp dụng.

## Khi triển khai thay đổi

- UI gọi dữ liệu qua `src/lib/api.ts`; khi đổi nghiệp vụ, đối chiếu cả demo trong `src/lib/demo.ts` và SQL/Worker tương ứng. Điều hướng dùng state trong `src/App.tsx`.
- Giữ dữ liệu cũ, snapshot lượt làm, revision chống xung đột và phân quyền ở server; không chỉ ẩn nút UI để bảo vệ dữ liệu.
- Với database đã triển khai, thêm migration tiến tới theo số kế tiếp trong repo; cập nhật thứ tự SQL trong README và `tests/database.test.mjs`. Migration 005 chỉ dành cho Supabase Storage cũ; file hiện dùng R2.
- Không sửa đầu ra `dist/`, `node_modules/`, `.wrangler/`, `test-results/`, `playwright-report/` như mã nguồn. Không đưa `.env`, `.dev.vars`, secret hoặc service-role key vào Git/README/frontend.
- Chạy kiểm tra đúng phạm vi theo README. Nếu chỉ thay tài liệu, đối chiếu đường dẫn, symbol, script, cấu hình và migration; không cần chạy lại toàn bộ build/UI. Không sửa file trong khi đang chạy UI tests vì Vite có thể reload trang.
