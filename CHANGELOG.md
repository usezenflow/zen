# zen

## 26.0.3

### Patch Changes

- Số sai hay quá lớn không còn làm hỏng việc
    - Giờ, ngày không có thật ("lúc 25h", "9h99", "32/11", "30/13", "đầu tháng 13") được giữ nguyên trong tên việc, không còn bị đoán thành giờ hay ngày khác
    - Ngày lố cuối tháng vẫn được hiểu: "31/11" là 30/11, "29/2/2027" là 28/2, kèm ghi chú đã chỉnh
    - Năm ghi bao xa cũng giữ đúng: "20/11/2035" là năm 2035; năm đã qua được báo là ngày đã qua
    - "Từ 20/11 đến 19/11" hiểu là từ 19/11 đến 20/11
- Đếm thời gian đúng hơn
    - "3 tuần nữa" là 21 ngày, không còn là 1 tuần; hiểu thêm "100 ngày nữa", "5 tháng nữa", "2 năm nữa"
    - Nói "ba trăm ngày nữa", "một trăm linh năm phút" cũng hiểu
    - "1.5 tiếng" là 90 phút, "3 tiết" là 150 phút
    - Một việc dài nhất 40 tiếng, kể cả "50 hours" hay "99 tiếng rưỡi"
- Việc lặp lại gọn hơn
    - "Học mỗi ngày trước 20/11/2031" là một việc lặp lại, không còn tạo hàng nghìn việc
    - "9 buổi trong tuần sau" là 7 buổi, mỗi ngày một buổi
    - "Mỗi 0 tuần", "0 buổi" không còn tạo lịch lặp hỏng
- Đổi giờ một việc mượt hơn, không còn khựng
    - Lúc đang xoay bánh xe giờ, chưa có gì được lưu hay xếp lại; đóng dòng giờ là lưu một lần, xếp lại một lần
    - Ngay dưới các ô giờ, một dòng nhỏ báo trước: "Sẽ dời Ôn Giải tích sang 16:30", "Sẽ xếp lại 3 việc" hay "Trùng Cơ sở dữ liệu"
    - Đóng lại, những gì bị dời hiện ngay tại chỗ: giờ cũ gạch đi, giờ mới, lý do, kèm "Hoàn tác"
- Giờ đặt sau cùng thắng
    - Đặt một việc đè lên việc khác mà bạn đã đặt giờ trước đó, việc cũ tự nhường chỗ, không còn hai việc chồng lên nhau
    - Việc bị dời đi tìm chỗ gần nhất, không nhảy sang hôm khác; việc ở tuần sau vẫn ở tuần sau
    - Đè lên tiết học, giờ thi hay giờ cố định thì không dời gì, chỉ hỏi: "Dời việc mình" hay "Giữ cả hai"
    - Việc nào hết chỗ thì báo rõ: "Đọc sách chưa có giờ trống"
- Đổi giờ ngay trên danh sách mà làm dời việc khác: thông báo có nút "Xem" để mở lại những gì đã đổi
- Xong hay xoá một việc thì giờ trống được dành cho việc đang chưa có giờ, các việc khác vẫn đứng yên
- Bảng "Sáng nay" chỉ hiện một lần: vuốt sang bên để ẩn, hoặc rời ứng dụng là tự mất; chấm đỏ trên việc bị dời vẫn còn tới khi bạn xem
- Gõ nhiều việc cách nhau bằng dấu phẩy: mỗi việc không còn chép cả câu vào ghi chú
- Nút trong thẻ "hơi gấp" gọn hơn: tên việc canh trái, ngày ở bên phải
- Xếp lịch nhanh hơn khi có nhiều việc

## 26.0.2

### Patch Changes

- Nói hay gõ gì cũng thành việc
    - Câu nào cũng tạo ít nhất một việc, kể cả câu khó hiểu: cả câu thành tên việc, phần còn lại để mặc định
    - Không còn "Mình chưa hiểu câu này"
    - Bỏ lệnh bằng giọng nói: "xong …", "xoá …", "dời … sang …" giờ là tên việc mới; đánh dấu xong, xoá, dời làm ngay trên việc
    - Bỏ ghi chú riêng bằng giọng nói; ghi chú trong từng việc vẫn giữ
- Việc mới không còn "nuốt" việc cũ: "dọn phòng vào thứ 7" khi đã có "Dọn phòng" là một việc mới, không dời việc cũ
- Việc lặp không còn bị nhân đôi khi mở lại ứng dụng
- Gần hạn thì không chia nhỏ
    - Mỗi ngày còn lại tối đa một buổi; còn dưới một ngày thì làm một lần
    - Việc giữ nguyên thời lượng, mỗi buổi dài tối đa 3h
- Đổi tên một buổi của việc lặp vẫn giữ nó trong chuỗi lặp, không sinh thêm bản sao
- Cập nhật tải ngầm: chạm "Cập nhật" là đóng hộp thoại, vòng tiến độ hiện ở trên cùng; tải xong tự mở trình cài
- Biểu tượng "Gặp gỡ" vẽ lại cho rõ
- Mở chi tiết một việc đã bị xoá không còn quay lại nhầm màn hình

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
    - Chọn nhanh một chạm: "Hôm nay", "Ngày mai", "Tuần sau"; giờ hạn "23:59", "0:00"; giờ làm "8:00", "14:00", "17:00", "20:00"
    - Không chọn được ngày đã qua; chọn hôm nay thì giờ chỉ từ bây giờ đến hết ngày
    - Đổi sang ngày mà giờ đã qua thì giờ tự chuyển sang 15p tới
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
- "Có gì mới" dài thì cuộn được, nút luôn hiện; chạm ra ngoài để đóng
- Vòng chọn giờ gọn hơn: 3 hàng, 4 nút chọn nhanh trên 2 hàng, nút rộng, chữ không sát mép; giờ kết thúc luôn sau giờ bắt đầu ít nhất 15p
- Xoá trong "Các buổi" có đủ 3 lựa chọn: buổi này, buổi này và các buổi sau, tất cả
- Xoá một buổi rồi quay lại, "Các buổi" cập nhật ngay, không còn buổi đã xoá
- Chạm việc trên widget khi app đang tắt: quay lại về ngày của việc đó, không còn kẹt ở chi tiết
- Giữ một việc
    - Menu nằm giữa màn hình, mỗi lựa chọn có biểu tượng riêng ở bên trái
    - Việc được nhấc nổi rõ hơn, cả khi giao diện tối
    - Không còn mảng trắng hay đường kẻ ở việc bên dưới
    - Vòng tròn đánh dấu xong tròn đều
- Mọi menu đều có biểu tượng, mỗi lựa chọn một biểu tượng khác nhau
- "Cũng hợp", "Giờ khác" và "Để lại" chỉ hiện khi còn giờ khác thật sự chưa qua

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
