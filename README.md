# LinguaNest — học cùng nhóm, luyện đề theo kỳ thi

**Quy ước bảo trì theo yêu cầu của chủ dự án:** mỗi lần thay đổi project, phải cập nhật README ngay trong cùng lần làm việc. Điều chỉnh các mục liên quan đến chức năng, mapping mã nguồn, dữ liệu, cấu hình, triển khai và kiểm thử để phản ánh đúng thay đổi; nếu thay đổi nhỏ không ảnh hưởng các mục này, ghi ngắn gọn nội dung thay đổi và cách kiểm tra. Không coi công việc đã hoàn tất khi README còn lệch với mã nguồn.

React + TypeScript + Tailwind / Cloudflare Pages; Supabase Auth + PostgreSQL; Worker quản lý tài khoản và học liệu Cloudflare R2 riêng tư.

README này vừa hướng dẫn vận hành, vừa là bản đồ để đọc và sửa project. Bản đồ được đối chiếu với mã nguồn ngày **25/10/2026**; đây không phải xác nhận rằng các dịch vụ đã được triển khai hoặc cấu hình trên tài khoản thật.

**Tra cứu nhanh:** [Bản đồ project](#project-map) · [Mapping yêu cầu → nơi sửa](#change-map) · [Hợp đồng dữ liệu và luồng xử lý](#data-flows) · [Quy trình thay đổi và kiểm tra](#change-workflow). Phần chạy local, cấu hình Supabase/R2 và thao tác soạn nội dung nằm bên dưới.

Định hướng hiện tại: web cho nhóm nhỏ khoảng 10 người, tài khoản nội bộ do admin cấp, học lý thuyết/từ vựng/nghe và luyện đề tự soạn. **R2 là nơi lưu file; Supabase chỉ dùng Auth, PostgreSQL và metadata file.** Flashcard đã bỏ khỏi luồng sử dụng. Chưa có app native, service worker để học offline hoặc cơ chế đồng bộ dữ liệu demo lên cloud.

## Chạy trên máy

Node.js 22.12+ (đã kiểm tra với Node 24). Trên PowerShell có ExecutionPolicy hạn chế, dùng `npm.cmd` thay cho `npm`.

```sh
npm ci
npm run dev
```

Không có biến môi trường Supabase: ứng dụng chạy **demo**, lưu nội dung/bài làm trong localStorage của trình duyệt. Dữ liệu này không đồng bộ giữa người dùng hoặc thiết bị. Demo không upload Cloudflare R2, tạo tài khoản thật hoặc đổi mật khẩu. Không dùng demo làm hệ thống nhóm chính thức. Nội dung/bài kiểm tra minh họa cũ được chuyển sang giao diện mới trong trình duyệt; nội dung demo không tự chuyển lên database.

## Chức năng

- Tài khoản nội bộ do quản trị cấp; tên đăng nhập, mật khẩu; đổi tên hiển thị, ảnh đại diện và mật khẩu. Ảnh JPG/PNG/WebP tối đa 2 MB, chọn/thay/xóa để xem trước; bấm **Lưu hồ sơ** để áp dụng cả tên và ảnh. **Hủy thay đổi** khôi phục hồ sơ đã lưu; có cảnh báo khi rời trang còn thay đổi. Ảnh đã lưu hiển thị ở hồ sơ và góc dưới sidebar. Mật khẩu tạm bắt buộc đổi trước khi học. Quên mật khẩu: liên hệ quản trị, không cần SMTP.
- Nghe ngay trong bài học: khối có transcript hiển thị ô chép lại, đối chiếu và mở transcript; dùng audio đính kèm hoặc giọng đọc mẫu theo ngôn ngữ nếu khối chưa có MP3. Không còn trang hoặc mục menu Luyện nghe riêng. Đối chiếu bản chép chỉ phục vụ tự học, không lưu điểm/XP.
- Bài học: tạo, sửa, lưu nháp, xem trước, xuất bản, lưu trữ và nhân bản; từ vựng nhập bằng form hoặc CSV; nhiều học liệu đính kèm. Editor có ba tab Nội dung / Bài tập luyện tập / Xem trước; câu hỏi được soạn, nhân bản, xóa có xác nhận, đổi thứ tự và xem trước trực tiếp.
- Luyện tập bài học: giao diện thẻ teal, tiến độ, gợi ý, kiểm tra từng câu, số lần thử, giải thích, nhiều đáp án hợp lệ do người soạn khai báo, tổng kết và làm lại. Tự lưu câu trả lời, tiếp tục từ lịch sử ngay trong bài học; mặc định không có đồng hồ. Không cộng XP cho lượt luyện tập mới, tránh cộng trùng với hoàn thành lý thuyết.
- Đề thi: phân loại theo ngôn ngữ và kỳ thi. Mặc định IELTS/TOEIC/Cambridge, DELF/DALF/TCF, HSK/HSKK, JLPT/J.TEST; quản trị có thể thêm loại mới. Bài tập kiến thức nằm ngay trong bài học; danh sách Đề thi chỉ dành cho đề chứng chỉ, đề mô phỏng và bài kiểm tra tổng hợp. Liên kết bài học với một đề kiểm tra chuyên dụng vẫn được giữ.
- Đề thi thử 1–300 phút hoặc luyện tập không giới hạn giờ, tối đa 200 câu; có phần, nhóm dùng chung học liệu và câu hỏi. Hỗ trợ chọn một/nhiều đáp án, điền từ, nhiều ô trống, nối thông tin và tự luận.
- Nhập CSV có mẫu, xem trước và lỗi theo dòng; bản nháp người soạn tự lưu trên máy. Lưu bản nháp lên máy chủ bằng nút Lưu để làm tiếp trên thiết bị khác.
- Đề được chấm trên PostgreSQL. Đáp án không được gửi tới học viên đang làm bài. Trắc nghiệm nhiều đáp án chỉ nhận điểm khi chọn đúng toàn bộ tập đáp án. Điền nhiều ô/nối chia đều điểm cho các mục (điểm tối đa phải chia hết số mục); điền từ so sánh Unicode NFC, bỏ khoảng trắng thừa và không phân biệt hoa/thường, vẫn phân biệt dấu và dấu câu. Tự luận chấm thủ công, có nhận xét.
- Lưu bài làm tự động, tiếp tục từ lịch sử, kiểm tra xung đột giữa các thiết bị; đồng hồ vẫn chạy khi rời trang. Khi hết giờ, máy chủ chấm các câu đã lưu trước hạn. Không nhận thay đổi đến sau hạn; nếu mất mạng lúc hết giờ, cần kết nối lại và nộp hoặc mở lại lượt làm.
- Mỗi lượt làm giữ nguyên câu hỏi, đáp án, điểm tối đa, file đính kèm và phiên bản tại lúc bắt đầu. Sửa đề không thay đổi lượt cũ. Nộp lại một lượt đã nộp không tạo thêm điểm.
- XP tổng hợp toàn bộ lịch sử, độc lập với phân trang: 20 XP cho lần đầu hoàn thành bài học; 5 XP/điểm đề đã chấm xong. Điểm tạm tính của bài chờ tự luận chưa cộng XP. Điểm cũ được giữ lại (không thể kiểm chứng lại vì phiên bản cũ do client chấm).
- Bảng xếp hạng ở menu bên trái cho cả member và admin: tổng XP toàn bộ ngôn ngữ, sắp từ cao xuống thấp, kèm thứ hạng, tên và ảnh đại diện; đánh dấu dòng của bạn. Cùng XP sẽ cùng hạng; có thành viên 0 XP, ảnh mặc định là chữ cái tên. Gồm tài khoản đang active và đã đổi mật khẩu tạm, kể cả admin. Tải lại khi mở trang hoặc bấm Làm mới; chưa dùng realtime. Demo chỉ có hồ sơ thật trên trình duyệt này.
- Cloudflare R2: upload nhiều file lần lượt, tìm kiếm, xem trước, tái sử dụng, gỡ liên kết và xóa file không dùng. MP3 ≤30 MB, PDF ≤20 MB, JPG/PNG/WebP ≤5 MB. File đang được bài học, đề hoặc lịch sử tham chiếu không thể xóa.
- Quản trị: cấp/khóa/mở tài khoản thành viên, đặt lại mật khẩu tạm, xem số bài/đề/XP của từng người và chấm tự luận. Menu và màn hình Quản trị chỉ hiện với `profile.role === 'admin'`; tài khoản `member` không có mục này. Demo mặc định là admin.

**Điểm đề luyện tập không tự quy đổi thành band IELTS, điểm TOEIC/HSK/JLPT hoặc chứng chỉ chính thức.** Có mẫu cấu trúc TOEIC L&R truyền thống và IELTS theo kỹ năng; đây là khung trống, cần điền và chia nhóm theo đề cụ thể. Không mô phỏng khóa phần hay nghe một lần của kỳ thi chính thức. Đồng hồ thi thử tính toàn đề; có thể chuyển phần và nghe lại. Bài mẫu/transcript hiện sau khi nộp; rubric chỉ dành cho quản trị. Tự luận ở đây là câu trả lời văn bản; chưa có ghi âm/chấm Speaking. Tính năng flashcard đã bỏ khỏi ứng dụng; bảng lịch sử cũ được giữ nhưng không còn quyền truy cập từ frontend.

## Cấu hình Supabase

### Dự án mới

Chạy trong SQL Editor theo đúng thứ tự:

1. `supabase/001_schema.sql`
2. `supabase/002_seed.sql`
3. `supabase/003_learning_platform.sql`
4. `supabase/004_structured_content.sql`
5. `supabase/006_lesson_practice.sql` (bỏ qua 005 nếu dùng R2)
6. `supabase/007_study_status.sql`
7. `supabase/008_profile_avatar.sql`
8. `supabase/009_leaderboard.sql`

### Nâng cấp dự án cũ

Sao lưu trước. Nếu đã chạy 008: chạy **009**. Nếu đã chạy 007: chạy **008 → 009**. Nếu đã chạy 006: chạy **007 → 008 → 009**. Nếu đã chạy 004: chạy **006 → 007 → 008 → 009**. Nếu đã chạy 003: chạy **004 → 006 → 007 → 008 → 009**, không chạy lại 001–003. Nếu mới có 001/002: chạy **003 → 004 → 006 → 007 → 008 → 009**. Migration 004 thêm cấu trúc nội dung và cách chấm mới; không viết lại snapshot/lịch sử cũ. Bài học cũ được hiển thị thành khối khi mở; lưu lần đầu sẽ ghi cấu trúc mới. Không chạy lại 001 sau các migration mới vì sẽ khôi phục chính sách phân quyền cũ.

Migration 008 thêm `profiles.avatar_key` và RPC chỉ dành cho Worker. Chạy SQL này trước khi triển khai Worker/frontend mới, kể cả khi chưa có ai đặt ảnh. Dùng lại bucket R2 và các biến môi trường hiện có; không cần bucket hay secret mới.

Migration 009 thêm RPC `xp_leaderboard()` cho thành viên active/đã đổi mật khẩu tạm; không mở quyền đọc trực tiếp profile/lịch sử của người khác. Chạy 009 sau 008 rồi triển khai Worker và frontend mới để có bảng xếp hạng và ảnh thành viên. Không cần biến môi trường hoặc bucket mới.

Riêng việc chuyển nơi lưu file sang R2 không cần migration database mới; tính năng luyện tập bài học cần 006: bảng `media_files` vẫn lưu key, tên file và quyền tham chiếu. `005_private_storage.sql` được giữ lại cho hệ thống từng dùng Supabase Storage; **không cần chạy 005 cho R2**. Nếu đã chạy 005, giữ nguyên bucket/policy cũ trong thời gian chuyển file; không cần xóa dữ liệu hay hoàn tác migration.

Nếu có file thật trong Supabase Storage, xem mục chuyển học liệu sang R2 bên dưới trước khi triển khai Worker mới. SQL không sao chép nội dung file.

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

## Worker và Cloudflare R2

1. Trong Cloudflare → R2 Object Storage, tạo bucket **`linguanest-media`**. Giữ riêng tư: không bật Public Development URL (`r2.dev`) hoặc custom domain công khai cho bucket. Tài khoản Cloudflare cần kích hoạt được R2 trước khi triển khai; đổi mã nguồn không thay thế bước này.
2. Sửa `media-worker/wrangler.jsonc`:
   - `r2_buckets`: giữ `binding` là **`MEDIA_BUCKET`**, đặt `bucket_name` đúng tên bucket đã tạo.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`: cùng project với frontend.
   - `ALLOWED_ORIGINS`: các origin chính xác, ví dụ `http://localhost:5173,https://YOUR_PROJECT.pages.dev`; không thêm dấu `/` cuối.
3. Cài dependencies, đặt secret Supabase cho Worker và triển khai:

```sh
cd media-worker
npm ci
npm run check
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

Worker truy cập R2 qua binding, không cần R2 Access Key/S3 secret trong frontend hoặc Worker. Không cần CORS trên bucket vì trình duyệt chỉ gọi Worker; CORS được kiểm soát bằng `ALLOWED_ORIGINS`. Supabase tiếp tục quản lý tài khoản, database và metadata học liệu.

Secret Supabase chỉ nằm ở Worker. Có thể dùng legacy service-role JWT hoặc secret key mới của project. Không ghi vào wrangler.jsonc hoặc Git. Wrangler và Workers types được ghim phiên bản tương thích, có lockfile riêng.

### Thử local trước khi triển khai

- **Thử giao diện:** chạy `npm run dev` ở thư mục gốc khi chưa đặt biến Supabase, dùng demo localStorage như trước; chưa upload file thật lên R2.
- **Thử Worker với R2 giả lập local:** cấu hình Supabase trong `media-worker/wrangler.jsonc`, tạo file `media-worker/.dev.vars` chứa `SUPABASE_SERVICE_ROLE_KEY=...`, rồi chạy `npm run dev` trong `media-worker`. Wrangler dùng R2 local khi không bật `remote`; không cần bucket thật cho bước này. File local không tự được đưa lên R2 khi deploy.
- Khi thử Worker, frontend cần `.env` có cùng Supabase URL/public key và `VITE_MEDIA_WORKER_URL=http://localhost:8787`; khởi động lại Vite. Worker vẫn gọi Auth/database Supabase đã cấu hình, nên dùng project thử nghiệm với migrations 001–004, 006–009 và tài khoản admin. Đây không phải chế độ hoàn toàn offline. `.dev.vars` đã được bỏ qua bởi Git.
- `npm test` kiểm tra upload/đọc/xóa với R2 mock và PostgreSQL nhúng, không cần tài khoản dịch vụ.

### Chuyển học liệu đã có từ Supabase Storage sang R2

Nếu chỉ dùng demo hoặc chưa upload file thật thì bỏ qua mục này.

1. Tạm dừng quản trị upload/xóa file trong thời gian chuyển; sao lưu database và file gốc.
2. Tải các object của bucket cũ về và sao chép sang R2, giữ **nguyên object key** (ví dụ `files/<uuid>.mp3`) và `Content-Type`. Không thêm tên bucket vào key. Chuyển cả file được lịch sử làm bài tham chiếu, không chỉ học liệu đang xuất bản.
3. Đối chiếu key, số lượng, kích thước và nội dung file với bản gốc; giữ nguyên các bản ghi `media_files` và tham chiếu trong database.
4. Triển khai Worker mới với binding R2; thử bằng admin và thành viên: xem ảnh, nghe/tua MP3, tải PDF, mở lượt thi cũ, upload và xóa file thử không dùng.
5. Giữ bản cũ để khôi phục khi cần. Ứng dụng không tự chuyển file, xóa bucket cũ hoặc đọc dự phòng từ Supabase Storage.

Worker xác thực session với Supabase, đọc trạng thái thành viên và quyền quản trị từ database. Học liệu dùng URL ký ngắn hạn (15 phút), gắn với người dùng và file. Mỗi lần đọc vẫn kiểm tra tài khoản và quyền tham chiếu file; biết đường dẫn không đủ để đọc bài nháp. Người đã bắt đầu một lượt đề tiếp tục được đọc file của snapshot đó để bảo toàn lịch sử. MP3 hỗ trợ HTTP Range; giao diện tạo player mới khi đổi bài. Nếu liên kết hết hạn, bấm Tải lại file.

Upload kiểm tra kích thước theo luồng đọc và chữ ký định dạng. Nếu lưu metadata thất bại, Worker dọn file vừa upload. Nếu thao tác xóa Cloudflare R2 thất bại sau khi khóa metadata, file ở trạng thái `deleting`; quản trị bấm Xóa file lại để hoàn tất. File được tham chiếu trong khối bài học, phần, nhóm hoặc câu đều được kiểm tra quyền và bảo vệ khỏi xóa; lượt làm cũ tiếp tục giữ file của snapshot.

Ảnh đại diện dùng cùng bucket private, prefix `avatars/<user-id>/`, tách khỏi `media_files` và thư viện học liệu. Thành viên và admin được đổi ảnh của chính mình qua `/account/avatar`; cần session hợp lệ, tài khoản active và đã đổi mật khẩu tạm. Worker kiểm tra MIME/chữ ký ảnh, giới hạn 2 MB theo luồng đọc; cập nhật profile qua RPC 008 chỉ dành cho service role. Thay/xóa ảnh sẽ dọn object cũ sau khi cập nhật thành công; nếu R2 xóa lỗi, hồ sơ vẫn dùng ảnh mới và Worker ghi cảnh báo (object cũ có thể còn trong bucket để dọn khi vận hành). Lỗi ghi profile sẽ thử xóa object vừa tải, giữ nguyên key cũ. Sao lưu bucket cần giữ cả prefix avatar. Demo lưu ảnh dạng data URL trong localStorage, có thể báo lỗi nếu trình duyệt hết dung lượng; không upload hay đồng bộ lên cloud.

Trên bảng xếp hạng, thành viên đã đăng nhập được xem ảnh hiện tại của các tài khoản đang hoạt động và đã đổi mật khẩu tạm qua `GET /members/<uuid>/avatar`. Worker kiểm tra quyền người xem, trạng thái tài khoản đích và prefix key trước khi đọc R2. Endpoint này không cho tải ảnh lên hoặc xóa ảnh của người khác; không công khai bucket hoặc mở quyền đọc hồ sơ đầy đủ. Khi tài khoản đích bị khóa hoặc chuyển sang bắt buộc đổi mật khẩu, ảnh không còn được đọc qua endpoint này.

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

`npm test`: kiểm tra CSV, Worker bằng mock dịch vụ, và chạy migrations/RLS/RPC trên PostgreSQL nhúng PGlite. Auth được mô phỏng; kiểm thử riêng migration Storage cũ dùng schema mô phỏng; không gọi project thật, không sửa dữ liệu thật.

`npm run test:ui`: Playwright dùng Microsoft Edge đã cài, chạy luồng demo ở desktop và viewport điện thoại. Nếu máy không có Edge, cài browser Playwright và đổi `channel` trong `playwright.config.ts`. Ảnh/trace lỗi lưu ở `test-results`. Server kiểm thử dùng port 4173, được mở/đóng ngay trong tiến trình kiểm thử để không treo khi dọn tiến trình Windows. Cấu hình kiểm thử ép chế độ demo, không dùng thông tin kết nối dịch vụ trong `.env`.

## Sao lưu và vận hành

- Giữ các SQL migrations và lockfile trong Git.
- Xuất PostgreSQL định kỳ bằng Supabase CLI/pg_dump theo hướng dẫn Dashboard; lưu ở nơi riêng có quyền truy cập hạn chế, thử phục hồi vào project thử nghiệm. File database không chứa nội dung Cloudflare R2.
- Giữ bản gốc audio/ảnh/PDF và bản sao Cloudflare R2 ở nơi khác. Việc lưu trữ bài học/đề không xóa lịch sử.
- Theo dõi dung lượng/lượt thao tác R2, quota Supabase và Workers; mã không tự nâng gói hoặc đặt trần hóa đơn cho tài khoản dịch vụ.
- Bản nháp tự lưu trên máy có thể mất khi xóa dữ liệu trình duyệt; lưu bản nháp lên máy chủ để giữ lâu dài.

<a id="project-map"></a>

## Bản đồ project cho người phát triển

### Điểm bắt đầu và kiến trúc

Thư mục gốc ứng dụng là `linguanest/`; các đường dẫn trong README tính từ thư mục này. Frontend và Worker có `package.json`, `package-lock.json`, `tsconfig.json` riêng. Không có backend Express/Next.js hoặc ORM; schema, phân quyền và nghiệp vụ cloud nằm trong SQL và Worker.

```mermaid
flowchart LR
  UI[React trên Cloudflare Pages] --> API[src/lib/api.ts]
  UI --> AUTH[Supabase Auth]
  API -->|cloudMode = false| DEMO[demo.ts / localStorage]
  API -->|SELECT có RLS và RPC| DB[Supabase PostgreSQL]
  API -->|JWT / tài khoản và file| W[Cloudflare Worker]
  W -->|Xác thực và kiểm tra quyền| AUTH
  W -->|Profile / metadata / RPC quyền file| DB
  W -->|Binding MEDIA_BUCKET| R2[R2 private]
```

- [src/main.tsx](src/main.tsx) gắn React vào DOM, import lần lượt `styles.css`, `platform.css`, `practice.css`.
- [src/App.tsx](src/App.tsx) dùng state `Page`, `lang`, `lessonId`, `run`, `practiceRun`, `adminTab` để điều hướng; **chưa dùng React Router**. Thêm màn hình cần cập nhật state/nav và nhánh render tương ứng. Trang admin được lazy-load.
- [src/lib/supabase.ts](src/lib/supabase.ts) bật `cloudMode` khi có cả URL và public key. Thiếu `VITE_MEDIA_WORKER_URL` không tắt cloudMode: nội dung DB vẫn có thể chạy, thao tác Worker báo thiếu cấu hình. Khi đổi `.env`, khởi động lại Vite hoặc build lại frontend.
- [src/lib/api.ts](src/lib/api.ts) là điểm nối UI với demo/cloud. `loadContent()` tải courses, lessons, vocabulary, exams, exam_types và summary luyện tập qua `list_lesson_practices`; helper `all()` đọc theo lô 500 rồi gom vào bộ nhớ. Hiện tìm kiếm/lọc nội dung chủ yếu ở client; nếu tăng quy mô lớn, đây là điểm cần phân trang/lọc phía server.

### File và trách nhiệm

| File | Chức năng / điểm tìm nhanh |
| --- | --- |
| [src/App.tsx](src/App.tsx) | `Login`, session/profile gate, dashboard, `LessonPage`, `ExamCatalog`, `History`; tải lại nội dung và XP sau thao tác. Page/menu `leaderboard` cho cả thành viên và admin; không có Luyện nghe riêng; Quản trị chỉ dành cho admin. |
| [src/components/Leaderboard.tsx](src/components/Leaderboard.tsx) | Tải bảng xếp hạng qua `loadLeaderboard`, trạng thái loading/lỗi/thử lại, nút Làm mới; thứ hạng/tên/ảnh/XP, vị trí cá nhân, đồng hạng và responsive. |
| [src/components/StudyBadge.tsx](src/components/StudyBadge.tsx) | `studyState`/`lessonStudyState`: màu và nhãn theo tiến độ cá nhân, điểm lần hoàn thành gần nhất; dùng ở danh sách, trang bài học và khu vực luyện tập. |
| [src/components/LegacyPracticeHistory.tsx](src/components/LegacyPracticeHistory.tsx) | Lượt bài tập cũ theo bài học hoặc chưa gắn bài; phân trang, xem/tiếp tục bằng ExamPlayer và quay lại Bài học. |
| [src/components/LessonEditor.tsx](src/components/LessonEditor.tsx) | Ba tab nội dung/luyện tập/preview, lưu nguyên gói bài học, bản nháp và nhập bài ôn cũ. |
| [src/components/PracticeEditor.tsx](src/components/PracticeEditor.tsx) | Thêm/sửa/xóa/nhân bản/đổi thứ tự câu, lựa chọn đáp án trực quan, CSV, preview tương tác. |
| [src/components/PracticeQuestion.tsx](src/components/PracticeQuestion.tsx) | Thẻ câu hỏi dùng chung cho preview và học viên: lựa chọn, điền, nhiều ô, nối, tự luận; gợi ý, Enter, feedback, giải thích. |
| [src/components/LessonPractice.tsx](src/components/LessonPractice.tsx), [src/components/PracticePlayer.tsx](src/components/PracticePlayer.tsx) | Nút bắt đầu/lịch sử trong bài học gọi `onOpen` về App; App giữ `practiceRun` và render player ở màn hình `practice` riêng, ẩn lý thuyết; player tự lưu, hàng đợi revision, điều hướng, kiểm tra, tổng kết và làm lại. |
| [src/lib/practice.ts](src/lib/practice.ts), [src/lib/useUnsavedChanges.ts](src/lib/useUnsavedChanges.ts), [src/practice.css](src/practice.css) | Validation/check/payload demo, nhận diện bài tập cũ; cảnh báo rời trang chưa lưu; bố cục teal responsive và reduced motion. |
| [src/components/ContentAdmin.tsx](src/components/ContentAdmin.tsx) | Danh sách/tìm kiếm bài và đề, tạo/nhân bản/lưu trữ, thêm loại kỳ thi; `LessonEditor` soạn bài và từ vựng; mở `ExamEditor`. |
| [src/components/LessonBlocks.tsx](src/components/LessonBlocks.tsx) | `BlockEditor`, `LessonContent`, `RichText`, `QuickQuiz`: soạn và hiển thị khối lý thuyết, bảng, công thức, ví dụ, media, bài tập nhanh. |
| [src/components/ExamEditor.tsx](src/components/ExamEditor.tsx) | Cây phần/nhóm/câu, chọn câu để sửa, mẫu đề, nhập CSV, xem trước, lưu nháp/xuất bản; `prepare()` gán nhóm cho câu cũ/CSV, `ordered()` sắp câu theo layout. |
| [src/components/AuthoringFields.tsx](src/components/AuthoringFields.tsx) | `QuestionFields` sửa nội dung/đáp án/rubric; `MediaPicker` upload hoặc chọn học liệu đã có. |
| [src/components/ExamPlayer.tsx](src/components/ExamPlayer.tsx) | Làm bài và xem kết quả, điều hướng câu, học liệu ghim phía trên câu hỏi khi cuộn, tab mobile, đồng hồ, hàng đợi autosave, nộp bài, cờ xem lại. Bố cục nằm ở `.reading-layout`/`.reading-source` trong `platform.css`; `ResizeObserver` trong player đo chiều cao thanh thời gian và khung học liệu để tính vị trí ghim và khoảng cuộn tới câu. |
| [src/components/Common.tsx](src/components/Common.tsx) | `QuestionBody` nhập câu trả lời; `Media`/`AttachmentList` phát/đọc file; `Speak` dùng speechSynthesis của trình duyệt; `CsvImport`, `useDraft`, thông báo dùng chung. |
| [src/components/OperationsAdmin.tsx](src/components/OperationsAdmin.tsx) | `MediaAdmin` thư viện/xóa file; `MembersAdmin` cấp/khóa/reset tài khoản; `GradingAdmin` chấm tự luận. |
| [src/components/Account.tsx](src/components/Account.tsx) | Giữ tên và ảnh đang sửa trong state; chọn/thay/xóa ảnh chỉ xem trước, nút Lưu hồ sơ mới gọi API cập nhật. Hủy thay đổi phục hồi dữ liệu đã lưu; dùng `useUnsavedChanges` khi rời trang. Đổi mật khẩu riêng, gồm luồng bắt buộc đổi mật khẩu tạm. |
| [src/components/Avatar.tsx](src/components/Avatar.tsx), [src/lib/avatar.ts](src/lib/avatar.ts) | Hiển thị ảnh private qua blob URL, thu hồi URL khi đổi ảnh/unmount, fallback chữ cái; `memberAvatar` đọc ảnh thành viên qua `avatarBlob(profile.id)` cho bảng xếp hạng. `previewURL` ghi đè ảnh trong form mà không đổi sidebar. Kiểm tra định dạng/kích thước ảnh và đọc ảnh demo/preview. |
| [src/components/LessonListening.tsx](src/components/LessonListening.tsx) | Chép lại và đối chiếu transcript ngay trong khối bài học; dùng giọng đọc khi khối không có MP3. `LessonContent` nhận `lang` để bật phần này khi học; preview editor vẫn xem transcript. |
| [src/lib/types.ts](src/lib/types.ts) | Hợp đồng TypeScript: Lesson/Question/ExamLayout/ExamDocument/ExamRun/Profile; `Lang`, `LANG_DETAILS` chứa bốn ngôn ngữ và giọng đọc. |
| [src/lib/content.ts](src/lib/content.ts) | `parseCSV`, `importCSV`, `validateQuestions`, `newQuestion`, `normalizeAnswer`, `loginIdentity`; validation frontend và quy ước CSV. |
| [src/lib/authoring.ts](src/lib/authoring.ts) | `lessonBlocks`/`layoutOf` tương thích dữ liệu cũ; `templateDocument` khung đề; `scoreQuestion`/`correctAnswer` chấm demo và bài tập nhanh; `lessonMedia`/`nestedMedia` gom key. |
| [src/lib/demo.ts](src/lib/demo.ts) | Kho demo, CRUD, snapshot lượt làm, chấm điểm và XP bằng localStorage. Cần đối chiếu khi thay nghiệp vụ cloud; không thay thế kiểm thử RLS. |
| [src/styles.css](src/styles.css), [src/platform.css](src/platform.css) | Styles nền, sau đó styles mở rộng cho nền tảng/biên soạn/làm đề. Có CSS cũ còn lưu; thấy class flashcard không có nghĩa tính năng còn hoạt động. |
| [media-worker/src/index.ts](media-worker/src/index.ts) | Router HTTP, xác thực/profile gate, tài khoản nội bộ, ticket HMAC, kiểm tra upload, R2 put/get/head/delete và HTTP Range. |
| [media-worker/wrangler.jsonc](media-worker/wrangler.jsonc) | Binding R2 `MEDIA_BUCKET`, bucket `linguanest-media`, Supabase public config, CORS `ALLOWED_ORIGINS`; secret được đặt riêng. |
| [src/data/demo.json](src/data/demo.json) | Seed demo theo cấu trúc cũ (courses/lessons/vocabulary/exercises), được `demo.ts` chuyển sang tài liệu đề tương thích rồi sao chép thành luyện tập bài học khi khởi tạo. Không phải dữ liệu cloud. |
| [tools/validate-data.mjs](tools/validate-data.mjs) | Kiểm tra ID, quan hệ và câu hỏi seed demo; không kiểm tra toàn bộ schema nội dung mới. |
| [tools/upgrade-authoring.py](tools/upgrade-authoring.py) | Script đã dùng để sinh `004_structured_content.sql` từ một phần `003` và SQL nhúng. Chạy lại sẽ ghi đè file 004; không phải lệnh khởi động hay nâng cấp thường ngày. |
| [vite.config.ts](vite.config.ts), [public/_redirects](public/_redirects) | Vite React/Tailwind, chia bundle; SPA fallback trên Pages. |

### Database: đọc file nào trước

| Migration | Vai trò hiện tại |
| --- | --- |
| [001_schema.sql](supabase/001_schema.sql) | Bảng nền, Auth trigger tạo profile và cấu trúc học cũ. Policy tại đây không phải policy cuối cùng. |
| [002_seed.sql](supabase/002_seed.sql) | Nội dung mẫu cho database mới. Sửa seed không tự cập nhật nội dung của project đã triển khai. |
| [003_learning_platform.sql](supabase/003_learning_platform.sql) | Accounts gate, bảng đề/phiên bản/lượt làm/media, RLS và quyền RPC; nâng cấp bài tập cũ, lịch sử, XP, chấm tự luận, quyền/xóa file. |
| [004_structured_content.sql](supabase/004_structured_content.sql) | Blocks/layout, chế độ luyện tập, validation/chấm dạng câu mới, gom media lồng nhau; ghi đè các RPC soạn bài/đề và xử lý lượt làm. |
| [007_study_status.sql](supabase/007_study_status.sql) | Ghi bắt đầu đọc bài theo user, summary trạng thái/điểm, tách lịch sử thi và bài tập cũ trước phân trang; giữ tổng XP/lịch sử. |
| [008_profile_avatar.sql](supabase/008_profile_avatar.sql) | Thêm avatar key vào profile, RPC đổi key khóa hàng và trả key cũ, chỉ service role được gọi; giữ nguyên quyền cập nhật tên. |
| [009_leaderboard.sql](supabase/009_leaderboard.sql) | RPC `xp_leaderboard`, tổng XP theo công thức summary trên toàn bộ lịch sử, dense rank theo XP, payload chỉ có id/tên/avatar key/XP/hạng, gate thành viên. |
| [006_lesson_practice.sql](supabase/006_lesson_practice.sql) | Practice riêng theo bài học, RLS/RPC, snapshot/checks/revision, sao chép bài tập cũ an toàn, mở rộng quyền giữ file R2. |
| [005_private_storage.sql](supabase/005_private_storage.sql) | Legacy, chỉ cho bucket Supabase Storage cũ; không cần cho R2. Giữ nguyên số migration đã tồn tại. |

**Logic hiện hành:** `save_lesson`, `get_exam_document`, `run_payload`, `submit_exam` từ **004**. `save_exam` và `start_exam` được **006** bọc để chặn sửa/bắt đầu đề nguồn đã chuyển; implementation cũ đổi tên hậu tố `_before_practice`. `can_access_media_for`/`reserve_media_delete` cũng được 006 bọc để xét practice và lịch sử. Các RPC mới cho lesson practice đều ở 006. `save_exam_responses`, `get_exam_run`, `grade_exam`, `list_exam_runs`, `complete_lesson`, `member_summaries` vẫn từ **003**. `learning_summary` được **007** bọc (bản 003 đổi tên `learning_summary_before_study_status`) để bổ sung trạng thái cá nhân và thống kê thi riêng. Trang lịch sử dùng `exam_history` (007); `list_exam_runs` vẫn dành cho tương thích và chấm tự luận. Không chạy lại migration cũ để sửa logic đã bị ghi đè.

<a id="data-flows"></a>

## Hợp đồng dữ liệu và luồng xử lý

### Mô hình nội dung

- `courses → lessons → vocabulary`. `lessons.blocks` chứa các khối `text/formula/table/example/note/media/quiz`. Trường `body` của khối bảng là chuỗi: hàng ngăn bằng newline, ô ngăn bằng tab; hàng đầu là tiêu đề. Xem `BlockEditor` và `LessonContent` trước khi thay định dạng. `lessonBlocks()` chuyển các trường bài cũ sang khối để hiển thị/biên tập, gồm audio/transcript. Khi lưu bài, editor vẫn tổng hợp transcript vào `listening_text` để giữ tương thích; học nghe hiện nằm trong từng khối có transcript qua `LessonListening`, không có trang nghe riêng.
- `lessons → lesson_practices`: một tài liệu luyện tập/bài học, chứa nhiều câu JSONB, version, enabled, layout/media và nguồn chuyển đổi. `lesson_practice_runs` lưu snapshot độc lập, responses, checks, revision và trạng thái in_progress/completed; một lượt đang làm/user/bài. Bảng bật RLS, không cấp quyền SELECT/ghi trực tiếp cho authenticated/anon; chỉ dùng RPC kiểm tra quyền.
- `exam_types → exams → exam_versions`. `exams` chứa thông tin danh sách và version hiện tại, không chứa đáp án. `exam_versions` giữ `questions` và `layout` theo version. Một lesson gắn tối đa một exam qua `exams.lesson_id UNIQUE`; đề độc lập có `lesson_id = null`.
- `ExamLayout.sections[] → groups[] → Question.group_id`; nhóm trỏ tới phần bằng `section_id`. `Question.section` là nhãn tương thích, không thay thế quan hệ ID. Câu hỏi lưu trong JSONB, không có bảng `questions` riêng.
- Học liệu có thể nằm ở toàn đề, phần, nhóm, câu hoặc khối bài học. `content_media_keys()` trong 004 gom các `media_keys` lồng nhau cho backend; SQL giữ `root_media_keys` trong layout phiên bản để phân biệt học liệu chung toàn đề với tập key tổng hợp. Client không được tự coi tập key tổng hợp là học liệu chung.
- `exam_runs` giữ snapshot tại lúc bắt đầu, responses, grades, revision và deadline. Không đọc lại câu hỏi phiên bản mới để hiển thị/chấm lượt cũ. `media_files` chỉ lưu metadata/key/trạng thái; bytes nằm trong R2. Các bảng `exercises`, `quiz_attempts`, `flashcard_reviews` là di sản; frontend không đọc/ghi trực tiếp.

### Câu trả lời, CSV và chấm điểm

`Question.answers` là đáp án mẫu dạng mảng chuỗi; **`ExamRun.responses` và `PracticeRun.responses` là map `questionId → string`**, kể cả với câu nhiều lựa chọn/nhiều ô. Không thay thẳng giá trị responses bằng mảng JSON nếu chưa đổi toàn bộ UI, demo và SQL.

| Dạng | `Question.answers` ví dụ | Chuỗi lưu trong `responses[questionId]` |
| --- | --- | --- |
| `choice` | `["1"]` (B, chỉ số từ 0) | `"1"` |
| `multi` | `["0","2"]` | `JSON.stringify(["0","2"])` |
| `short` | `["hanoi","ha noi"]` (cách viết thay thế) | Văn bản người dùng nhập. |
| `gaps` | `["hanoi\|ha noi","blue"]` (đáp án từng ô) | `JSON.stringify(["Hanoi","blue"])` |
| `matching` | `["2","1"]` (lựa chọn từ 1) | `JSON.stringify(["2","1"])` |
| `essay` | `[]` hoặc không có | Văn bản tự luận; đề thi chờ quản trị chấm, luyện tập bài học tự đối chiếu (không tính tỷ lệ đúng). |

Header CSV câu hỏi hiện tại:

```csv
kind,section,prompt,passage,choices,answers,points,explanation,slots,word_limit
```

`importCSV()` yêu cầu tối thiểu các cột `kind,prompt,points`; các dạng câu vẫn phải có lựa chọn/đáp án tương ứng để qua validation. Mẫu tải trong web nằm ở `CsvImport` trong `Common.tsx`; parser/kiểm tra nằm ở `content.ts`. Import chỉ **thêm** câu vào bản nháp, không nhập metadata toàn đề, ID nhóm, rubric hoặc file. `prepare()` phân nhóm theo `section`, sau đó admin chỉnh nhóm/học liệu trên web. File tối đa 2 MB ở UI, đề tối đa 200 câu. Khi đổi hợp đồng CSV cần sửa parser, mẫu tải, lời hướng dẫn và kiểm thử cùng nhau.

Chấm thật: `submit_exam → score_question_v4 → answer_equal_v4` trong 004. Chấm demo: `demoSubmit → scoreQuestion` trong JS. Bài tập nhanh dùng `correctAnswer`, hiện đáp án để tự học và không cộng điểm thi. Multi đúng toàn bộ mới có điểm; gaps/matching chia đều điểm theo mục; short/gaps có giới hạn từ. Không dùng validation hoặc điểm client làm nguồn tin cậy cho cloud.

### Các luồng cần giữ khi sửa

| Luồng | Chuỗi xử lý và điều kiện cần giữ |
| --- | --- |
| Đăng nhập | `Login → loginIdentity → Supabase Auth → loadProfile`. Kiểm tra `is_active` và `must_change_password` ở cả giao diện, SQL và Worker. Profile `role` từ database quyết định quyền. |
| Cấp/reset tài khoản | `MembersAdmin → workerJSON → /admin/users`, `/admin/users/reset`, `/admin/users/status`. Worker dùng Auth Admin API; thành viên phải đổi mật khẩu tạm. |
| Đổi mật khẩu | `Account → /account/password`; Worker xác minh mật khẩu hiện tại rồi cập nhật Auth và bỏ cờ `must_change_password`. Đổi tên đi qua RPC `update_my_profile`. |
| Lưu hồ sơ / ảnh đại diện | `Account.selectAvatar → validateAvatar + avatarDataURL` chỉ cập nhật preview trong state. Bấm Lưu hồ sơ mới gọi `renameProfile` nếu tên đổi, rồi `uploadAvatar/removeAvatar` nếu ảnh đổi, và refresh profile. Tên/ảnh dùng các yêu cầu riêng; nếu lưu lỗi, form giữ thay đổi để thử lại, chỉ báo thành công khi hoàn tất. Avatar qua `POST/DELETE /account/avatar → replace_profile_avatar` (008): Worker lấy user từ JWT, kiểm tra active/password gate, upload vào `avatars/<user-id>/<uuid>.<ext>` trong R2; RPC chỉ dành cho service role, trả key trước để dọn file cũ. `Avatar → avatarBlob → GET /account/avatar` đọc ảnh của chính tài khoản qua bearer session, không nhận key/user đích từ client. |
| Bảng xếp hạng | `Leaderboard → loadLeaderboard → xp_leaderboard()` (009), demo dùng `demoLeaderboard`. Cloud chỉ trả `id, display_name, avatar_key, xp, rank` của tài khoản active/đã đổi mật khẩu tạm, không trả email/username/role/đáp án/lịch sử. XP giống `learning_summary`: progress + quiz legacy + đề graded; không cộng điểm tạm hoặc practice mới. Xếp XP giảm dần, dense rank khi bằng điểm, thứ tự phụ theo tên rồi ID. |
| Ảnh trên bảng xếp hạng | `Avatar(memberAvatar) → avatarBlob(memberId) → GET /members/<uuid>/avatar`. Worker kiểm tra session/active/password gate của người xem và tài khoản đích, chỉ đọc avatar key hiện tại đúng prefix user. Endpoint chỉ GET; quyền thay/xóa ảnh vẫn chỉ qua tài khoản của chính mình. Bucket không công khai. |
| Lưu bài học | `LessonEditor → saveLessonBundle → save_lesson_bundle` (006), gọi `save_lesson` (004) rồi lưu practice trong cùng giao dịch. Demo dùng `demoLessonBundle`; version practice chống ghi đè. |
| Lưu đề | `ExamEditor → saveExam → save_exam` (wrapper 006 gọi implementation 004), kiểm tra version chống ghi đè từ tab khác, tạo version mới; admin tải đầy đủ qua `get_exam_document`. Nháp cho nội dung chưa hoàn thiện, xuất bản kiểm tra nghiêm hơn. |
| Bắt đầu / tiếp tục | `App.openExam → startExam/getRun → start_exam/get_exam_run`. Mỗi user chỉ có một lượt `in_progress` cho cùng exam; lượt mới chụp snapshot. `practice` có deadline null; `mock` có hạn toàn đề. |
| Autosave / nộp | `ExamPlayer` debounce 600 ms, nối hàng đợi Promise, gửi `revision`; server khóa hàng và tăng revision. Khi nộp, đợi hàng đợi trước rồi gọi `submit_exam`. Sau hạn chỉ chấm câu đã lưu trước hạn. Đồng hồ UI dùng `server_now`, không quyết định thời hạn server. |
| Trả dữ liệu lượt làm | `run_payload` (004) bỏ answers/explanation/rubric và transcript nhóm khi đang làm; khi kết thúc vẫn bỏ rubric với thành viên. Cần giữ quy tắc này cho mọi loại câu hoặc field nhạy cảm mới. |
| Chấm tự luận / XP | `GradingAdmin → gradeExam → grade_exam` (003); chỉ admin, điểm nguyên trong phạm vi. `learning_summary`/`member_summaries` tính XP từ toàn lịch sử, không từ một trang kết quả. |
| Upload | `MediaPicker/MediaAdmin → uploadMedia → POST /media?filename=…`. Worker kiểm tra admin, kích thước/chữ ký file, ghi R2 rồi metadata; nếu metadata lỗi thì thử dọn object vừa ghi. |
| Đọc file | `Media → mediaURL → GET /media-ticket?key=… → GET/HEAD /media/<key>?ticket=…`. Ticket HMAC hết hạn sau 15 phút; Worker kiểm tra lại profile và `can_access_media_for` mỗi lần đọc, rồi gọi R2. Hỗ trợ Range, HEAD, 404/416; response private/no-store. |
| Xóa file | `deleteMedia → DELETE /media?key=… → reserve_media_delete → R2.delete → xóa metadata`. RPC chặn key đang được bài/đề/lượt cũ tham chiếu, chuyển trạng thái `deleting`. Lỗi giữa chừng có thể thử xóa lại; không bỏ bước giữ chỗ này. |

Worker còn có `GET /health`: chỉ báo tiến trình đáp ứng, **không kiểm tra kết nối Supabase/R2**. Client không gọi trực tiếp bucket. Chỉ service role được gọi các RPC quyền/xóa media; các RPC người dùng tự kiểm tra `auth.uid()` và vai trò. Các chức năng Worker mới phải giữ CORS, session gate và kiểm tra quyền tương ứng.

### Dữ liệu trình duyệt và giới hạn demo

| Key localStorage | Nơi quản lý / mục đích |
| --- | --- |
| `linguanest_workspace_v2` | `demo.ts`: nội dung demo và tài liệu đề. Seed chỉ được dùng khi chưa có kho này. |
| `linguanest_study_starts_v1` | `demo.ts`: thời điểm bắt đầu đọc từng bài; không cộng XP. Demo vẫn một hồ sơ dùng chung localStorage trên trình duyệt. |
| `linguanest_practice_runs_v1` | `demo.ts`: snapshot, câu trả lời, checks và kết quả luyện tập bài học. |
| `ln-practice-${run.id}` | `PracticePlayer`: dự phòng responses/revision cho cả demo/cloud; chỉ khôi phục khi revision khớp. |
| `linguanest_runs_v2` | `demo.ts`: lượt làm/snapshot demo. |
| `linguanest_profile_v2` | `demo.ts`: hồ sơ demo, mặc định admin; `avatar_data_url` lưu ảnh demo trong cùng hồ sơ. Cloud dùng `avatar_key`, không lưu data URL vào PostgreSQL. |
| `linguanest_demo_content_v1`, `linguanest_demo_progress_v1`, `linguanest_demo_attempts_v1` | Nội dung cũ được chuyển khi khởi tạo; tiến độ và XP cũ vẫn được đọc. |
| `ln-draft-${userId}-${editing.key}` | `ContentAdmin` + `useDraft`: bản nháp biên soạn, lưu sau 400 ms và trước unload; dùng cả khi kết nối cloud. |
| `ln-run-${run.id}` | `ExamPlayer`: dự phòng responses/revision; chỉ khôi phục vào lượt đang làm nếu revision khớp server. |
| `ln-flags-${run.id}` | `ExamPlayer`: dấu xem lại riêng thiết bị. |

Xóa localStorage có thể mất bản nháp/bài làm chưa đồng bộ; không dùng reset toàn bộ dữ liệu như một bước sửa lỗi mặc định. Demo có đầy đủ dữ liệu/đáp án trên máy và quyền admin mô phỏng; không dùng demo hoặc kiểm thử UI demo để chứng minh bảo mật production. Khi đổi kiểu dữ liệu cần xét cả kho demo đã lưu, drafts cũ và snapshot cloud, không chỉ dữ liệu mới tạo.

<a id="change-map"></a>

## Mapping yêu cầu → nơi sửa

| Yêu cầu | Đọc/sửa trước | Phần phải đối chiếu thêm |
| --- | --- | --- |
| Màu trạng thái / điểm dưới bài học / lịch sử thi | `StudyBadge.tsx`, `App.tsx`, `LessonPractice.tsx`, `LegacyPracticeHistory.tsx`, `practice.css` | `beginLesson`, `summary`, `examHistory`, `lessonExamHistory`, demo equivalents và SQL 007; snapshot/điểm gần nhất, riêng từng user. |
| Luyện tập bài học / trình soạn | `LessonEditor`, `PracticeEditor`, `LessonPractice`, `PracticePlayer`, `PracticeQuestion`, `practice.css` | `practice.ts`, `api.ts`, `demo.ts`, types, migration 006; giữ snapshot, attempts, revision và quyền mở đáp án. |
| Màn hình, menu, lọc đề, dashboard | `App.tsx`, `styles.css`, `platform.css` | `api.ts` nếu cần dữ liệu mới; responsive và UI tests. |
| Thêm loại khối bài học | `types.ts`, `LessonBlocks.tsx`, `authoring.ts` | `LessonEditor`, SQL validation `save_lesson`, media keys, tương thích dữ liệu cũ. |
| Thêm/sửa dạng câu hỏi | `Question` trong `types.ts`, `QuestionFields`, `QuestionBody` | `content.ts` + CSV, `authoring.ts` chấm demo, SQL `validate_question_v4`/`score_question_v4`/`run_payload`, player, chấm tự luận và tests. |
| Thêm khung đề IELTS/TOEIC hoặc kỳ thi khác | `templateDocument` trong `authoring.ts`, `templateNames` trong `ExamEditor.tsx` | Loại kỳ thi là dữ liệu `exam_types`, khác với template cấu trúc; thêm tên kỳ thi qua UI không tự tạo template mới. |
| Thêm ngôn ngữ | `Lang`/`LANG_DETAILS`, lựa chọn khóa học trong UI | CHECK constraints của courses/exams/exam_types, seed SQL + demo, `demo.ts` danh sách kỳ thi, `validate:data` hiện kỳ vọng 4 ngôn ngữ. |
| CSV / nhập hàng loạt | `importCSV`/`parseCSV`, `CsvImport`, `ExamEditor.prepare` | Mẫu CSV và lời hướng dẫn; tạo UUID, nối thêm câu, giới hạn 200 câu, kiểm thử parser. |
| Đồng hồ, tiếp tục bài, autosave | `ExamPlayer.tsx`, `api.ts` | `start_exam`, `save_exam_responses`, `submit_exam`, `run_payload`, mô phỏng trong `demo.ts`; revision và hạn server. |
| Cách chấm / điểm / quy đổi thang thi | SQL chấm và summary, `GradingAdmin` | JS demo, phần kết quả trong `ExamPlayer`, snapshot/version; chưa có bảng quy đổi IELTS/TOEIC chính thức. |
| Upload, định dạng hoặc giới hạn file | Worker `formats`, `keyPattern`, `bytesLimited`, `readMedia` | `MediaPicker`/`MediaAdmin` accept/nhãn, `Media` renderer, SQL kiểm tra key/references, Worker tests. |
| Tài khoản / phân quyền | `App`, `Account`, `MembersAdmin`, Worker | RLS/RPC trong SQL, role/active/password gate, tests DB/Worker; không chỉ ẩn nút trên UI. |
| Ảnh đại diện | `Account`, `Avatar`, `lib/avatar.ts`, `api.ts`, `demo.ts`, Worker `/account/avatar` | `profiles.avatar_key`/RPC 008; ảnh private riêng từng user, kiểm tra 2 MB và chữ ký ảnh, fallback chữ cái và thu hồi blob URL. |
| Bảng xếp hạng XP | `Leaderboard.tsx`, `App.tsx`, `api.ts`, `demoLeaderboard`, `LeaderboardEntry` trong types | SQL 009 giữ công thức XP giống summary, đồng hạng, gate và payload tối thiểu; ảnh qua Worker `/members/<uuid>/avatar`, styles trong `platform.css`. |
| Nghe trong bài học | `LessonBlocks.tsx`, `LessonListening.tsx`, `App.tsx` | `lessonBlocks` chuyển audio/transcript cũ; giữ học liệu tại khối, giọng đọc theo ngôn ngữ; không có mục menu nghe riêng. |
| Nội dung mẫu | `src/data/demo.json`, `002_seed.sql`, `demo.ts` | Demo đã có localStorage không tự nhận seed mới; database đã chạy seed cần migration/content update riêng. |
| Deploy / đổi domain | `wrangler.jsonc`, `.env.example`, `vite.config.ts`, `public/_redirects` | Worker CORS đúng origin, cấu hình Pages, secret riêng, R2 private. |

<a id="change-workflow"></a>

## Quy trình thay đổi và kiểm tra

1. Đọc bản đồ này, rồi mở đúng file/hàm và test liên quan để xác nhận trạng thái hiện tại. Mã nguồn là căn cứ cuối cùng nếu README chưa kịp cập nhật. Dùng `rg` theo tên component/RPC để tìm đủ nơi gọi.
2. Phân biệt thay đổi hiển thị với thay đổi hợp đồng dữ liệu/nghiệp vụ. Với nghiệp vụ, rà cả **UI → api.ts → demo.ts hoặc SQL/Worker**; với field mới, rà schema/types, tạo/sửa/đọc/snapshot và quyền hiển thị.
3. Với database đã triển khai, thêm migration tiến tới thay vì chỉ sửa file đã chạy. Số kế tiếp hiện là **010**; không tái sử dụng 005 dù R2 bỏ qua nó. Cập nhật danh sách migration chạy trong `tests/database.test.mjs` và hướng dẫn cài mới/nâng cấp. Không chạy lại `tools/upgrade-authoring.py` như một bước build.
4. Giữ snapshot/lịch sử và khả năng đọc nội dung cũ; không tự xóa file hay bảng cũ. Khi thêm field đáp án/transcript/rubric, kiểm tra payload thành viên thực nhận ở server.
5. Chạy kiểm tra theo phạm vi bên dưới; chỉ chỉnh README thì đối chiếu đường dẫn, tên hàm, script và quy trình, không cần chạy lại toàn bộ UI/build.
6. Sau khi hoàn thành, cập nhật mapping, hợp đồng, migration và lệnh kiểm tra trong README nếu đã đổi. Báo rõ đã kiểm tra local hay dịch vụ thật; không ghi trạng thái triển khai dựa vào mã nguồn.

### Chọn kiểm tra theo phạm vi

Các lệnh chạy ở gốc `linguanest/`, trừ dòng Worker. Windows có thể dùng `npm.cmd`.

| Thay đổi | Kiểm tra phù hợp | Phạm vi thực tế |
| --- | --- | --- |
| TypeScript/frontend | `npm run check`, `npm run build` | Type check và bundle production; không xác minh RLS hay dịch vụ thật. |
| Luyện tập Demo/Cloud | `node --test tests/practice.test.mjs tests/database.test.mjs` | JS grading, nâng cấp demo, snapshot/XP, RPC adapter mock, transaction/RLS/chấm thật bằng PGlite. |
| CSV/chuẩn hóa câu trả lời | `node --test tests/content.test.mjs` | Parser, lỗi dòng, đáp án nhiều ô, định danh đăng nhập. |
| SQL/schema/RLS/chấm điểm | `node --test tests/database.test.mjs` | PGlite áp dụng 001–004, 006–009, Auth giả lập, quyền member/admin, revisions, snapshot, deadline, XP, media, avatar và leaderboard; 005 chỉ chạy ở test legacy riêng. |
| Bảng xếp hạng | `npm test`; `npm run test:ui -- tests/ui/leaderboard.spec.ts` | SQL tổng XP khớp summary, toàn bộ lịch sử, đồng hạng, 0 XP, payload tối thiểu và account gates; demo/API adapter; quyền đọc ảnh trong Worker. UI có dữ liệu nhóm mock để kiểm tra tên dài/ảnh/hạng và demo thật để kiểm tra XP, Làm mới và lỗi/thử lại. |
| Hồ sơ / menu / nghe trong bài | `npm run test:ui -- tests/ui/account.spec.ts` | Demo trên desktop/mobile: tên/ảnh/xóa chỉ áp dụng sau Lưu hồ sơ, sidebar/storage giữ nguyên trước khi lưu, hủy và cảnh báo rời trang, reload, từ chối ảnh sai/quá lớn; thành viên không thấy menu Quản trị/Luyện nghe; nghe và đối chiếu ngay trong bài. |
| Worker/R2/tài khoản | `node --test tests/worker.test.mjs`; `npm --prefix media-worker run check` | Supabase fetch và binding R2 giả lập; ticket, quyền, upload bù lỗi, xóa thử lại, Range/HEAD/404/416, mật khẩu. Không xác nhận bucket/secret thực. |
| Soạn bài/đề, player, responsive | `npm run test:ui` | `tests/ui/platform.spec.ts`: CRUD, resume, chấm, lịch sử, nháp, CSV; `structured.spec.ts`: khung 200 câu, nhóm câu, công thức, điền ô và kết quả; `practice.spec.ts`: soạn/nhân bản/xóa/đổi thứ tự, preview, Enter, gợi ý, phản hồi, tiếp tục/làm lại, responsive, bài không có câu và cảnh báo chưa lưu. |
| Seed demo | `npm run validate:data` | ID/quan hệ/câu hỏi dữ liệu mẫu cũ. |
| Thay đổi nhiều lớp | `npm test` + build frontend + check Worker; thêm UI tests nếu ảnh hưởng luồng người dùng | `npm test` chỉ chạy `tests/*.test.mjs`, không bao gồm Playwright. |

[playwright.config.ts](playwright.config.ts) chạy desktop và mobile viewport bằng Edge; [tests/ui/setup.ts](tests/ui/setup.ts) mở Vite local ở 4173, ép demo và đóng server khi kết thúc. Mobile ở đây là viewport giả lập, không phải kiểm tra thiết bị thật. Không sửa nguồn đồng thời khi đang chạy UI tests vì Vite HMR có thể làm reload trang giữa kịch bản. `dist/`, `test-results/`, `playwright-report/`, `.wrangler/` là đầu ra công cụ, không phải nơi sửa nguồn.

Kiểm tra bố cục học liệu ghim: chạy `npm run build` và các luồng `structured.spec.ts`; kiểm tra cuộn trang trên desktop, học liệu dài cuộn trong khung, chọn câu không bị khung che và chuyển tab học liệu/câu hỏi trên mobile. Trên mobile khung vẫn theo tab, không ghim để tránh chiếm diện tích trả lời.

Kết quả kiểm tra ngày 24/10/2026: build thành công; luồng `author grouped` đạt trên desktop và mobile. Đã kiểm tra thêm bằng trình duyệt với học liệu dài, 12 câu và viewport 1440×900/900×700: khung giữ cách thanh thời gian 12 px, cuộn được bên trong, chọn câu 8 không bị khung che, không tràn ngang ở viewport 900 px và không có lỗi JavaScript. Đã xem ảnh chụp khi cuộn để xác nhận bố cục.

### Điểm dò lỗi nhanh

| Hiện tượng | Kiểm tra đầu tiên |
| --- | --- |
| Chỉ thấy demo hoặc nội dung không chia sẻ giữa máy | `cloudMode` và hai biến Supabase; localStorage không đồng bộ. |
| Học được nhưng không upload/đổi mật khẩu | `VITE_MEDIA_WORKER_URL`, origin trong Worker, session/profile gate; sau đó binding R2/secret. |
| Audio/ảnh lỗi sau một thời gian | Ticket 15 phút, nút Tải lại file, quyền tài khoản/tham chiếu; 404 cần đối chiếu key metadata với object R2. |
| Không xóa được học liệu | `reserve_media_delete`: bài nháp/lưu trữ và snapshot lượt cũ vẫn có thể giữ tham chiếu; kiểm tra cả trạng thái `deleting`. |
| Lưu báo dữ liệu đã sửa ở nơi khác | `exams.version` khi soạn hoặc `exam_runs.revision` khi làm; tải lại trạng thái mới, không bỏ kiểm tra xung đột. |
| CSV thêm nhiều câu hơn mong đợi | Import nối thêm vào câu hiện có; template cũng sinh câu trống. CSV không tự thay thế các câu template. |
| Sửa seed nhưng demo không đổi | `linguanest_workspace_v2` đã được khởi tạo; bảo toàn nội dung cần giữ trước khi thử lại trên hồ sơ trình duyệt riêng. |


## Soạn bài học lý thuyết và đề có cấu trúc

- **Bài học:** tạo bài → chọn loại nội dung → Thêm nội dung. Mỗi khối có tên để tạo mục lục, đổi thứ tự bằng nút lên/xuống. Văn bản hỗ trợ thanh công cụ in đậm/nghiêng/tiêu đề/danh sách; bản soạn dùng ký hiệu nhẹ, bản học được định dạng bằng React, không thực thi HTML. Khối công thức, bảng có ô sửa trực tiếp, ví dụ/bản dịch, lưu ý, media/transcript và bài tập nhanh. Bài tập nhanh trong khối cũ vẫn hoạt động; bộ luyện tập có lưu kết quả được soạn ở tab Bài tập luyện tập riêng.
- **Đề:** Thông tin đề → chọn mẫu → Tạo cấu trúc từ mẫu. Nhãn IELTS/TOEIC tự chọn khi ngôn ngữ có loại tương ứng. Nút này thay nội dung hiện tại sau xác nhận. Mẫu TOEIC tạo đủ 200 câu trống; Part 7 cần chia nhóm đúng theo đoạn đọc. IELTS Reading tạo 40 câu trống chia 3 nhóm; Listening 4 nhóm ×10 câu; Writing 2 task. Các dạng câu thực tế do bạn chọn lại theo tài liệu.
- Chọn phần/nhóm để nhập hướng dẫn, đoạn đọc, audio/ảnh và transcript. Chọn số câu để sửa một câu; tìm số/nội dung, lọc lỗi, thêm trước/sau, nhân bản và chuyển nhóm. Nút lên/xuống đổi thứ tự. Lưu bản nháp giữ nội dung chưa hoàn thiện; xuất bản kiểm tra toàn đề, bấm lỗi để mở đúng câu.
- **Học liệu:** tải file ngay trong khối/phần/nhóm/câu hoặc chọn lại trong thư viện. Giữ audio ở cấp phần nếu một file chung cả phần; ở cấp nhóm nếu một hội thoại cho nhiều câu. Cấp câu dành cho ảnh/audio riêng. Gắn nhãn sơ đồ: dùng ảnh có số và câu điền/nối tương ứng; chưa có công cụ kéo thả nhãn trực tiếp lên ảnh.
- **Nhiều ô trống:** chọn dạng Điền nhiều ô trống, thêm các mục, chèn `{{1}}`, `{{2}}`… trong nội dung. Nếu không chèn thì mục hiện dưới dạng danh sách ô. Mỗi mục dùng `|` để khai báo đáp án thay thế. Giới hạn từ áp dụng mỗi ô.
- **Nối:** khai báo lựa chọn và các mục; đáp án là số lựa chọn từ 1. Cho phép dùng lại lựa chọn. True/False/Not Given và Yes/No/Not Given có nút tạo bộ lựa chọn nhanh. Câu nghe có thể chỉ hiện A/B/C/D.
- **CSV:** `kind` nhận choice/multi/short/gaps/matching/essay. `choices` và `slots` ngăn bởi `|`. Với choice/multi, `answers` là chỉ số từ 0 ngăn bởi `|`; short là các cách viết chấp nhận ngăn bởi `|`. Với gaps/matching, `answers` ngăn bởi `;` theo từng mục; matching dùng chỉ số từ 1. `word_limit` là số từ tối đa mỗi ô, 0 là không giới hạn. Dùng mẫu CSV trong giao diện; ảnh/audio gắn sau nhập.
- **Làm bài:** trên desktop, học liệu nằm phía trên nhóm câu, cả hai dùng toàn bộ chiều rộng cột nội dung; học liệu ghim dưới thanh thời gian khi cuộn trang, gồm cả file chung toàn đề. Khung giới hạn chiều cao theo màn hình và cuộn bên trong khi nội dung dài, chừa chỗ cho câu hỏi. Khi chuyển câu, khoảng cuộn tính cả chiều cao khung học liệu để tránh che câu đang chọn. Danh sách số câu vẫn ở cột điều hướng bên trái khi đủ rộng; bấm số câu để tới câu cần làm. Điện thoại chuyển tab Học liệu/Câu hỏi. Audio giữ nguyên khi chuyển câu trong cùng nhóm hoặc ẩn tab học liệu. Có đánh dấu xem lại (lưu trên thiết bị) và lọc câu. Đáp án tự đồng bộ lên máy chủ; luyện tập không hết giờ, thi thử có đồng hồ toàn đề.
- **Lưu ý nâng cấp:** triển khai frontend/Worker sau khi chạy migrations. Bản demo vẫn lưu riêng trên trình duyệt; không tự đưa nội dung demo lên server. Thử upload MP3, tua, tải PDF và hai tài khoản thật trên project của bạn trước khi chia sẻ.


## Luyện tập ngay trong bài học (migration 006)

### Cách soạn và học

1. **Quản trị → Bài học → Tạo bài học / Sửa → Nội dung bài học**: nhập lý thuyết, khối nội dung, từ vựng và trạng thái.
2. Sang **Bài tập luyện tập → + Thêm câu hỏi**. Chọn dạng, nhập câu và đáp án; dùng các nút Nhân bản / Chuyển lên / Chuyển xuống / Xóa có xác nhận. Trắc nghiệm thêm phương án bằng nút và chọn đáp án đúng bằng radio/checkbox. Một ô trống dùng `{{blank}}` hoặc `___`; nhiều ô dùng `{{1}}`, `{{2}}` với đáp án từng mục. Các đáp án thay thế chỉ được chấp nhận khi người soạn khai báo.
3. Gợi ý, giải thích, số lần thử (1–10, mặc định 2), chế độ mở đáp án và kiểm tra ngay khi chọn (trắc nghiệm một đáp án) được cấu hình trong form. Preview tương tác cập nhật khi sửa. CSV vẫn thêm hàng loạt được; các field mới như hint/max_attempts/check_mode chỉnh trong form, chưa nhập qua CSV.
4. Bấm **Lưu nội dung / Lưu và xuất bản**. Bài học, từ vựng và luyện tập lưu cùng một giao dịch trong Cloud. Dù bài nháp, câu luyện tập đã thêm phải có nội dung/đáp án hợp lệ trước khi lưu máy chủ; bản soạn dở vẫn được lưu trên thiết bị. Có cảnh báo khi rời trang còn thay đổi chưa lưu.
5. Học viên mở bài học, đọc lý thuyết, bấm **Bắt đầu luyện tập** ở cuối bài để mở **màn hình luyện tập riêng** (cùng tab trình duyệt). Màn hình này không hiển thị lý thuyết phía trên; bắt đầu, tiếp tục, xem kết quả và làm lại đều dùng màn hình riêng. Nút **Quay về bài học** trả về đúng bài gốc, tải lại lịch sử; câu trả lời được lưu trước khi quay về. Chọn/nhập rồi Kiểm tra (hoặc Enter với ô nhập). Có tiến độ, số câu, trước/sau; đổi câu giữ câu trả lời. Tự lưu sau 600 ms và khi quay về bài; lỗi lưu/xung đột hiện thông báo để tải lại trạng thái.
6. **Hoàn thành luyện tập** chấm các câu còn lại, hiện số câu đúng, tỷ lệ, điểm, phần cần ôn; có Luyện tập lại / Quay về bài học. Lịch sử nằm ngay trong bài học; lượt đang làm được tiếp tục thay vì tạo trùng. Bài chưa có câu hoặc bị tắt luyện tập không hiện nút bắt đầu vô dụng.

### Quy tắc dữ liệu, kiểm tra và điểm

- `PracticeDocument` chứa `lesson_id, version, questions, layout?, media_keys, enabled, source_exam_id?`. Mỗi bài tối đa 200 câu, tài liệu tối đa 2 MB; ID câu không trùng. Layout/phần/nhóm từ đề cũ được giữ để học liệu nghe/đọc không mất ngữ cảnh.
- `Question` bổ sung `title?`, `hint?`, `max_attempts?`, `reveal_mode?` (`after_attempts`/`after_check`), `check_mode?` (`manual`/`instant`). Trắc nghiệm một/nhiều, điền một/nhiều ô, nối dùng chung chuẩn đáp án của đề thi.
- `PracticeRun.checks[questionId]` lưu `tries, response, correct, score, locked, revealed, slot_correct?`. Sai khi còn lượt được sửa; đúng/hết lượt/after_check sẽ khóa câu và mở đáp án, giải thích. Chọn Xem đáp án khóa câu và cho 0 điểm. Nộp chốt mọi câu. Câu đã khóa không thể thay đáp án bằng API; snapshot và revision giữ kết quả cũ khi admin sửa bộ câu.
- Cloud dùng `check_practice_answer → practice_check → score_question_v4`; demo/preview dùng `checkPractice → scoreQuestion`. Chuẩn hóa NFC/hoa thường/khoảng trắng như đề thi, không tự suy diễn từ đồng nghĩa. Mỗi ô có feedback riêng; điểm nhiều ô chia đều, tổng điểm phải chia hết số ô.
- `practice_payload` không gửi answers/explanation trước khi câu khóa; transcript nhóm chỉ mở sau khi kết thúc cả lượt, rubric không gửi cho học viên. Summary không có đáp án. Tables bật RLS và thu hồi mọi quyền trực tiếp của anon/authenticated; RPC quản trị kiểm tra admin, RPC lượt làm chỉ cho chủ lượt đang active và đã đổi mật khẩu tạm.
- Luyện tập không cộng XP mới. 20 XP hoàn thành lý thuyết và XP thi/lịch sử cũ giữ nguyên. Tự luận được bảo toàn và cho tự đối chiếu bài mẫu, không chấm đúng/sai, không tính vào mẫu số tỷ lệ chính xác; tự luận thi chứng chỉ vẫn qua quản trị chấm như cũ.
- Media vẫn qua Worker/R2. RPC quyền đọc/xóa mở rộng cho tài liệu practice và snapshot; file lịch sử còn dùng không thể xóa. Không cần biến môi trường hay Worker route mới.

### Chuyển bài ôn cũ an toàn

Chạy `006_lesson_practice.sql` trong SQL Editor sau 004 (005 chỉ dành cho Storage cũ). Migration tạo bảng/RPC, sao chép đề loại **Bài tập** đã gắn `lesson_id` vào practice, giữ nguyên đề nguồn, versions, lượt làm, đáp án và XP cũ. `ON CONFLICT DO NOTHING` cùng khóa duy nhất lesson/source giúp chạy lại không nhân bản hay ghi đè nội dung đã chỉnh. Demo thực hiện chuyển tương đương qua `upgradePractice` trong `linguanest_workspace_v2` và cờ `practice_migration`.

Bài tập cũ chưa gắn bài học không tự đoán nơi chuyển: vào bài học → tab Bài tập luyện tập → **Chuyển bài ôn tập cũ vào bài học → Đưa vào bản soạn → Lưu**. Chỉ các bài cùng ngôn ngữ và chưa chuyển mới được chọn; bản nguồn vẫn giữ nguyên. Mỗi practice có một nguồn chuyển đổi; cần chọn bài học khác nếu đã có nguồn. Bản sao bài học tạo ID câu mới và bỏ liên kết nguồn.

`learningExam()` lọc loại Bài tập và nguồn đã chuyển ra khỏi danh sách Đề thi học viên/quản trị. Đề chứng chỉ hoặc bài kiểm tra tổng hợp giữ hệ thống thi riêng. Mẫu Tùy chỉnh là khung bài kiểm tra tổng hợp, không tự gán loại Bài tập. Đề nguồn đã chuyển không được bắt đầu/sửa mới qua RPC; lượt bài tập cũ vẫn mở, tiếp tục/nộp và xem trong mục Bài học qua Lịch sử bài tập cũ (007). Nội dung practice đã sửa không ghi ngược lên đề nguồn.

Sau migration, triển khai frontend mới. Không cần chạy lại seed, xóa localStorage hoặc chuyển file R2. Kiểm thử local không tự áp dụng SQL vào project Supabase thật. Nếu UI báo thiếu RPC `list_lesson_practices`, kiểm tra đã chạy 006 trên đúng project chưa.


Kiểm chứng bản nâng cấp bài học ngày 24/10/2026: `npm run check`, `npm run build`, `npm run validate:data`, `npm --prefix media-worker run check` đạt; `npm test` đạt **35/35**; bộ UI đầy đủ đạt **12/12** trên Edge desktop và mobile giả lập. Đã xem ảnh câu điền/trắc nghiệm và kiểm tra không tràn ngang, hai cột desktop/một cột mobile. Sau rà soát nhập liệu và CSS, chạy lại UI luyện tập (4/4) và build. Ô nhập lớn được kiểm tra chiều cao tối thiểu 64 px; selector được ưu tiên trên CSS form chung và khung media rỗng không chiếm khoảng trống. Repository chưa có script/config lint riêng; không ghi nhận lint là đã chạy. Cloud được kiểm tra bằng RPC adapter mock và PostgreSQL/PGlite với Auth giả lập; R2 dùng mock. Chưa áp dụng migration, deploy hay kiểm tra session/upload trên Supabase/R2 thật.


Cập nhật điều hướng luyện tập: `App.tsx` thêm Page `practice` và state `practiceRun`; `LessonPractice` chỉ chứa khu vực bắt đầu/lịch sử và tải lượt làm qua API rồi gọi `onOpen`. `PracticePlayer` render độc lập trong vùng nội dung, vẫn giữ sidebar và chọn mục Bài học. Đổi màn hình đặt lại vị trí cuộn; rời bằng menu hoặc đổi tài khoản xóa state màn hình, không xóa lượt đã lưu. Không đổi schema/API/R2 và không thêm router/URL mới (ứng dụng vẫn điều hướng bằng state). Kiểm tra bằng build và `tests/ui/practice.spec.ts` trên desktop/mobile: không còn lý thuyết trong màn hình luyện tập, quay về đúng bài, tiếp tục/làm lại và mở kết quả từ lịch sử.

Kết quả kiểm tra điều hướng riêng: `npm run build` đạt; `npm run test:ui -- tests/ui/practice.spec.ts` đạt **4/4** trên desktop/mobile. Đã xem ảnh màn hình luyện tập độc lập để xác nhận phần lý thuyết không còn nằm phía trên.


## Trạng thái học cá nhân và lịch sử đề thi (migration 007)

- **Chưa học:** ô trung tính khi chưa mở/hoàn thành bài và chưa có lượt luyện tập.
- **Đang học:** ô vàng sau khi mở lý thuyết hoặc đang làm bài nhưng chưa hoàn thành luyện tập. Bấm hoàn thành lý thuyết vẫn vàng nếu bài có bộ luyện tập đang mở; bài chỉ có lý thuyết chuyển xanh khi bấm hoàn thành.
- **Đã hoàn thành luyện tập:** ô xanh kèm **điểm lần hoàn thành gần nhất**, kể cả 0 điểm (xanh chỉ biểu thị đã làm, không khẳng định đạt/đúng hết). Khi đang làm lại, giữ điểm cũ và thêm nhãn Đang luyện tập lại. Điểm/tổng điểm lấy từ snapshot lượt đã hoàn thành, không lấy bộ câu hiện tại của admin. Tự luận practice không có điểm tự chấm hiển thị Đã tự đối chiếu.
- Nhãn hiện ở danh sách bài, đầu bài học và khu vực bắt đầu luyện tập. Lịch sử luyện tập trong bài hiện thêm điểm từng lượt. `PracticePlayer.onComplete` làm mới summary; mở bài và bắt đầu/tiếp tục luyện tập cũng tải lại summary. `App.refreshStats` bỏ response cũ hoặc của tài khoản đã rời để tránh ghi đè trạng thái mới.
- **Tiến độ & lịch sử đề thi** chỉ hiển thị lượt thi chuyên dụng/bài kiểm tra tổng hợp, số đề đã nộp và XP từ thi. Tổng XP toàn bộ vẫn giữ ở thanh trên và Tổng quan; không viết lại XP cũ. `exam_history` lọc bài tập cũ **trước LIMIT/OFFSET**, nên trang không bị rỗng giả do lọc phía client.
- Lượt bài tập cũ kiểu Bài tập hoặc nguồn đã chuyển được đọc qua `lesson_exam_history`: hiện tại bài học tương ứng. Nếu chưa gắn bài, hiện ở cuối danh sách Bài học trong khu vực Bài tập cũ chưa gắn bài học. Vẫn xem/tiếp tục bằng ExamPlayer; quay lại đúng bài/danh sách thay vì lịch sử thi. Không xóa bản ghi, không mất điểm cũ, không chặn chấm tự luận cũ.

**Database:** chạy `007_study_status.sql` sau 006, có thể chạy lại. Thêm `lesson_study_starts` khóa `(user_id, lesson_id)`, chỉ ghi lần đầu bằng `begin_lesson(p_id)`; danh tính người học lấy từ `auth.uid()` trên server. Bảng bật RLS và không cấp đọc/ghi trực tiếp cho frontend. View nội bộ `lesson_exercise_sources` ánh xạ bài tập cũ sang bài học, không cấp quyền frontend. RPC `lesson_study_status` tổng hợp lượt practice, lượt bài tập cũ và hoàn thành lý thuyết của đúng người gọi; không trả đáp án. `learning_summary` giữ mọi field cũ và thêm `lesson_status`, `dedicated_exam_count`, `exam_xp`. Các RPC trạng thái/lịch sử kiểm tra active/password gate; không nhận user ID do client tự chọn. Chỉ đọc bài không cấp XP và không tự đánh dấu hoàn thành.

**Demo:** `demoBeginLesson`, `demoStudyStatus`, `demoExamHistory`, `demoLessonExamHistory` mô phỏng cùng cách tính/lọc; không chuyển demo thành hệ thống nhiều tài khoản. Cloud lưu riêng theo tài khoản Supabase và đồng bộ giữa các thiết bị khi tải lại dữ liệu.

**Kiểm tra thay đổi:** `tests/database.test.mjs` có kiểm tra hai tài khoản không thấy tiến độ nhau, ghi bắt đầu không cấp XP, lặp không trùng, điểm 0/lần gần nhất và giữ snapshot, nâng cấp lặp lại, lọc trước phân trang và bảo toàn lịch sử bài tập cũ. `tests/practice.test.mjs` kiểm tra Demo, màu trạng thái và RPC adapter. UI desktop/mobile kiểm tra vàng khi đọc, xanh/điểm khi làm xong, điểm vẫn còn lúc làm lại, bài lý thuyết không có câu và lịch sử thi riêng. Thay đổi này không cần cấu hình Worker/R2 mới; chưa áp dụng migration vào Supabase thật.


Kiểm chứng phần trạng thái học và lịch sử ngày 24/10/2026: `npm run check` đạt; `npm test` đạt **39/39**; bộ UI đầy đủ đạt **12/12**. Sau khi bổ sung kiểm tra lịch sử bài tập cũ, chỉnh màu chữ trạng thái và nhãn quay về bài học, chạy lại `npm run test:ui -- tests/ui/practice.spec.ts` đạt **6/6** trên desktop/mobile, cùng `npm run build` đạt. Đã xem ảnh danh sách bài học và kiểm tra không tràn ngang trên mobile. Bộ test hiện có 14 trường hợp UI; chưa chạy lại toàn bộ 14 trong một lượt. Các test mới xác nhận đọc bài không tự cộng XP, phân tách tài khoản, điểm 0 và điểm gần nhất khi làm lại, lọc trước phân trang, migration 007 chạy lại an toàn, lịch sử bài tập cũ vẫn mở được và quay về đúng nơi. Chưa áp dụng 007 trên Supabase thật; cần chạy migration này trước khi triển khai frontend mới. Không có cấu hình lint riêng trong repository.

## Cập nhật hồ sơ và nghe trong bài ngày 25/10/2026

- Tài khoản → Hồ sơ: chọn ảnh JPG/PNG/WebP tối đa 2 MB để xem trước, thay ảnh hoặc xóa về chữ cái tên; bấm **Lưu hồ sơ** để áp dụng cả tên và ảnh. **Hủy thay đổi** khôi phục bản đã lưu; rời trang có cảnh báo nếu chưa lưu. Sidebar giữ ảnh đã lưu trong lúc xem trước. Nút chọn ảnh hỗ trợ bàn phím. Frontend dùng `Avatar`, `lib/avatar.ts` và các API avatar; cloud dùng Worker/R2 với migration 008, demo dùng hồ sơ localStorage.
- Bỏ trang/menu Luyện nghe; khối có transcript trong từng bài học cung cấp nghe audio hoặc giọng mẫu, chép lại và đối chiếu. Không thay đổi dữ liệu bài học, điểm hoặc XP.
- Quyền menu theo tài khoản: thành viên không thấy Quản trị; admin vẫn thấy kể cả đang ở trang học. Demo mặc định admin. Kiểm thử UI dùng thêm hồ sơ member để xác nhận.
- Đã kiểm tra: `npm run check`, `npm run build`, `npm --prefix media-worker run check` đạt; `npm test` đạt **43/43**; toàn bộ `npm run test:ui` đạt **18/18** trên Edge desktop/mobile giả lập. Sau chỉnh nút chọn ảnh, build và UI `account.spec.ts` đạt lại **4/4**. Đã xem ảnh hồ sơ desktop/mobile và kiểm tra không tràn ngang. Cloud được kiểm tra qua adapter/Worker mock và SQL PGlite; chưa áp dụng 008 hay triển khai/kiểm tra trên Supabase/R2 thật. Chạy 008 sau 007 trước khi triển khai Worker và frontend mới.

Điều chỉnh nút **Lưu hồ sơ**: chọn/thay/xóa ảnh chỉ đổi phần xem trước trên form; tên và ảnh được áp dụng khi bấm lưu, sidebar/localStorage giữ dữ liệu đã lưu trước đó trong lúc sửa. Có nút Hủy thay đổi, trạng thái chưa lưu, cảnh báo rời trang và giữ bản đang sửa khi lưu lỗi để thử lại. Chỉ sửa frontend và kiểm thử UI, dùng nguyên API/Worker/migration 008 hiện có; không cần migration mới. Kiểm chứng local: `npm run check`, `npm run build` đạt; `npm run test:ui -- tests/ui/account.spec.ts` đạt **4/4** desktop/mobile, gồm lưu cả tên/ảnh, hủy, rời trang, lỗi lưu/thử lại, xóa ảnh chờ lưu và bảo toàn sidebar/storage trước khi lưu. Chưa triển khai hoặc kiểm tra trên dịch vụ thật.

## Bảng xếp hạng nhóm (migration 009)

- Menu **Bảng xếp hạng** cho cả admin và thành viên mở trang xếp theo tổng XP giảm dần, hiển thị hạng, tên và ảnh. Có vị trí/XP cá nhân, số thành viên, đánh dấu Bạn, màu ba hạng đầu, nút Làm mới và trạng thái tải/lỗi/thử lại. Cùng XP dùng cùng hạng; thứ tự phụ theo tên rồi ID. Tài khoản chưa có ảnh dùng chữ cái tên, 0 XP vẫn xuất hiện; tài khoản bị khóa hoặc chưa đổi mật khẩu tạm không tham gia.
- `xp_leaderboard()` tổng hợp toàn bộ lịch sử theo đúng công thức `learning_summary`, không phụ thuộc phân trang hoặc ngôn ngữ đang chọn; không thay đổi XP đang có. RPC chỉ cho người dùng active/đã đổi mật khẩu tạm gọi, trả thông tin tối thiểu. Profile đầy đủ, lịch sử và đáp án giữ quyền truy cập cũ.
- Worker thêm `GET /members/<uuid>/avatar` để người trong nhóm xem ảnh hiện tại trên bảng; kiểm tra session và trạng thái cả người xem lẫn tài khoản đích. Quyền cập nhật/xóa ảnh vẫn chỉ dành cho chính tài khoản đó. Không công khai R2, không thêm bucket/secret/cấu hình môi trường.
- Demo chỉ xếp hồ sơ hiện có trên trình duyệt, dùng tên/ảnh đã lưu và XP demo thật; không tạo thành viên giả. Test UI có bộ dữ liệu nhóm mock riêng để kiểm tra nhiều hàng, đồng hạng, ảnh mặc định và tên dài; các kiểm thử này không tạo tài khoản dịch vụ thật.
- Kiểm chứng local ngày 25/10/2026: `npm run check`, `npm run build`, `npm --prefix media-worker run check` đạt; `npm test` **47/47**; toàn bộ `npm run test:ui` **22/22** trên Edge desktop/mobile giả lập. Đã xem ảnh bảng xếp hạng hai viewport và kiểm tra không tràn ngang. SQL được kiểm tra qua PGlite với Auth giả lập, Worker/R2 dùng mock; chưa áp dụng migration/deploy/kiểm tra dịch vụ thật. Chạy **009 sau 008**, rồi triển khai Worker/frontend để dùng trên cloud. Migration có thể chạy lại.
