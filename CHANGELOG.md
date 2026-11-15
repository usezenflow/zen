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
    - Còn ít việc thì hiện thêm việc sắp tới, kèm ngày như "Mai 7:00"
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
    - "Mỗi 2 tháng", "cách tháng", "2 tháng 1 lần"
    - Nhiều buổi một lần nói: "sáng và tối nào cũng chạy bộ", "mỗi sáng, chiều, tối uống thuốc" thành một việc lặp cho mỗi buổi
    - Nhiều giờ một lần nói: "uống thuốc 7h sáng và 9h tối mỗi ngày" thành hai việc lặp đúng giờ, cùng ngày bắt đầu và kết thúc
    - "Họp t2, t4 9h" là hai buổi họp riêng thứ 2 và thứ 4; nói thêm "hàng tuần" hay "mỗi" thì mới lặp
    - "Sáng hoặc tối": một việc, zen xếp vào buổi nào còn trống; "sáng và tối" là hai việc
    - Việc lặp giữ đúng buổi đã nói ở mọi ngày, không chỉ ngày đầu
- Không nói giờ thì không đoán giờ: "họp nhóm sáng thứ 2", "liên hoan Noel" được xếp linh hoạt trong buổi, trong ngày, thay vì cố định 9:00
- Thi không nói giờ lấy giờ thi thường gặp đầu tiên còn trống: 7:30, 9:30, 13:00, 15:00
- Học bù không nói giờ vẫn được thêm, lấy giờ học đầu tiên còn trống: 7:30, 13:00, 16:45
    - Tránh giờ đã có lớp, có thi, hay việc vừa nói cùng lúc; nói buổi thì chọn trong buổi đó
- Đọc được giờ dính chữ hay gõ sai: "họp nhóm9h", "lớp2 giờ", "2 giiờ chiều", "9 do sang", chữ bị tách như "t ối", "th ứ 2", "m ỗi"
- Chọn ngày giờ mượt hơn
    - Đổi ngày lần đầu là lưu ngay, không phải chọn lại lần nữa
    - Chọn nhanh một chạm: "Hôm nay", "Ngày mai", "Tuần sau"; giờ hạn "23:59", "0:00"; giờ làm "8:00", "14:00", "20:00"
    - Không chọn được ngày đã qua; chọn hôm nay thì giờ chỉ từ bây giờ đến hết ngày
- Chia buổi gọn hơn
    - Buổi ôn thi và bài tập LMS dài tối đa 1h, tròn nửa tiếng (30p hoặc 60p), không còn buổi 45p
    - Việc sắp tới đã có được chia lại theo cách mới; buổi đã xong giữ nguyên, việc đã qua hạn không đổi
    - Lịch thi đổi giờ thì buổi ôn không còn biến mất khỏi lịch
- "Các buổi" nằm trên "Nội dung"; chạm một buổi để mở buổi đó, quay lại vẫn về chỗ cũ
- Chữ gọn hơn: "45p", "1h30p", "8h-11h", "8:00 - 9:30", "16 - 22/11", "16/11", "3 TC", "HK1"
- Lịch học, lịch thi ghi "Từ Online" thay cho "Từ lịch trường"
- Việc lặp theo buổi không còn hiện hạn: "tập thể dục mỗi sáng" hiện "Buổi sáng", không còn "Hạn 12:00" hay "Hạn 0:00"
    - "Mỗi buổi sáng", "buổi tối nào cũng" là việc lặp, gõ không dấu cũng được
    - "Mỗi sáng cuối tuần", "sáng cuối tuần nào cũng" là sáng T7 và CN, không còn thành mỗi ngày
    - Việc lặp được xếp đủ 120 ngày ngay khi nói, không còn tự xếp thêm một tuần khi quay lại
    - Mỗi lần lặp nằm trong đúng ngày của nó; buổi hôm nay đã qua thì bắt đầu từ ngày mai, không dồn sang hôm sau
    - "Các buổi sáng cuối tuần", "sáng cuối tuần hàng tuần", "sáng thứ bảy chủ nhật hàng tuần" cũng là sáng T7 và CN
- Lúc xếp lịch nói đúng việc đang làm: "Xếp 34 buổi Tập thể dục, T7 21/11 - CN 14/3" thay cho từng ngày một, và "Đọc lịch đến 14/3" thay cho "tuần này"
- Giữ một việc để mở menu: menu nằm ngay dưới việc đó (gần cuối màn hình thì nằm trên), không còn che lên việc
- Chi tiết việc hiện giờ bắt đầu và kết thúc: "Làm lúc T2 9:00 - 10:00" thay cho "9:00, 60p"
- Buổi trong ngày theo cách mọi người nói: sáng đến 11h, trưa 11h-13h, chiều 13h-18h, tối 18h-22h, đêm 22h-24h
- Giờ gọn hơn: "7:00" thay cho "07:00"

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
