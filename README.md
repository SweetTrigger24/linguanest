# LinguaNest — học cùng nhóm, luyện đề theo kỳ thi

React + TypeScript + Tailwind / Cloudflare Pages; Supabase Auth + PostgreSQL; Worker quản lý tài khoản và học liệu R2 riêng tư.

## Chạy trên máy

Node.js 22.12+ (đã kiểm tra với Node 24). Trên PowerShell có ExecutionPolicy hạn chế, dùng `npm.cmd` thay cho `npm`.

```sh
npm ci
npm run dev
```

Không có biến môi trường Supabase: ứng dụng chạy **demo**, lưu nội dung/bài làm trong localStorage của trình duyệt. Dữ liệu này không đồng bộ giữa người dùng hoặc thiết bị. Demo không upload R2, tạo tài khoản thật hoặc đổi mật khẩu. Không dùng demo làm hệ thống nhóm chính thức. Nội dung/bài kiểm tra minh họa cũ được chuyển sang giao diện mới trong trình duyệt; nội dung demo không tự chuyển lên database.

## Chức năng

- Tài khoản nội bộ do quản trị cấp; tên đăng nhập, mật khẩu; đổi tên hiển thị và mật khẩu. Mật khẩu tạm bắt buộc đổi trước khi học. Quên mật khẩu: liên hệ quản trị, không cần SMTP.
- Bài học: tạo, sửa, lưu nháp, xem trước, xuất bản, lưu trữ và nhân bản; từ vựng nhập bằng form hoặc CSV; nhiều học liệu đính kèm.
- Đề thi: phân loại theo ngôn ngữ và kỳ thi. Mặc định IELTS/TOEIC/Cambridge, DELF/DALF/TCF, HSK/HSKK, JLPT/J.TEST; quản trị có thể thêm loại mới. Mỗi bài học có thể gắn một đề bài tập; đề luyện thi độc lập không giới hạn theo bài học.
- Đề có thời gian 1–300 phút, tối đa 200 câu; chia phần bằng trường kỹ năng; đoạn đọc/ngữ cảnh; trắc nghiệm 2–8 lựa chọn, điền đáp án, tự luận.
- Nhập CSV có mẫu, xem trước và lỗi theo dòng; bản nháp người soạn tự lưu trên máy. Lưu bản nháp lên máy chủ bằng nút Lưu để làm tiếp trên thiết bị khác.
- Đề được chấm trên PostgreSQL. Đáp án không được gửi tới học viên đang làm bài. Trắc nghiệm một đáp án; điền từ so sánh Unicode NFC, bỏ khoảng trắng thừa và không phân biệt hoa/thường, vẫn phân biệt dấu và dấu câu. Tự luận chấm thủ công, có nhận xét.
- Lưu bài làm tự động, tiếp tục từ lịch sử, kiểm tra xung đột giữa các thiết bị; đồng hồ vẫn chạy khi rời trang. Khi hết giờ, máy chủ chấm các câu đã lưu trước hạn. Không nhận thay đổi đến sau hạn; nếu mất mạng lúc hết giờ, cần kết nối lại và nộp hoặc mở lại lượt làm.
- Mỗi lượt làm giữ nguyên câu hỏi, đáp án, điểm tối đa, file đính kèm và phiên bản tại lúc bắt đầu. Sửa đề không thay đổi lượt cũ. Nộp lại một lượt đã nộp không tạo thêm điểm.
- XP tổng hợp toàn bộ lịch sử, độc lập với phân trang: 20 XP cho lần đầu hoàn thành bài học; 5 XP/điểm đề đã chấm xong. Điểm tạm tính của bài chờ tự luận chưa cộng XP. Điểm cũ được giữ lại (không thể kiểm chứng lại vì phiên bản cũ do client chấm).
- R2: upload nhiều file lần lượt, tìm kiếm, xem trước, tái sử dụng, gỡ liên kết và xóa file không dùng. MP3 ≤30 MB, PDF ≤20 MB, JPG/PNG/WebP ≤5 MB. File đang được bài học, đề hoặc lịch sử tham chiếu không thể xóa.
- Quản trị: cấp/khóa/mở tài khoản thành viên, đặt lại mật khẩu tạm, xem số bài/đề/XP của từng người và chấm tự luận.

**Điểm đề luyện tập không tự quy đổi thành band IELTS, điểm TOEIC/HSK/JLPT hoặc chứng chỉ chính thức.** Loại kỳ thi là cách phân loại; cấu trúc/nội dung do người soạn quyết định. Tự luận ở đây là câu trả lời văn bản; chưa có ghi âm/chấm Speaking. Tính năng flashcard đã bỏ khỏi ứng dụng; bảng lịch sử cũ được giữ nhưng không còn quyền truy cập từ frontend.

## Cấu hình Supabase

### Dự án mới

Chạy trong SQL Editor theo đúng thứ tự:

1. `supabase/001_schema.sql`
2. `supabase/002_seed.sql`
3. `supabase/003_learning_platform.sql`

### Nâng cấp dự án cũ

Sao lưu trước, sau đó chạy **chỉ `003_learning_platform.sql`**. Migration giữ tiến độ, kết quả quiz cũ và chuyển câu hỏi cũ thành đề bài tập theo bài học. Không chạy lại migration 001 sau 003 vì 001 chứa các chính sách phân quyền cũ.

Migration 003 đóng quyền ghi trực tiếp điểm, lịch sử, vai trò. Các thao tác đi qua RPC có kiểm tra người dùng/quyền. Đáp án và snapshot chỉ đọc qua API được kiểm soát. Tài khoản mới có trạng thái chưa duyệt mặc định; chỉ tài khoản quản trị cấp mới được kích hoạt.

Trong Supabase Authentication:

- Tắt **Allow new users to sign up** và đăng nhập ẩn danh.
- Tài khoản nội bộ do Worker tạo với `email_confirm: true`; không dùng luồng gửi thư mời/xác nhận/reset password qua email.
- Không bật yêu cầu xác thực đổi mật khẩu bằng mã gửi email cho luồng này. Worker kiểm tra mật khẩu hiện tại trực tiếp rồi đổi mật khẩu.

Tạo tài khoản quản trị đầu tiên trong Auth Dashboard với email/mật khẩu và xác nhận sẵn. Chạy SQL sau, thay email của bạn:

```sql
UPDATE public.profiles
SET role='admin', is_active=true, must_change_password=false
WHERE id=(SELECT id FROM auth.users WHERE email='YOUR_ADMIN_EMAIL');
```

Đăng nhập bằng email đó. Từ **Quản trị → Thành viên**, cấp tài khoản mới. Tên đăng nhập như `minh.nguyen` được ánh xạ nội bộ sang `minh.nguyen@users.linguanest.invalid`; không phải hộp thư thật. Không tự thay email định danh của tài khoản nội bộ qua Auth Dashboard. Tài khoản cũ dùng email vẫn đăng nhập được.

Tạo `.env` từ `.env.example`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
VITE_MEDIA_WORKER_URL=https://linguanest-media.YOUR_SUBDOMAIN.workers.dev
```

Các biến `VITE_*` xuất hiện trong frontend; **không đặt secret/service-role key hoặc mật khẩu database vào đó**.

## Worker và R2

Tạo bucket `linguanest-media`, giữ private. Sửa `media-worker/wrangler.jsonc`:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY` cùng project với frontend.
- `ALLOWED_ORIGINS`: danh sách origin chính xác, ví dụ `http://localhost:5173,https://YOUR_PROJECT.pages.dev`; không thêm dấu `/` cuối.
- Tên bucket trong R2 binding.

```sh
cd media-worker
npm ci
npm run check
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Secret chỉ nằm ở Worker. Có thể dùng legacy service-role JWT hoặc secret key mới của project. Không ghi vào wrangler.jsonc hoặc Git. Wrangler và Workers types được ghim phiên bản tương thích, có lockfile riêng.

Worker xác thực session với Supabase, đọc trạng thái thành viên và quyền quản trị từ database. Học liệu dùng URL ký ngắn hạn (15 phút), gắn với người dùng và file. Mỗi lần đọc vẫn kiểm tra tài khoản và quyền tham chiếu file; biết đường dẫn không đủ để đọc bài nháp. Người đã bắt đầu một lượt đề tiếp tục được đọc file của snapshot đó để bảo toàn lịch sử. MP3 hỗ trợ HTTP Range; giao diện tạo player mới khi đổi bài. Nếu liên kết hết hạn, bấm Tải lại file.

Upload kiểm tra kích thước theo luồng đọc và chữ ký định dạng. Nếu lưu metadata thất bại, Worker dọn file vừa upload. Nếu thao tác xóa R2 thất bại sau khi khóa metadata, file ở trạng thái `deleting`; quản trị bấm Xóa file lại để hoàn tất. Các file R2 có trước migration nhưng không gắn vào bài nào cần được kiểm tra/dọn riêng trên Dashboard.

## Triển khai Cloudflare Pages

- Build: `npm ci && npm run build`
- Output: `dist`
- Cấu hình 3 biến `VITE_*` ở môi trường production.
- Thêm origin Pages vào Worker rồi triển khai lại Worker.
- `public/_redirects` cung cấp SPA fallback.

Sau triển khai, kiểm tra bằng một admin và hai thành viên thật: đổi mật khẩu tạm, khóa tài khoản, không đọc dữ liệu của nhau, upload/nghe/tải tài liệu, tạo đề nháp/xuất bản, làm bài trên hai thiết bị, nộp và chấm tự luận. Các kiểm thử local không thay thế việc kiểm tra cấu hình trên dịch vụ thực tế.

## Kiểm thử

```sh
npm run check
npm run build
npm run validate:data
npm test
npm run test:ui
```

`npm test`: kiểm tra CSV, Worker bằng mock dịch vụ, và chạy migrations/RLS/RPC trên PostgreSQL nhúng PGlite. Auth schema được mô phỏng; không gọi project thật, không sửa dữ liệu thật.

`npm run test:ui`: Playwright dùng Microsoft Edge đã cài, chạy luồng demo ở desktop và viewport điện thoại. Nếu máy không có Edge, cài browser Playwright và đổi `channel` trong `playwright.config.ts`. Ảnh/trace lỗi lưu ở `test-results`. Server kiểm thử dùng port 4173, được mở/đóng ngay trong tiến trình kiểm thử để không treo khi dọn tiến trình Windows. Cấu hình kiểm thử ép chế độ demo, không dùng thông tin kết nối dịch vụ trong `.env`.

## Sao lưu và vận hành

- Giữ các SQL migrations và lockfile trong Git.
- Xuất PostgreSQL định kỳ bằng Supabase CLI/pg_dump theo hướng dẫn Dashboard; lưu ở nơi riêng có quyền truy cập hạn chế, thử phục hồi vào project thử nghiệm. File database không chứa nội dung R2.
- Giữ bản gốc audio/ảnh/PDF và bản sao R2 ở nơi khác. Việc lưu trữ bài học/đề không xóa lịch sử.
- Theo dõi quota Supabase, R2 và Workers; mã không tự nâng gói hoặc đặt trần hóa đơn cho tài khoản dịch vụ.
- Bản nháp tự lưu trên máy có thể mất khi xóa dữ liệu trình duyệt; lưu bản nháp lên máy chủ để giữ lâu dài.

## Cấu trúc mã

```text
src/App.tsx                  Điều hướng, bài học, luyện nghe, danh sách đề và lịch sử
src/components/Account.tsx   Hồ sơ và đổi mật khẩu
src/components/ExamPlayer.tsx Làm đề, đồng hồ, lưu bài và kết quả
src/components/ContentAdmin.tsx Soạn bài, từ vựng và đề
src/components/OperationsAdmin.tsx File, tài khoản và chấm tự luận
src/lib/api.ts               API Supabase/Worker và chọn chế độ demo
src/lib/demo.ts              Mô phỏng cục bộ, không dùng để bảo vệ dữ liệu thật
src/lib/content.ts           CSV và kiểm tra dữ liệu
supabase/003_learning_platform.sql  Migration, RLS, version, chấm điểm và tổng XP
media-worker/src/index.ts    Tài khoản nội bộ, upload và đọc/xóa R2
tests/                      Kiểm thử dữ liệu, Worker và trình duyệt
```
