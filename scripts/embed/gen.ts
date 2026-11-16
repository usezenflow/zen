// Training phrasings for the class heads: ~25 hand-written titles per TaskClass (Vietnamese, English, mixed), each
// with variants: no diacritics, a 1-letter typo, object-first order, filler words ("nhớ", "phải", "cần").
// Writes scripts/embed/build/train.jsonl. Held-out titles are in heldout.jsonl and never come from here.
// Run: node scripts/embed/run.mjs scripts/embed/gen.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { noDiacritics, rng, typo } from "./noise.ts";

const PHRASES: Record<string, string[]> = {
  code: [
    "code API đăng nhập", "viết hàm sắp xếp danh sách", "implement cache cho API", "lập trình chức năng thanh toán",
    "code màn hình login", "code tính năng export csv", "implement retry queue", "viết script migrate database",
    "code parser cho file json", "viết thuật toán tìm đường", "làm API upload ảnh", "build REST endpoint cho orders",
    "implement websocket chat", "code component dashboard", "viết hàm tính thuế", "code trang chủ mới",
    "deploy kubernetes lên cluster staging", "setup redis cluster", "viết terraform module cho VPC", "config nginx reverse proxy",
    "làm prototype figma cho màn onboarding", "dựng pipeline CI cho repo", "implement oauth login", "code chatbot nhỏ bằng python",
    "viết service gửi thông báo", "cài đặt thuật toán dijkstra", "lập trình game caro",
  ],
  fix: [
    "fix bug đăng nhập", "sửa lỗi crash màn hình chính", "debug memory leak", "fix lỗi hiển thị trên iPhone",
    "sửa bug thanh toán", "debug lỗi 500 ở API", "fix flaky test", "sửa lỗi font chữ tiếng Việt", "fix crash khi mở app",
    "xử lý bug timezone", "debug query chậm", "sửa lỗi không gửi được OTP", "fix bug scroll bị giật", "hotfix lỗi production",
    "fix null pointer ở checkout", "debug vì sao build fail", "sửa lỗi upload ảnh", "fix issue #123", "tìm lỗi trong hàm parse",
    "sửa lỗi đồng bộ dữ liệu", "fix bug dark mode", "debug lỗi CORS", "sửa bug tính sai VAT",
  ],
  review_code: [
    "review PR của Minh", "review code module thanh toán", "review pull request auth", "review code phần search",
    "code review PR 45", "review pr feature cart", "duyệt PR của đồng nghiệp", "review code đoạn sync",
    "review pull request migrations", "review code trước khi merge", "check PR refactor navigation", "review code frontend tuần này",
    "review MR của backend", "duyệt code review cho login", "review PR fix logout", "review code bộ test",
    "review code phần payment", "đọc PR và comment", "review code cho bản release", "xem lại PR của Hoa",
    "review pull request config", "review code của team mobile", "review PR thêm cache", "review code phần notification",
  ],
  write_doc: [
    "viết báo cáo tiến độ tháng", "viết tài liệu API", "viết proposal dự án mới", "viết doc onboarding", "viết report quý 3",
    "viết báo cáo thử nghiệm", "soạn tài liệu hướng dẫn cài đặt", "viết proposal cho khách", "viết tài liệu kiến trúc",
    "draft design doc cho feature", "write runbook cho on-call", "viết README cho repo", "viết báo cáo kết quả khảo sát",
    "viết tài liệu nghiệm thu", "soạn đề xuất ngân sách", "viết report sprint review", "viết spec tính năng",
    "viết release notes", "viết postmortem sự cố", "viết báo cáo chi phí dự án",
  ],
  essay: [
    "viết tiểu luận triết học", "viết bài luận văn học 3 trang", "tiểu luận kinh tế vi mô", "viết essay về biến đổi khí hậu",
    "viết bài luận cho môn lịch sử", "essay về giáo dục", "tiểu luận marketing", "viết tiểu luận phân tích tác phẩm",
    "viết bài luận về AI", "hoàn thiện tiểu luận nhóm", "viết bài tiểu luận 2000 chữ", "nộp bài luận kinh tế",
    "viết essay 500 từ", "tiểu luận đạo đức nghề nghiệp", "bài luận tâm lý học xã hội", "viết draft tiểu luận",
    "viết đoạn mở bài tiểu luận", "tiểu luận chính trị học", "viết essay cho học bổng", "chỉnh sửa tiểu luận",
  ],
  slides: [
    "làm slides thuyết trình dự án", "làm powerpoint cho buổi demo", "chuẩn bị slide báo cáo quý", "làm deck pitch cho nhà đầu tư",
    "slides sản phẩm cho khách", "thuyết trình về blockchain", "soạn slide 10 trang", "làm pptx cho lớp",
    "hoàn thiện slide họp board", "chỉnh slide thuyết trình", "make slides cho team review", "làm deck onboarding nhân viên",
    "slide bài giảng chương 2", "chuẩn bị bài thuyết trình nhóm", "làm slide cho seminar", "thiết kế slide cho sales",
    "làm slide về marketing plan", "làm deck demo sản phẩm", "làm slides giới thiệu công ty", "slide kế hoạch năm",
    "bài thuyết trình môn kinh tế",
  ],
  thesis: [
    "viết luận văn thạc sĩ chương 3", "làm khóa luận tốt nghiệp", "viết đồ án tốt nghiệp", "thesis chương 2 tổng quan",
    "KLTN chương thiết kế hệ thống", "viết luận văn phần kết quả thực nghiệm", "hoàn thiện khóa luận", "DATN chương 4",
    "viết mở đầu luận văn", "chỉnh sửa luận văn theo góp ý thầy", "viết chương cơ sở lý thuyết luận văn", "thesis literature review",
    "viết kết luận khóa luận", "làm luận văn tốt nghiệp", "viết phần phương pháp nghiên cứu luận văn", "viết luận văn cao học",
    "xong chương 1 khóa luận", "viết tổng quan tài liệu thesis", "nộp bản thảo luận văn cho giáo viên hướng dẫn",
    "khóa luận tốt nghiệp chương 5",
  ],
  exam_review: [
    "ôn thi giữa kỳ giải tích", "ôn tập toán rời rạc", "ôn thi cuối kỳ kinh tế", "ôn tập chương 4 vật lý",
    "ôn thi cuối kỳ mạng máy tính", "học bài thi sinh học", "ôn lại kiến thức hóa hữu cơ", "luyện đề thi toán 12",
    "ôn đề thi cuối kỳ lịch sử", "ôn thi giải tích 2", "ôn tập cấu trúc dữ liệu cho kỳ thi", "ôn thi đại học môn văn",
    "ôn thi công chức", "ôn tập toán cao cấp cuối kỳ", "ôn thi cuối học kỳ môn địa", "học bài thi môn lịch sử đảng",
    "ôn đề cương môn sinh", "ôn đề thi hết môn triết", "ôn thi bằng lái xe lý thuyết", "ôn tập luật dân sự cho kỳ thi",
  ],
  homework: [
    "làm bài tập toán trang 45", "làm btvn vật lý", "bài tập về nhà hóa", "làm bài tập tiếng anh unit 5",
    "làm bài tập lập trình về nhà", "làm bt giải tích", "làm bài tập chương 3 sinh", "hoàn thành bài tập về nhà",
    "làm homework toán", "làm bài tập 1-10 trang 20", "làm bài tập xác suất", "làm bài tập cấu trúc dữ liệu",
    "bài tập về nhà môn văn", "làm bài tập sinh học", "làm bài tập đọc hiểu", "BTVN kinh tế vi mô",
    "làm bài tập vật lý đại cương", "làm bài tập viết đoạn văn", "làm 20 câu bài tập chương 2", "làm bài tập đại số tuyến tính",
  ],
  read: [
    "đọc chương 3 giáo trình kinh tế", "đọc 20 trang sách Atomic Habits", "đọc tài liệu hệ thống phân tán", "đọc paper về transformer",
    "đọc sách Dune 50 trang", "đọc 2 chương của Sapiens", "đọc tài liệu onboarding", "đọc báo cáo tài chính quý",
    "đọc bài báo khoa học", "đọc cuốn tiểu thuyết trăm năm cô đơn", "đọc docs của React", "read RFC 7230",
    "đọc 30 trang giáo trình", "đọc phần 2 của sách marketing", "đọc tài liệu kỹ thuật về Kafka", "đọc chương 5 sách quản trị",
    "đọc tóm tắt bài báo", "đọc 1 cuốn sách về lịch sử", "đọc chương 7 nguyên lý kế toán", "đọc design doc của team",
    "đọc truyện ngắn Nam Cao", "đọc bài thơ Chiều tối",
  ],
  language: [
    "học tiếng Anh 30 phút", "luyện IELTS speaking part 2", "ôn TOEIC listening", "học tiếng Nhật 20 từ vựng",
    "luyện tiếng Hàn", "luyện speaking mỗi tối", "học từ vựng tiếng Trung", "nghe podcast tiếng Anh",
    "luyện nói tiếng Anh với bạn", "học ngữ pháp tiếng Anh unit 4", "luyện writing IELTS task 1", "học 10 từ tiếng Đức",
    "luyện phát âm tiếng Anh", "làm đề TOEIC part 5", "học tiếng Pháp Duolingo", "English vocabulary 20 words",
    "practice English listening 15 minutes", "luyện nghe tiếng Anh", "học tiếng Tây Ban Nha", "luyện viết tiếng Anh",
    "ôn từ vựng IELTS", "học tiếng Nhật N3", "tập nói tiếng Hàn", "luyện speaking tiếng Anh cùng tutor",
  ],
  skill: [
    "học guitar 30 phút", "tập piano bài Canon", "học vẽ tranh màu nước", "luyện ghi ta bài mới", "học nhảy hip hop",
    "học dàn trống", "học cắm hoa", "học làm bánh", "học đàn ukulele", "học vẽ digital", "học ký hiệu nhạc",
    "học thổi sáo", "học thư pháp", "học làm gốm", "học đan len", "học photography chỉnh sáng", "luyện giọng hát 15 phút",
    "học nhảy zumba", "tập ghi ta solo", "học nhạc lý", "học chụp ảnh", "học may vá", "học làm video edit",
  ],
  workout_gym: [
    "tập gym ngực tay", "đi gym chân", "tập gym 1 tiếng", "tập ta chân lưng", "gym ngực tối nay", "tập tạ vai",
    "squat và deadlift ở gym", "tập gym cardio 20 phút", "đi phòng gym tối nay", "tập gym lưng bụng", "bench press 5x5",
    "tập tạ đẩy ngực", "chest day ở gym", "leg day", "tập gym với PT", "tập tay trước 4 hiệp", "gym core 15 phút",
    "push day tập tạ", "tập gym sáng sớm", "tập cơ bụng ở phòng gym",
  ],
  workout_run: [
    "chạy bộ 5km", "chạy bộ buổi sáng", "chạy 30 phút quanh hồ", "đi chạy bộ với bạn", "chạy 10 km cuối tuần",
    "chạy interval 400m", "tập chạy bộ nhẹ", "chạy bộ 45 phút", "ra đường chạy", "chạy bộ tối", "chạy marathon chuẩn bị",
    "tempo run", "jog 20 phút", "chạy 3km trên máy", "treadmill 30 phút", "run 5k", "chạy bộ trước khi làm việc",
    "long run chủ nhật", "chạy bộ giảm cân", "chạy hồ Tây", "chạy cùng nhóm run club", "chạy đua 10km",
  ],
  workout_yoga: [
    "tập yoga buổi sáng", "yoga 20 phút", "tập yoga giãn cơ", "yoga flow tối nay", "tập asana", "yoga cho lưng",
    "tập yoga nhẹ trước khi ngủ", "lớp yoga chiều thứ 3", "yoga vinyasa 45 phút", "làm bài tập yoga", "yoga để thư giãn",
    "tập yoga cùng YouTube", "yoga sáng chủ nhật", "tập yoga hồi phục cơ", "yoga 30 phút", "đi lớp yoga", "tập yoga với app",
    "yoga bài đứng",
  ],
  workout_swim: [
    "đi bơi 30 phút", "bơi 1km ở hồ bơi", "bơi lội buổi sáng", "tập bơi sải", "đi bơi với con", "bơi 20 vòng",
    "swim 40 phút", "hồ bơi chiều thứ 7", "bơi bướm 50m", "bơi lội giảm cân", "đi hồ bơi", "đi bơi hồ Tây", "bơi 2000m",
    "tập bơi kỹ thuật", "bơi ếch 30 phút", "lap swimming buổi sáng", "bơi tự do 1km", "đi bơi cùng bạn",
    "bơi nhẹ sau giờ làm", "đi bơi cuối tuần",
  ],
  habit_read: [
    "đọc sách 20 phút mỗi ngày", "đọc sách trước khi ngủ", "đọc 10 trang mỗi tối", "thói quen đọc sách hằng ngày",
    "daily reading 15 phút", "đọc sách buổi sáng", "đọc sách mỗi ngày", "đọc sách thư giãn tối", "đọc 30 phút mỗi ngày",
    "read 20 minutes daily", "đọc sách đều đặn", "đọc sách cho bản thân", "đọc tiểu thuyết buổi tối",
    "đọc một trang sách mỗi ngày", "giữ thói quen đọc sách", "đọc sách hằng đêm", "đọc 5 trang sách hằng ngày",
  ],
  habit_meditate: [
    "thiền 10 phút", "thiền buổi sáng", "meditation 15 phút", "ngồi thiền trước khi ngủ", "thiền định 20 phút",
    "tập thiền mỗi ngày", "thiền hít thở", "meditate 10 min", "thiền chánh niệm", "thiền ngắn 5 phút",
    "luyện thiền trước khi làm việc", "thiền quán", "thiền sáng sớm", "mindfulness 10 phút", "ngồi thiền 30 phút",
    "thiền để ngủ ngon", "thiền buổi tối", "thiền 5 phút sau bữa trưa", "tập thiền đều đặn", "meditation trước khi ngủ",
  ],
  habit_journal: [
    "viết nhật ký buổi tối", "journal 10 phút", "viết nhật ký biết ơn", "ghi nhật ký mỗi ngày", "viết nhật ký cảm xúc",
    "viết journal sáng", "viết vài dòng nhật ký", "nhật ký hôm nay", "viết nhật ký trước khi ngủ",
    "ghi chép cảm xúc hằng ngày", "viết nhật ký gratitude", "journaling 15 phút", "ghi nhật ký thói quen",
    "viết nhật ký tuần", "viết nhật ký ngắn", "viết nhật ký lúc 9 giờ tối", "write journal daily", "viết nhật ký suy ngẫm",
    "ghi nhật ký tâm trạng",
  ],
  clean: [
    "dọn nhà cuối tuần", "dọn phòng ngủ", "lau nhà", "dọn bếp sau bữa tối", "dọn dẹp phòng khách", "lau bếp",
    "clean nhà tắm", "dọn tủ quần áo", "dọn garage", "hút bụi phòng khách", "lau kính cửa sổ", "dọn dẹp bàn làm việc",
    "dọn toilet", "lau sàn bếp", "vệ sinh nhà cửa", "dọn đồ đạc trong phòng", "dọn tủ lạnh", "dọn nhà đón Tết",
    "lau dọn phòng trọ", "quét nhà", "dọn bàn học", "tổng vệ sinh bếp", "dọn dẹp nhà cửa chiều thứ 7",
  ],
  laundry: [
    "giặt đồ", "giặt quần áo", "phơi đồ", "giặt ủi áo sơ mi", "giặt chăn ga", "giặt đồ sáng mai", "ủi đồ",
    "gấp đồ đã phơi", "giặt giày", "gửi giặt là", "lấy đồ giặt", "giặt khăn tắm", "phơi chăn", "giặt đồ bằng máy",
    "đi giặt ủi", "giặt áo khoác", "giặt rèm", "ủi quần áo đi làm", "giặt đồ lót", "giặt đồ thể thao",
    "là áo cho ngày mai",
  ],
  cook: [
    "nấu cơm tối", "nấu canh chua", "nấu phở", "nấu bữa tối cho cả nhà", "cook pasta", "nấu món kho tộ", "nấu cháo cho bé",
    "nấu bún bò", "làm cơm trưa", "nấu súp", "nấu thịt kho tàu", "chuẩn bị bữa tối", "nấu ăn cho gia đình",
    "nấu lẩu", "làm món gà rang", "nấu chè", "chuẩn bị đồ ăn cho tuần", "meal prep cho tuần", "nấu cơm hộp",
    "nấu canh rau", "nấu mì gói", "nấu xôi",
  ],
  shop: [
    "đi chợ mua rau", "mua đồ ăn tuần này", "đi siêu thị mua sữa", "shopping quần áo", "mua quà sinh nhật mẹ",
    "đặt đồ Shopee", "mua pin cho điều khiển", "ghé Vinmart mua trứng", "mua giày chạy", "đi chợ Bến Thành",
    "mua đồ dùng học tập", "mua dầu gội", "đặt hàng online", "order thức ăn", "mua nước giặt", "ra siêu thị",
    "mua kem đánh răng", "mua đồ Tết", "mua đồ cho bé", "mua sạc điện thoại", "mua hoa tặng bạn",
    "đi mua sắm cuối tuần", "mua bánh mì sáng",
  ],
  bill: [
    "đóng tiền điện", "trả tiền nước", "nộp tiền mạng", "đóng học phí kỳ 2", "thanh toán tiền nhà", "trả tiền wifi",
    "đóng tiền điện tháng 11", "nộp tiền internet", "trả tiền thuê nhà", "đóng tiền gas", "thanh toán hóa đơn điện thoại",
    "đóng tiền chung cư", "trả nợ thẻ tín dụng", "nộp học phí", "đóng bảo hiểm xe", "gia hạn bảo hiểm xe máy",
    "đóng bảo hiểm y tế", "thanh toán hóa đơn Netflix", "đóng phí quản lý", "trả tiền truyền hình cáp",
    "đóng tiền điện nước", "trả góp điện thoại", "đóng tiền nhà tháng này", "nộp tiền phòng trọ",
  ],
  budget: [
    "lập ngân sách tháng 12", "lập ngân sách cho gia đình", "tính chi tiêu tháng này", "làm budget cho quý",
    "theo dõi chi tiêu tuần", "lập kế hoạch tài chính năm", "xem lại ngân sách", "tính chi tiêu cuối tháng",
    "review chi tiêu tháng 11", "chia ngân sách đi du lịch", "làm budget dự án", "cân đối thu chi tháng",
    "lập bảng chi tiêu", "tính toán tiền tiết kiệm", "lập kế hoạch chi tiêu Tết", "theo dõi thu chi", "budget tháng sau",
    "đặt hạn mức chi tiêu ăn uống", "lập ngân sách cưới", "tính chi phí sinh hoạt",
  ],
  tax: [
    "khai thuế TNCN", "quyết toán thuế thu nhập", "nộp tờ khai thuế GTGT", "khai thuế hộ kinh doanh",
    "làm quyết toán thuế năm 2025", "nộp thuế TNCN", "khai thuế online", "kê khai thuế cho công ty", "tax filing năm nay",
    "xem thuế phải nộp", "làm tờ khai thuế thu nhập cá nhân", "nộp thuế môn bài", "quyết toán thuế TNCN",
    "đóng thuế nhà đất", "khai thuế thu nhập từ cho thuê nhà", "submit tax return", "tính thuế thu nhập",
    "nộp thuế trước bạ xe", "kê khai thuế quý 3", "làm thuế cho freelancer",
  ],
  paperwork: [
    "làm giấy tờ xin visa", "gia hạn hộ chiếu", "nộp hồ sơ xin việc", "làm căn cước công dân", "làm thủ tục đăng ký tạm trú",
    "xin xác nhận độc thân", "làm lại sổ đỏ", "nộp đơn xin nghỉ phép", "làm sổ hộ khẩu", "đổi giấy phép lái xe",
    "nộp form đăng ký", "gia hạn thẻ ngân hàng", "làm thủ tục nhập học", "xin giấy xác nhận thu nhập",
    "làm lại giấy khai sinh", "nộp hồ sơ vay", "photo giấy tờ xin việc", "đăng ký khai sinh cho con",
    "làm thủ tục chuyển trường", "làm hồ sơ bảo lãnh", "xin cấp lại bằng lái", "nộp giấy đăng ký kết hôn",
    "xin giấy phép kinh doanh",
  ],
  call: [
    "gọi điện cho mẹ", "gọi cho khách hàng", "call bank hỏi thẻ", "gọi điện nhắc đối tác", "gọi điện hỏi giá",
    "call lại cho sếp", "gọi cho bạn cũ", "gọi về nhà", "gọi điện đặt hàng", "điện thoại cho chủ nhà",
    "gọi xác nhận lịch giao hàng", "gọi cho ngân hàng", "gọi điện cho nhà trường", "gọi nhắc anh Nam",
    "call với khách", "gọi video cho ba mẹ", "gọi cho bảo hiểm", "gọi báo lỗi cho nhà mạng", "gọi tổng đài hỏi",
    "gọi cho thợ sửa máy", "gọi hỏi tiến độ", "gọi cho em gái",
  ],
  email: [
    "gửi mail cho khách", "trả lời email của sếp", "gửi email báo giá", "reply mail đối tác", "gửi email xin nghỉ",
    "check email buổi sáng", "gửi mail xác nhận đơn hàng", "trả lời mail khách hàng", "gửi email follow-up",
    "viết mail xin lỗi khách", "send email cho team", "gửi thư mời phỏng vấn", "trả lời mail tuyển dụng",
    "email sếp báo tiến độ", "dọn hộp thư", "gửi mail nhắc thanh toán", "gửi email cảm ơn", "gửi mail đề xuất",
    "soạn mail gửi phòng HR", "reply email hôm qua", "gửi email kèm file", "email cho nhà cung cấp", "inbox zero hôm nay",
  ],
  meeting: [
    "họp team 15 phút", "họp với khách hàng lúc 2 giờ", "standup buổi sáng", "họp dự án tuần này", "sync với PM",
    "họp review sprint", "1-1 với sếp", "họp phòng kinh doanh", "meeting với đối tác", "họp bàn về ngân sách",
    "weekly sync với team", "họp đánh giá quý", "call họp nhóm", "họp kick off dự án", "họp nội bộ",
    "buổi họp với investor", "họp hội đồng", "sync nhanh với design", "họp chiến lược", "họp giao ban",
    "họp retrospective", "họp với khách lúc 9 giờ sáng", "họp tuyển dụng",
  ],
  appointment: [
    "đi khám răng", "hẹn bác sĩ khám tổng quát", "cắt tóc chiều nay", "khám mắt", "đi nha sĩ", "gặp bác sĩ da liễu",
    "hẹn cắt tóc", "đi khám sức khỏe định kỳ", "hẹn spa", "đi bệnh viện tái khám", "gặp nha sĩ làm răng",
    "hẹn gặp bác sĩ tai mũi họng", "tái khám tim mạch", "đặt lịch spa", "khám thị lực", "đi bác sĩ tâm lý",
    "làm răng khôn", "gặp tư vấn viên bảo hiểm", "đi khám da", "gặp luật sư", "hẹn tiệm nail",
    "đi khám tổng quát ở bệnh viện",
  ],
};


// NONE: titles that name no class. Generic or class-less tasks, bare course names, chit chat, greetings, gibberish,
// single words and plain sentences. The rule pass gives these no class, so the head must not either.
const NONE_PHRASES: string[] = [
  "xem phim", "đi chơi", "gặp bạn", "valentine", "đi dạo", "nghỉ ngơi", "ngủ trưa", "làm việc", "làm gì đó", "việc quan trọng",
  "chuyện nhà", "mua ít đồ", "đi đâu đó", "hẹn bạn", "ăn trưa", "uống cà phê", "đi ngủ sớm", "ăn cơm", "dậy sớm", "tắm",
  "làm đẹp", "chụp hình", "xem bóng đá", "chơi game", "nghe nhạc", "đi xem phim tối nay", "sinh nhật bạn", "kỷ niệm ngày cưới",
  "Giáng sinh", "Halloween", "sinh nhật con", "đi uống trà sữa", "ngồi chơi", "lười quá", "đi tập đi", "chơi với mèo",
  "giải tích", "cơ sở dữ liệu", "toán rời rạc", "kinh tế vi mô", "triết học Mác", "lập trình hướng đối tượng", "mạng máy tính",
  "xác suất thống kê", "hóa hữu cơ", "sinh học đại cương", "lịch sử Đảng", "tiếng Anh chuyên ngành", "đại số tuyến tính",
  "vật lý đại cương", "hệ điều hành", "giải tích 2", "pháp luật đại cương", "kinh tế lượng", "marketing căn bản",
  "chào buổi sáng", "hello", "haha", "ok nha", "cảm ơn nhé", "ừ được rồi", "ê", "alo", "bye", "tạm biệt mọi người",
  "hôm nay trời đẹp quá", "mệt quá", "buồn ngủ", "ờ", "kkk", "hihi", "thôi", "vâng ạ", "tuyệt vời", "đùa thôi",
  "nói chuyện chút", "bạn khỏe không", "ê mày", "hôm qua vui ghê", "hết pin rồi", "trời mưa to quá",
  "asdfgh", "qwerty", "jkljkl", "zzzz", "xyz abc", "aaaa bbbb", "hjkl", "ghfjdk", "lorem ipsum", "...", "???", "!!!",
  "1234", "@@@ ###", "dfgdfg", "ư ư ư", "ààà",
  "nhà", "xe", "tiền", "cơm", "nước", "bánh", "mèo", "hoa", "cafe", "bạn", "nhớ", "phải", "cần", "hôm qua", "sáng", "trưa",
  "chiều", "tối", "thứ hai", "tháng sau",
  "trời hôm nay nóng quá", "mình thích màu xanh", "con mèo đang ngủ", "tin tức hôm nay có gì mới", "ghi chú: không quên",
  "số điện thoại 0901234567", "địa chỉ 12 Lê Lợi", "tuần sau không có gì", "tớ đang nghĩ về bạn", "không có gì đâu",
];

// Object-first: the last word moves to the front ("nộp thuế TNCN" -> "TNCN nộp thuế").
const objectFirst = (s: string) => {
  const w = s.split(" ");
  return w.length < 2 ? undefined : [w[w.length - 1], ...w.slice(0, -1)].join(" ");
};
const FILLERS = ["nhớ ", "phải ", "cần ", "nhớ là phải "];
const SUFFIXES = [" hôm nay", " tối nay", " mai", " cuối tuần"];

const classes = Object.keys(PHRASES);
const out: string[] = [];
const rand = rng(7);
let group = 0;
for (const cls of classes) {
  PHRASES[cls].forEach((base, i) => {
    const g = `${cls}:${i}`;
    const add = (text: string, aug: string) => out.push(JSON.stringify({ text, cls, group: g, aug }));
    add(base, "clean");
    add(noDiacritics(base), "nodiac");
    add(typo(base, rand), "typo");
    add(typo(noDiacritics(base), rand), "nodiac_typo");
    const of = objectFirst(base);
    if (of) add(of, "objfirst");
    const f = FILLERS[Math.floor(rand() * FILLERS.length)];
    add(rand() < 0.5 ? f + base : base + SUFFIXES[Math.floor(rand() * SUFFIXES.length)], "filler");
    group++;
  });
}


// NONE rows: hand-written phrasings, and the reader's eval inputs with no class (build/none_eval.jsonl, from none_eval.ts).
{
  const add = (text: string, aug: string) => out.push(JSON.stringify({ text, cls: "none", group: `none:${text}`, aug }));
  NONE_PHRASES.forEach((base) => {
    add(base, "clean");
    add(noDiacritics(base), "nodiac");
    add(typo(base, rand), "typo");
    add(base + SUFFIXES[Math.floor(rand() * SUFFIXES.length)], "suffix");
  });
  const evalNone = join(dirname(fileURLToPath(import.meta.url)), "build", "none_eval.jsonl");
  for (const row of readFileSync(evalNone, "utf-8").split("\n").filter(Boolean)) {
    const { text } = JSON.parse(row) as { text: string };
    add(text, "eval");
    if (noDiacritics(text) !== text) add(noDiacritics(text), "eval_nodiac");
  }
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "build");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "train.jsonl"), out.join("\n") + "\n");
const bases = Object.values(PHRASES).reduce((n, a) => n + a.length, 0);
console.log(`classes ${classes.length} + none, base phrasings ${bases} + ${NONE_PHRASES.length} none, rows ${out.length}, groups ${group}`);
