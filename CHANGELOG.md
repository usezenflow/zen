# zen

## 26.0.1

### Patch Changes

- Sửa lỗi trên Android
    - Ô gõ không còn bị bàn phím che, màn hình không bị đẩy lên thanh trạng thái
    - Giữ để nói hoạt động trên Android 11
    - Giữ nút mà chưa nói gì không còn báo "Không ghi âm được"
    - Nút nói không còn bị thanh điều hướng che
- Widget Hôm nay không còn ô trống
    - Việc cuối hôm nay vẫn ở bên trái, bên phải hiện ngày tới có việc
    - Tuần tới trống thì hiện ngày xa hơn có việc
    - Không có gì sắp tới thì gợi ý vài câu để nói, chạm là mở micro
    - Ngày dày việc vẫn hiện gọn: một con số như "12 việc"
    - Còn ít việc thì hiện thêm việc sắp tới, kèm ngày như "Mai 07:00"
- Tên thứ gọn hơn: "T4" thay cho "Thứ tư"
- Hiểu đúng việc lặp lại
    - "Tối nào cũng đọc sách", "sáng nào cũng chạy bộ", "tuần nào cũng dọn phòng" là việc lặp, không còn thành một việc tên dài
    - Ngày thường, cuối tuần, "thứ 2, 4, 6", "thứ hai đến thứ sáu", "các ngày trong tuần"
    - "2 ngày một lần", "tuần một lần", "tháng 1 lần", "ba buổi một tuần", "mỗi tuần 2 lần", "2 lần/tuần"
    - Trừ ngày: "mỗi ngày trừ chủ nhật", "tối nào cũng trừ thứ 7", "mỗi ngày trừ cuối tuần"
    - "Từ 1/12" là ngày bắt đầu; "đến 20/12", "đến hết tháng 12", "trong 120 ngày" là ngày kết thúc
    - Có ngày kết thúc vẫn giữ buổi đã nói: "tối nào cũng … đến 20/12" vẫn xếp vào buổi tối
    - Không nói giờ thì việc lặp linh hoạt trong buổi; nói giờ thì giữ đúng giờ
    - Câu không nói lặp thì không bao giờ tự lặp

## 26.0.0

### Major Changes

- d3f6057: Bản đầu tiên của zen
  - Giữ nút để nói, hoặc thêm việc từ ảnh, PDF hay gõ phím
  - zen tự xếp việc vào tuần, chỉ xếp lại khi có gì thay đổi
  - Xem theo ngày, tuần, tháng và tìm kiếm
  - Kết nối Online và LMS: lịch học, lịch thi, điểm, học phí, bài tập
  - Xem điểm, học phí và đóng học phí trên trang của trường
  - Widget trên màn hình chính
  - Giao diện sáng và tối, biểu tượng tối trên iPhone
  - Tự cập nhật bản mới từ GitHub
