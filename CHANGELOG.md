# zen

## 26.1.0-alpha.0

### Minor Changes

- Thẻ "Bây giờ" có tranh chuyển động: các vệt màu trôi chậm qua những đường kẻ, đường kẻ trượt nhẹ như gợn sóng. Tạm dừng khi mở menu hoặc tìm kiếm, bắt đầu sau khi màn hình đã yên; tắt hẳn khi bật "Giảm chuyển động"
- Nút trên thẻ "Bây giờ" có kiểu riêng, không còn cùng một màu xám: "Bắt đầu" là nút đặc rõ nét, "Thử 10p" là nút kính mờ lấy màu từ tranh, nút tick cũng đặc. Bỏ lớp làm mờ chồng lên nền sáng gây viền gãy và màu xám. Khi có đủ ba nút, "Để sau" chỉ còn biểu tượng đồng hồ và hai nút kia bỏ biểu tượng, chữ không còn bị cắt ("Bắt đ…")
- Bắt đầu sớm thì việc được xếp vào mốc 5 phút kế tiếp (11:23 thành 11:25), không phải ngay giây này; không bao giờ muộn hơn giờ đã xếp của chính nó
- Thanh tiến độ tròn: phần đã làm luôn là viên thuốc tròn (trước đây khi còn ít là một vạch dẹt), và thanh đầy được hết chiều cao
- Chấm trên lịch tháng là gradient ba màu của tranh từng loại việc (nền, vệt màu, nền cuối), to hơn để thấy được màu chuyển
- Menu "Học" mở lệch hàng với nút chọn: nay căn phải đúng mép nút
- Đổi tab Ngày, Tuần, Tháng, Nhịp không còn trượt cả phần đầu trang sang trái hoặc phải; đổi tại chỗ, nội dung hiện dần. Vuốt bằng ngón tay vẫn trượt như cũ
- Chữ có dấu không còn bị che: tăng giãn dòng cho tiêu đề thẻ "Bây giờ", "Mình đang học bạn", tiêu đề Cài đặt, Học phí, Điểm, màn mở ứng dụng và Atlas
- Nhãn viết hoa dùng chữ thường vừa (Regular) thay cho nét rất mảnh
- Biểu tượng cá koi trên thông báo lớn hơn (chiếm gần hết ô)
- Chỉnh theo bản thiết kế: biểu tượng, độ đậm và viền nhiều chỗ ở Cài đặt, Học phí, Điểm, màn lỗi đồng bộ

## 26.1.0-beta.4

### Minor Changes

- Tranh đường kẻ hiện đúng như bản thiết kế: các vệt màu và đường kẻ mảnh trở lại (trước đây trên máy chỉ còn nền chuyển màu mịn). Bỏ lớp tối phủ lên tranh; chữ trắng giữ độ tương phản nhờ bóng chữ nhẹ như trong bản thiết kế
- Màn hình mở ứng dụng giống màn "Đang tải" của logo: koi cam cả con, xoay chậm, kèm nhãn "Đang mở", tiêu đề và dòng phụ. Bỏ ảnh khởi động tĩnh trước đó (nền khởi động chỉ còn một màu). Màn tải, lỗi dùng chung nhãn trạng thái ("Đang đồng bộ", "Mất kết nối")
- Biểu tượng ứng dụng: koi chiếm khoảng 70% khung, sáng và tối. Ảnh khởi động cũ (hình vuông) đã bỏ
- Chấm trên lịch tháng dùng màu chuyển của tranh từng loại việc; bỏ bảng màu chấm riêng. Màu thông tin là xám dịu, màu cảnh báo là cam koi (không còn chàm và vàng)
- Sửa nút chủ đề trong Cài đặt (biểu tượng nằm trên chữ), nút trên thẻ "Bây giờ" không còn bị cắt thành "Đ…", "B…"; chữ viết tắt môn học bỏ hết dấu ("Ứng dụng đa phương tiện" thành "UDDPT"); "Khác" luôn nằm cuối mọi danh sách loại việc; ô "Thêm từ" vừa khít chữ; dòng trạng thái trong Cân bằng việc xuống dòng gọn trong khung bo tròn
- Nhiều chỗ chỉnh theo bản thiết kế: viền 1,5px, thanh nghe và vòng xoay màu đỏ koi, nhãn mục, màn Học phí và Điểm không còn tranh khi trống, cỡ chữ và độ đậm của tiêu đề, nút tròn và nhãn loại việc nhỏ hơn
- Bộ thống kê (sink): lưu tạm kết quả /stats năm phút và giới hạn kích thước gửi lên theo số byte đọc được

## 26.1.0-beta.3

### Minor Changes

- Giao diện mới, lấy cảm hứng từ bản thiết kế "zen"
    - Biểu tượng ứng dụng và logo mới: nét cọ ensō hình cá koi. Biểu tượng là khung tranh đường kẻ xanh có koi trắng; logo trong ứng dụng màu cam koi. Màn hình tải, trống và lỗi dùng cùng logo
    - Tiêu đề lớn dùng phông Bricolage Grotesque; chữ thường vẫn là Be Vietnam Pro. Chữ nhẹ hơn, chỉ tiêu đề và con số chính mới đậm; nhãn viết hoa dùng nét mảnh
    - Tranh đường kẻ có sáu bảng màu (xanh biển, tím đêm, xanh rêu, cam, hoàng hôn, đất nung), chọn theo loại việc: học, công việc, thể dục, việc nhà, gặp gỡ, bản thân; tiết học, lịch thi và bài tập có màu riêng. Chữ trắng trên tranh có lớp phủ nhẹ và bóng chữ để dễ đọc, nền vẫn tươi
    - Màu trạng thái riêng: xanh lá cho xong và đúng tiến độ, xanh dương cho thông tin, vàng cho cảnh báo, đỏ chỉ cho lỗi và hạn thật. Nút chính vẫn màu đen
    - Thêm biểu tượng bo tròn ở nhãn, hàng, nút và thông báo; hàng trong Cài đặt mỗi mục một biểu tượng riêng (Điểm là biểu đồ, Lịch thi là lịch có dấu tích)
    - Nhãn nhỏ nằm sát tiêu đề của nó (thẻ "Bây giờ", chi tiết việc, hộp thoại, Cài đặt); nút có biểu tượng không còn xuống dòng
- Thông báo trong ứng dụng giống thông báo đẩy: thẻ mờ với biểu tượng koi trên tranh (màu theo việc), dòng "zen", nội dung rồi các nút bấm bằng nhau bên dưới. Thông báo tải bản cập nhật vẫn có vòng tiến độ
- Thẻ "Bây giờ": phần đồng hồ và số liệu nằm trên, hai nút "Để sau" và "Bắt đầu" bằng nhau nằm dưới; nút có biểu tượng lớn hơn, bo tròn
- Chi tiết việc gọn hơn
    - Tiêu đề dài dừng ở ba dòng, chữ có dấu không còn bị cắt (giãn dòng)
    - Giờ làm và môn học sát nhau; "Giờ khác cũng ổn" cùng hàng với các giờ gợi ý
    - Bỏ gạch chân; "Làm thêm", "Xong buổi này", "Bỏ qua phần ôn" và "Hoàn tác" là nút viền rõ; "Vì sao xếp vào giờ này" và ghi chú là thẻ viền mảnh
    - "Làm thêm" và "Xong buổi này" không còn tràn chiều ngang: số buổi một dòng, hai nút bằng nhau dòng dưới
- "Thử 15p": thông báo bắt đầu nói đúng số phút ("Bạn chỉ cần làm 15p đầu thôi"), cùng một con số với nút trên thẻ "Bây giờ"
- Việc ôn thi: tên việc ngắn lại thành "Viết báo cáo KTPM", "Luyện đề GT2" (chữ đầu của môn); tên môn đầy đủ vẫn ở dòng dưới. Sửa lỗi cắt mất chữ đầu của môn như "Kiểm thử phần mềm" (thành "thử phần mềm") hay "Kỹ thuật lập trình"
- Tuần: nút "Giãn lịch tuần này" chỉ hiện khi thật sự có việc để dời
- Điểm: tiêu đề không còn dính mép trên màn hình
- Cài đặt
    - "Cân bằng việc": mỗi mảng là một thẻ viền mảnh; từ khoá là các nhãn bấm được (không còn gõ dấu phẩy), có mức mong muốn và thanh so với tuần này, báo từ khoá trùng với mảng khác; dòng gợi ý có biểu tượng và màu nền theo trạng thái (vượt mức, có việc khớp, chưa khớp). Một mảng hỏng không còn làm mất cả danh sách
    - "Quy tắc của Zen": mỗi quy tắc một thẻ, có lời giải thích và ba nút Tắt, Tự động, Giữ chặt
    - Bỏ nhận giọng riêng của Zen (PhoWhisper) và mục "Giọng nói"; luôn dùng nhận giọng có sẵn trên máy. Gỡ mô hình và thư viện không còn dùng
- Xem trước danh sách nhập: vuốt trái để bỏ một việc, giờ bắt đầu và kết thúc hiện như ở trang chủ, bước đánh số có cột số riêng
- Phút viết gọn thành "p" ("Thêm 15p", "{n}p đầu"); câu chữ tự nhiên hơn ở rất nhiều chỗ (thông báo tải bản mới, nút, lời nhắc, toast, Cài đặt) và chữ thường không còn in đậm ("Mình hiểu: tối nay, 19:00")

## 26.1.0-beta.2

### Minor Changes

- Đọc thông báo, kế hoạch dạng PDF hoặc ảnh: thông báo có một khung thời gian dưới mục đánh số ("2. Thời gian điều chỉnh học phần:" rồi "Từ 8h00 … đến 17h00 …") thành một việc có giờ bắt đầu và hạn, không còn mỗi dòng một việc; đường dẫn trong thông báo được giữ lại
- Xem trước danh sách: mỗi việc hiện như ở trang chủ, giờ bắt đầu và kết thúc zen sẽ xếp ở bên phải, dòng dưới là "Sau …", "Hạn …" hoặc "Từ … đến …"; sửa tên, giờ hay độ dài thì lịch xếp lại ngay trong bản xem trước. Vuốt phải để bỏ một việc, "Bỏ" ở đầu nhóm để bỏ cả nhóm. Mốc "sau …" và giờ đã nói trong danh sách được giữ khi thêm
- Sao lưu và khôi phục dữ liệu: ở Cài đặt, mục "Dữ liệu" có "Sao lưu dữ liệu" (lưu việc, lịch sử, những gì zen đã học và cài đặt thành một tệp .json, cất vào Tệp hoặc iCloud Drive qua bảng chia sẻ) và "Khôi phục từ tệp" (thay dữ liệu trên máy bằng tệp đó). Mật khẩu trường không nằm trong tệp
- "Xoá dữ liệu" xoá việc, lịch sử và cài đặt trên máy sau khi hỏi lại, có thêm nút "Sao lưu trước". Tài khoản trường vẫn giữ
- Hộp cập nhật trên iPhone: "Cài qua AltStore" thành nút viền riêng, không còn giống dòng "Để sau"
- Nhịp thành ba tab: "Bạn dặn", "Đã học" và "Biểu đồ" (ngày và kiểu việc theo buổi), cùng kiểu với Ngày, Tuần, Tháng. Tiêu đề rút gọn thành "Zen đã học" nên không còn đẩy nút sang phải
    - Đầu trang thêm "Điều mình nhận ra": tối đa năm điều Zen thấy từ việc bạn thật sự làm xong hay dời, mỗi điều một câu, chỉ hiện khi đủ chắc
    - Ở "Biểu đồ", chọn một ô rồi bấm "Tránh xếp buổi này" để dặn Zen tránh buổi đó
- Dời việc không còn bị học nhầm: dời dưới 30 phút hoặc trong cùng một buổi (20h sang 21h) chỉ là chỉnh giờ, không hiện "ít xếp buổi tối" và không dạy gì. Dời sang buổi khác có nút "Chỉ lần này": giữ giờ mới nhưng không học
- Câu lệnh nhận ra nhiều việc ("xoá gym" với hai việc cùng tên) hiện thành một thẻ trong danh sách thay vì các nút nổi
- Thẻ "Bây giờ"
    - "Tiếp theo" không còn tràn màn hình: "Để sau", "Bắt đầu" (nút trắng đặc), dấu tích chỉ hiện khi đang làm; thẻ cao hơn một chút
    - Chạm nhãn loại việc (Học, Công việc…) ở góc thẻ để sửa loại
    - Hết giờ có thẻ riêng: "Thêm 15 phút" hoặc "Chuyển việc", thay cho thông báo "Xong chưa?"
    - "Thử 10p" (trước là 15p); hết giờ chọn "Làm tiếp cho xong" hoặc "Đủ đà rồi · nghỉ"
- Sửa nhanh ngay trong việc: nói hoặc gõ "mai 3h chiều 90 phút", "hạn thứ 6", "mỗi T3 T5", "chia 3 buổi", "bỏ lặp"
- Việc chia buổi
    - Một buổi có thể đổi tên riêng ("Viết báo cáo: mở bài"); việc lặp lại vẫn đổi tên tất cả
    - Nhiều buổi gập thành một dòng "{xong}/{tổng} buổi · còn {n}" với "Làm thêm" và "Đủ rồi"; các buổi từ ngày mai gập vào một dòng
    - Việc ôn thi mang tên môn ("Ôn Giải tích 2: luyện đề") và có nút "Không cần ôn", Zen không tạo lại
- Chọn giờ: thêm "+15p", "+30p", "Tối nay", "Mai sáng"; mặt đồng hồ mượt hơn
- Cài đặt: "Mảng việc cân bằng" (đặt tên mảng, từ khoá, thêm mảng riêng) và "Quy tắc của Zen" (Nghỉ cuối tuần, Xong sớm trước hạn, Không làm khuya, Cân bằng mảng việc; mỗi quy tắc Tắt, Tự động hoặc Giữ chặt). Ở "Tự động", Zen chỉ áp dụng khi lịch sử của bạn cho thấy phá quy tắc làm bạn xong ít hơn
- Lịch
    - Lịch ổn định hơn: hôm nay và việc sắp bắt đầu trong 12 giờ không bị xếp lại; việc quá hạn rồi chỉ nhường chỗ dần, không đẩy cả ngày
    - Giờ bạn tự đặt được giữ đến hết ngày và nhường chỗ khi bạn đặt việc khác đè lên
    - Xếp theo ngày tải thật: tiết học tính nửa giờ, việc đang trễ hạn đi trước, việc giải trí nhường việc sắp trễ
    - Zen thích nghi nhanh hơn: trí nhớ giờ giấc nửa đời 14 ngày, cần 3 ngày để mở rộng giờ thức, tuần làm khuya cũ phai dần
    - Việc lỡ lúc 21:30 được tính là lỡ để Zen đổi giờ sau 3 lần
- Lý do xếp giờ: mỗi việc trả lời tối đa ba câu (vì sao ngày này, vì sao buổi này, vì sao dài thế), nêu tên tiết học và việc trước đó
- Sửa độ dài một việc đã có giờ ("90 phút") kéo dài khối của nó từ giờ bắt đầu, không còn để khối cũ chồng lên việc kế tiếp
- Thông báo: nút "Để sau" trên thông báo giống nút trong ứng dụng; thông báo 21:30 có "Xem ngày mai" (mở ngày mai) và "Xếp nhẹ lại"; việc đã đặt giờ không còn nhắc hai lần; từ chối quyền thông báo thì không xếp nhắc
- Giọng nói: PhoWhisper chốt đoạn ghi âm khi bạn thả tay (câu ngắn trước đây có thể ra trống) và thanh âm lượng chạy trở lại; khi mô hình trên máy lỗi, Zen ghi lại nguyên nhân rồi mới chuyển sang nhận giọng của máy
- Giao diện khớp bản thiết kế hơn: nút, chiều cao, cỡ chữ và khoảng cách ở thẻ, toast, hộp cập nhật, ô chọn giờ, chi tiết việc và cài đặt; chữ "Nghe ngay trên máy" dùng đúng phông; sửa nhiều chỗ chữ dài đẩy nút ra ngoài (học phí, điểm, toast, tab, thẻ nghỉ)
- Câu chữ tự nhiên hơn ở nhiều chỗ ("Mình sẽ bớt xếp việc buổi tối", "Online từ chối mật khẩu", "Chỉ cần làm 2 phút đầu"…)

## 26.1.0-beta.1

### Minor Changes

- Lịch ít xê dịch hơn: việc đã xếp thì đứng yên
    - Thêm việc, xóa việc hoặc đánh dấu xong sớm chỉ lấp chỗ trống; việc đang có không bị dời, và khoảng trống không còn kéo việc kế tiếp lên sớm
    - Zen chỉ xếp trong 7 ngày tới; việc xa hơn chờ với dòng "Xếp trước 7 ngày tới". Ôn thi và việc từ trường vẫn xếp theo ngày thi, ngày bạn tự chọn thì giữ nguyên
    - Việc quá hạn không còn đẩy lịch hôm nay mỗi lần zen xếp lại; lập kế hoạch nhanh hơn khi có nhiều việc ở xa
- Đề xuất xếp lại: khi tuần quá tải, zen hiện "Có thể xếp thoáng hơn N việc · Xem" với giờ cũ, giờ mới và lý do từng việc. Chỉ đổi khi bạn bấm "Áp dụng"; "Để nguyên" thì không hỏi lại cho đến khi lịch đổi. Cũng có "Sắp lại tuần cho thoáng" ở màn Tuần. Hiện chỉ đề xuất dời việc không có hạn
- Bớt áp lực
    - Việc zen tự xếp mà trôi qua giờ không còn hiện đỏ; màu đỏ chỉ dành cho hạn thật, buổi học và kỳ thi
    - 21:30 việc chưa làm được chuyển sang sau lặng lẽ, không thông báo
    - Việc đã dời từ 5 lần được hỏi một lần: "Bỏ", "Chia nhỏ" hoặc "Giữ", rồi không hỏi lại
    - Khi đủ việc cho cả ngày, thẻ "Đủ rồi" thay cho thẻ bây giờ và phần còn lại gom vào "Để tuần sau"
- Ít thông báo hơn: việc linh hoạt chỉ nhắc khi bạn tự đặt giờ hoặc hạn gần; thêm một thông báo lúc 21:30 "Mai: N việc, 2h30"
- Thẻ "Bây giờ": nút "Thử 15p" cho việc từ 45 phút (hoặc việc bạn từng để sau); hết 15 phút chọn "Tiếp" hoặc "Nghỉ" (15 phút được ghi lại, việc vẫn mở). Thẻ luôn là việc kế tiếp trong danh sách hôm nay
- Chọn giờ bằng mặt đồng hồ tròn: chọn giờ (vòng ngoài 1 đến 12, vòng trong 13 đến 23 và 00), thả tay thì chuyển sang phút, mỗi 5 phút
- Lệnh "xoá gym" khi có hai việc cùng tên có thêm "Xoá cả hai"; các lựa chọn gọn một dòng, tên dài cắt bớt
- Nhịp gọn hơn
    - Bỏ tab "Đi cùng nhau" và các dòng bối cảnh ("ngày có lớp", "ngay sau lớp", "gần hạn") ở "Trong ngày"
    - Bỏ dòng "Dựa trên khoảng N lần"; "Chưa đủ dữ liệu" thành "Zen còn đang học"; câu về việc sau một khối trong lịch nói rõ zen làm gì
    - Điều zen nhận ra cần ít nhất 10 lần quan sát và mỗi tuần chỉ hiện thêm một điều; thẻ Chủ nhật cũng vậy
- Sửa lỗi học nhầm: việc xếp xa chưa tới giờ không còn bị tính là "bạn giữ nguyên"; chỉ tính khi bạn thật sự làm xong đúng chỗ đã xếp mà chưa kéo hay để sau

## 26.1.0-beta.0

### Minor Changes

- Nhịp biết cho bạn xem điều đã diễn ra, không chỉ điều zen đoán
    - "Lá số": bảng của bạn theo buổi và loại việc, vẽ từ đúng những gì bạn đã làm. Ô đậm là hay xong, ô viền đứt là chưa đủ dữ liệu; chạm một ô để xem con số đằng sau
    - "Trong ngày": kéo qua từng giờ để xem loại việc nào hay xong, loại nào hay bỏ dở ở giờ đó, kèm vài bối cảnh thường đi cùng (ngày có lớp, ngay sau lớp, gần hạn)
    - "Đi cùng nhau": các hoàn cảnh hay xuất hiện cùng lúc trong lịch của bạn, theo từng buổi. Chỉ cho biết điều hay đi cùng nhau, không phải điều giúp bạn xong việc
- Giải thích lịch bằng câu đo được, không đoán lý do: mỗi câu nói đúng một so sánh (ví dụ "Học buổi chiều xong nhiều hơn buổi tối"). Chỉ hiện khi số liệu đủ rõ; không có thì không nói gì
- Bỏ các câu lý do chung chung theo giờ, loại việc và năng lượng; không còn dấu "·" trong câu lý do và câu dời việc
- Xếp lại theo đúng lúc: zen chỉ đổi lịch khi bạn thêm, sửa hạn, sửa giờ, xóa, đánh dấu xong sớm, hoặc khi việc trùng nhau; đồng hồ và việc chờ không còn tự dời việc đang có
- Kéo việc nhỏ (vài phút) không còn bị coi là quy tắc; kéo lớn mới để lại dấu, và một lần kéo không tạo quy tắc cứng
- Đồng bộ thời khóa biểu và LMS đã sửa: thay đổi từ trường chỉ đổi đúng buổi đó, không ghi đè việc bạn vừa chỉnh
- Nói giờ viết liền cũng hiểu: "lúc 0800", "1430 chiều", "0800 đến 0930" thành 08:00, 14:30, 08:00 đến 09:30. Cần "lúc", "từ", "đến" hoặc sáng/chiều/tối đi kèm; số bắt đầu bằng 0 thì không cần. Số điện thoại và mã phòng giữ nguyên
- Nói hoặc gõ lệnh cho việc đã có, không cần mở từng việc
    - "Xoá việc giặt đồ", "dời họp sang 3h", "đổi tên A thành B", "xong bài tập toán", "mở lại", "hoàn tác": mỗi lệnh chỉ chạy khi động từ đứng đầu và tìm đúng một việc; câu nào không phải lệnh vẫn là việc mới
    - Nói nhiều việc trong một câu (lệnh lẫn việc mới) được làm cùng lúc, kèm một thông báo tóm tắt và một nút hoàn tác; "xoá gym, à thôi" thì bỏ qua, không đổi gì
    - Hiểu viết tắt, sai chính tả và tiếng lóng ("k cần", "ko cần"); tên việc viết tắt như "csdl" cũng tìm ra "Cơ sở dữ liệu"
    - "Thêm buổi" cho một chuỗi, đổi ngày của cả chuỗi ("Toán giờ là T3, T5")
- Tìm kiếm hiểu khoảng thời gian: "từ 9h đến 11h", "sau 5h", "từ T4 trở đi", "3 ngày tới", "tháng này", "tuần sau trừ T6"; số chỉ khớp đúng số ("bài 1" không ra "Bài 12"), gõ sai hai chữ vẫn tìm ra tên dài
- Neo việc vào việc khác: "ôn trước kỳ thi CSDL", "sau buổi Toán thứ 3", "sau khi xong báo cáo" tự xếp theo kỳ thi, buổi học hay việc đó
- Dán một danh sách hay đề cương (markdown, Google Docs, tin nhắn, ảnh chụp đề cương, hoặc đường dẫn) thì zen đọc thành nhóm và việc, có bản xem trước để bỏ chọn, sửa rồi mới thêm; thời lượng và hạn đọc từ chính dòng đó
- Thấy bạn làm cùng một việc vào cùng một thứ ba tuần liền, zen hỏi có lặp lại hằng tuần không ("Mình để ý thấy"); chọn Không thì không hỏi lại
- Thẻ "Bây giờ": nút thứ hai là "Để sau", ghi lại và hiện việc kế tiếp; chọn việc theo nhịp của bạn
- Nhận dạng giọng nói chạy ngay trên máy (Cài đặt > Nhận dạng giọng nói): "Của máy", "Nhẹ" hoặc "Chính xác"; tải khi chọn, hiện phần trăm và tạm dừng được. Máy yếu hoặc thiếu chỗ trống thì cảnh báo trước; lỗi thì tự về nhận giọng của máy. Giọng nói không gửi đi đâu
- Xem nhanh "Xem nhịp của bạn" từ câu "Vì sao lúc này" của một việc

## 26.0.13

### Patch Changes

- Zen tự xếp lại theo thời gian, bạn không phải sửa tay
    - Việc quá giờ không còn tự bị dời: thông báo hỏi "Xong chưa?" với hai nút Xong và Để sau (Android: hiện thêm một thông báo nhỏ khi mở ứng dụng). Đến giờ bắt đầu cũng có thông báo: Bắt đầu hoặc Để sau
    - Kéo một việc chỉ là gợi ý, không còn ghim vĩnh viễn; chỉ "Đừng dời" mới ghim
    - Dời việc sang ngày khác giữ nguyên buổi, zen chọn giờ; ngày quá tải biết nhường chỗ
    - Dời trên thẻ "Bây giờ" chỉ một chạm, zen tự chọn ngày và giờ hợp
- Học nhanh từ vài lần kéo: kéo một lần zen đoán ("Hiểu rồi: việc học để chiều") với "Luôn vậy" hoặc "Chỉ lần này"; kéo lần hai cùng hướng thì thành quy tắc. Học theo buổi trước, rồi mới đến từng giờ
- Nhịp làm lại: thẻ cả tuần (thứ × buổi), "Bạn dặn" (lời bạn nói, kèm ngày giờ) rồi "Mình đang theo" (zen học được), mỗi dòng một biểu tượng và thanh độ chắc (nét đứt khi còn đoán); vuốt để quên. Mỗi buổi trong ngày một dòng, không còn dòng lặp; chưa có gì vẫn có thẻ tuần mờ. Nút giữ nói là "Giữ để dặn"
- Chỉnh giờ ngay trong màn việc, không cần bảng: chọn ngày, giờ bắt đầu và kết thúc (gợi ý bằng giờ, không phải độ dài); bảng giờ quay vòng (55 sang 00, 23 sang 00), nút không còn sát đáy; không xếp lại khi đang kéo hay gõ, chỉ khi thả hoặc bấm Xong
- Các buổi: mỗi buổi là ngày, bắt đầu - kết thúc như màn việc; bỏ "Buổi 1/3", dấu chấm và ô độ dài; một buổi thì không hiện danh sách. Thêm buổi trải đều theo hạn, không có hạn thì trong 30 ngày
- Màn việc gọn hơn, vùng chạm lớn hơn (ít nhất 44), chữ to hơn, lịch vừa màn hình nhỏ; gõ tên việc, nơi chốn mượt hơn
- Một giọng nói thống nhất cho mọi thông báo: mỗi dòng một ý, nói theo buổi và ngày thay vì giờ chính xác; lý do xếp không còn nhắc con số cũ khi việc được dời
- Tìm kiếm mở và đóng mượt hơn, hiện khung chờ ngay khi mở
- Cập nhật iPhone cài được qua SideStore hoặc AltStore
- Bỏ giọng nói Moonshine tải thêm: dùng giọng nói của hệ thống
- Sửa lỗi xóa lặp, kéo việc và đồng bộ
    - "Xóa tất cả" một việc lặp xóa cả chuỗi, không chỉ một ngày; nói cùng một việc lặp hai lần không còn tạo bản sao
    - Kéo việc sang ngày khác giữ đúng ngày bạn thả, không tự nhảy sang ngày khác; không thả được vào ngày đã qua, và thông báo nói đúng ngày việc thật sự nằm
    - Các buổi của một việc thẳng hàng: ngày, giờ bắt đầu, giờ kết thúc cùng cột
    - Đồng bộ trường không ghi đè việc bạn vừa tick, xóa hay đổi giờ; kết nối lần đầu không còn báo "học bù" cho các tuần của thời khóa biểu; ngắt kết nối không để việc cũ quay lại
    - Buổi học đổi tiết vẫn là buổi cũ, giữ ghi chú của bạn, không báo hủy rồi thêm mới
    - Tick hai lần không ghi hai lần; thẻ "Bây giờ" tự chuyển khi hết giờ; tick việc cuối ngày báo "Xong hết hôm nay"
    - Thông báo nhắc không bị xóa rồi đặt lại mỗi lần đổi; xếp lại gọn hơn, tháng và tuần mượt hơn

## 26.0.12

### Patch Changes

- Nhịp là một lưới cả tuần: thứ × buổi (sáng, trưa, chiều, tối), nói như người ("Sáng ngày thường", "Tối T3, T5"). Chậm kết luận hơn: cần nhiều việc, nhiều ngày mới nói là nhịp của bạn
- "Vì sao lúc này" nói theo buổi và loại ngày ("Hay xong việc sáng ngày thường"), và tự đổi khi bạn dời việc sang buổi hay ngày khác
- Bốn buổi thống nhất: sáng 0-11h, trưa 11-13h, chiều 13-18h, tối 18-24h; giờ quá sớm do thói quen của bạn quyết
- Chỉnh giờ trong danh sách giờ dời cả việc bạn đã đặt giờ đè lên, và báo khi trùng giờ học
- Dời việc sang ngày khác (cùng giờ) không còn báo "Đã dời" hay học là bạn tránh giờ đó; "Chưa có gì để làm" không còn hiện mỗi lần mở lại ứng dụng
- Gõ ghi chú, tên việc, nơi chốn và tìm kiếm mượt hơn
- Nói nhanh hơn (Cài đặt > Giọng nói): tải một lần 32 MB, chữ hiện ngay khi bạn nói, chạy trên máy, không cần mạng; máy yếu hoặc chưa tải thì dùng giọng nói của hệ thống
- Thông báo có âm riêng: nhắc việc dùng âm nhắc, đổi mật khẩu và lịch thi dùng âm khẩn, còn lại âm mặc định (cần bản dựng mới)
- Danh sách tải lại sau khi xếp giờ, và sang ngày mới zen xếp giờ cho việc còn chờ giờ

## 26.0.11

### Patch Changes

- Việc chỉ có một lần cũng thêm được buổi: nhấn giữ việc, chọn "Cần thêm một buổi"
- Zen xếp giờ bắt đầu vào :00 hoặc :30, tránh :15 và :45 (giờ bạn tự nói vẫn giữ nguyên)

## 26.0.10

### Patch Changes

- Zen đọc đúng hơn những gì bạn nói và gõ
    - "ôn thi 4 buổi trước 25/11" xếp đúng 4 buổi, mỗi buổi một lần ngồi; "3 buổi một tuần" và "2 buổi sáng" không bị hiểu là số buổi
    - Việc cần tập trung ngồi 90p một lần (ôn thi, đọc giáo trình, báo cáo, kế hoạch), không còn 60p
    - "Mai" sau giờ hay buổi trong ngày ("3 giờ chiều Mai") là ngày mai, "gặp Mai 3h chiều mai" là tên người
    - Hiểu thêm "năm sau", "tháng 12", "trong tháng 12", "hết tháng tới", "đầu giờ sáng", "đến nửa đêm"; "trước thú 6" gõ lệch dấu vẫn là thứ 6
    - Công văn, thông báo, kế hoạch (PDF, ảnh chụp) được đọc theo cấu trúc: lịch theo ngày, các mục có "Thời gian:", một khoảng "từ … đến …"; phần chỉ dành cho cán bộ không thành việc
    - "họp nhóm 9h mai, nộp báo cáo và gọi mẹ" và "nộp báo cáo, trước thứ 6" tách đúng việc, giờ hạn đi theo việc trước nó
    - Gõ toàn chữ hoa vẫn đúng giờ, ngày; tên việc viết hoa chữ đầu
- Chạm một buổi trong "Các buổi" hay widget mở đúng việc đó

## 26.0.9

### Patch Changes

- Zen hiểu bạn nhanh hơn mà vẫn yên
    - Xong một việc zen chưa xếp giờ (giờ bạn tự đặt, hay làm ngay) cũng dạy zen giờ bạn hay làm
    - Hoàn tác là zen quên luôn điều vừa học
    - Mỗi ngày zen thử giờ mới nhiều nhất một lần
    - Giờ thức và các buổi theo đúng những gì bạn làm: hay làm tới khuya thì tối, đêm rộng ra tới 24:00; không bao giờ hẹp lại
    - Độ dài tự đoán học từ cả những lần bạn làm lâu hơn một chút
    - Dời một việc khỏi giờ nào là zen hiểu ngay: "Đã hiểu · ít xếp 7:30"; Nhịp có mục "Bạn tránh", vuốt để zen quên giờ đó
- Việc lặp hằng ngày, hằng tuần bỏ qua ngày lễ; việc hằng tháng, hằng năm (tiền nhà, sinh nhật) giữ đúng ngày
- "tối nay" nói khi buổi tối đã kín thì xếp đêm nay; bạn hay dời việc khỏi đêm thì xếp tối mai
- Lỡ việc nhẹ nhàng hơn
    - Một lần lỡ chỉ tính một lần, đúng giờ đã lỡ
    - Lỡ 3 lần thì "Lỡ 3 lần, đổi giờ"; việc chưa có hạn và tự đoán độ dài thì ngắn bớt nửa giờ (không dưới 15p), độ dài bạn nói thì giữ nguyên
- Việc có hạn chừa chút thời gian trước hạn, không còn xếp kết thúc đúng giờ hạn
- Ngày nhẹ hơn khi cần
    - Ngày Tết, ngày lễ xếp nửa việc thường ngày: "Để nhẹ ngày Tết"
    - Hôm trước thi bớt việc khác, buổi ôn cho bài thi đó giữ nguyên: "Để nhẹ hôm trước thi"
- Sau giờ học, giờ thi chừa thời gian nghỉ theo nhịp của bạn (mặc định 15p, tối đa 1h)
- Việc vặt và trả tiền cùng ngày xếp liền nhau, đi một lần là xong: "Gộp với **Đi chợ**"
- Nhắc việc đúng lúc hơn
    - Vừa mở app thì không nhắc lại việc sắp tới
    - Việc zen xếp nhắc trước bao lâu theo thói quen mở app của bạn (5 tới 30p)
    - Tiết học, giờ thi, việc ghim và giờ bạn tự đặt vẫn luôn nhắc trước 10p
- Thẻ Chủ nhật ghi tuần này bạn giữ bao nhiêu giờ zen xếp so với tuần trước: "Giữ 86% giờ Zen xếp, +9%"
- Thẻ trên cùng gọn và đúng hơn
    - Việc đang làm ghi "Đang làm"; việc tiếp theo hôm nay ghi "Tiếp theo", có nút "Làm luôn" để dời đúng buổi đó về bây giờ
    - Thẻ "30p trống, hợp làm **Giặt đồ**" chỉ hiện khi hôm nay hết việc của bạn và bạn chưa làm đủ: gợi ý một việc ngày khác vừa chỗ trống trước tiết học kế tiếp hoặc 22:00, việc gần hạn trước; chạm vòng tròn để làm ngay, vuốt đi thì hôm nay không gợi ý nữa
    - Làm đủ rồi thì thẻ ghi "Đủ cho hôm nay · Phần còn lại của ngày là của bạn." và không gợi ý gì thêm
        - Tính việc bạn đã xong từ giờ bắt đầu tới lúc chạm xong, cộng nửa thời gian tiết học và thi; một ngày học đủ 7h10 tính là 3h35
        - Mặc định 6h; sau 5 ngày có làm việc thì theo nhịp của chính bạn (3h tới 10h)
        - Vuốt thẻ nghỉ đi là mình hiểu ngay: "Đã hiểu · nghỉ sau 6h30p", có Hoàn tác
    - Bỏ thẻ lớn "Sáng nay"; việc bị dời chỉ hiện ở một dòng nhỏ dưới thanh chọn, giống nhau ở ngày, tuần và tháng
- Dòng "Xếp lại 2 việc" có hai hàng: số việc, rồi việc dời nhiều nhất ("**Gym** sang T4 7:00") ở hàng dưới
- Tên việc in đậm khi nằm giữa câu: "**Đọc sách** chưa có giờ trống", "Đã dời **Gym** sang 15:00"...
- "Các buổi": thêm hay bỏ một buổi là chia lại các buổi còn lại cho đều; bỏ đúng buổi bạn chạm
- Độ dài tự đoán: việc nhỏ 15p, còn lại tròn nửa giờ hay một giờ, kể cả khi co cho vừa chỗ trống; không còn 45p, 1h15p, 1h45p
- Buổi ôn thi đã có được chia lại theo cách mới ngay lần đầu mở app sau khi cập nhật; buổi đã xong, đang làm hay bạn tự đặt giờ thì giữ nguyên
- "và" tách việc: "học toán và đọc sách trong tháng này" là 2 việc, cùng hạn 30/11
    - Mỗi bên có động từ riêng mới tách; "gặp Lan và Minh", "mua sữa và trứng" vẫn là một việc
    - Ngày, buổi nói ở đầu hay cuối câu dùng chung cho mọi việc; nói riêng cho việc nào thì giữ cho việc đó
    - Tên không còn mất chữ: "Gặp Lan và Minh" giữ "Minh", "rửa xe chiều nay" giữ "xe"
- Chia buổi hợp lý hơn
    - Báo cáo, thuyết trình, kế hoạch, nội dung, thiết kế, nghiên cứu tự chia khoảng 3 buổi, không còn 1-2 buổi
    - Hiểu thêm: ứng tuyển, viết CV, chuyển nhà, lên kế hoạch du lịch, tổ chức sinh nhật, đám cưới, dọn tủ, tìm hiểu đầu tư, hồ sơ vay, bảo hiểm
    - Ôn thi theo loại bài thi: kiểm tra 2 buổi, giữa kỳ 6 buổi, cuối kỳ 10 buổi; thêm theo số tín chỉ, thi lại dài hơn
    - Ôn thi học theo nhịp của bạn: làm lâu hơn dự tính thì lần sau dài hơn
    - Mỗi ngày một buổi; ngày kín lịch học thì không xếp, tuần dày lịch thì ít buổi mà dài hơn (tới 2h) vào ngày rảnh
    - Buổi ôn cuối xong trước 22h hôm trước, không còn xếp vào sáng ngày thi
- Lịch bớt xáo trộn
    - Việc trong 24 giờ tới đứng yên, trừ khi giờ đó không còn dùng được; xong sớm không kéo việc ngày mai sang hôm nay
    - Mỗi lần xếp lại dời tối đa 5 việc không có lý do
    - Việc không có hạn được xếp trong cả tuần, không còn dồn vào 2 ngày tới
- Việc chưa có giờ tự vào chỗ trống ngay khi có, kể cả khi xoá một việc đã qua hay mở lại app
- Thấy được zen đã dời gì
    - "Xếp lại 3 việc · Xem" hiện ở cả ngày và tuần, còn đó tới khi bạn mở hay vuốt ẩn, không mất khi chuyển màn hình
    - Việc bị dời có chấm đỏ trong tuần
- Hết việc trong ngày không còn giục làm tiếp
    - "Ngày mai" và "Mai 8:00, ..." chỉ hiện sau 20h và khi đã hết việc trong ngày
    - Ngày đã qua hiện "Xong hết rồi", không còn "Hôm nay xong rồi"
    - "...p trống, hợp làm ..." chỉ gợi ý việc của hôm nay
- "Các buổi": thêm buổi bằng nút "Thêm buổi" lớn, bỏ một buổi bằng dấu x bên cạnh; cột ngày hẹp lại cho tên dài hơn
- Nút, ô chọn dễ chạm hơn: mọi nút nhỏ đều nhận chạm trong vùng 48pt; nút, viên chọn, mũi tên lịch và ô ngày to hơn

## 26.0.8

### Patch Changes

- Kéo giờ bắt đầu về quá khứ khi việc vẫn chưa kết thúc: các việc linh hoạt bị đè, kể cả việc đang làm, được xếp lại
- Nhịp: phản ứng nhanh hơn, bớt cứng nhắc
    - Việc bạn kéo hay tự đặt giờ giờ cũng được học, không còn bị bỏ qua
    - Hai việc là đã đoán được khung giờ, ba việc là thành giờ vàng
    - Việc mới làm hôm nay nặng hơn việc cũ vài hôm
    - Cột giờ, con số và thanh đo có chuyển động mượt
- Lý do xếp giờ luôn đúng sự thật: "trong hôm nay" không còn bị ghi là "đúng buổi bạn nói"; không còn nhắc lời dặn đã xoá hay việc đã bỏ ghim
- Lý do và các dòng trong tab Nhịp ngắn gọn hơn
- Danh sách không còn dòng lý do dưới tên việc; chỉ hiện phòng, môn, hạn hoặc để trống

## 26.0.7

### Patch Changes

- Widget không còn hiện khung xám sau khi thêm hay dời nhiều việc; vẫn giữ ảnh nền như cũ
- Thêm, sửa, dời việc không còn bị khựng khi có nhiều việc lặp
- Gõ tên, ghi chú, địa điểm trong chi tiết việc không còn bị khựng
- Tuần và tháng: kéo việc sang tuần, tháng khác nhanh và dễ hơn
    - Chỉ cần kéo ra lề trái, phải là sang trang; kéo qua T2, CN không còn bị lật trang
    - Về được cả tuần, tháng đã qua
    - Thẻ việc đang kéo nằm giữa, ngay trên ngón tay
    - Ô T2, CN không còn bị cắt khi kéo qua
- Hiểu nhiều loại việc hơn, không còn dồn vào "Việc khác"
    - Thêm loại: công việc, việc vặt, tài chính, bản thân
    - Nhận ra marketing, đăng reel, thiết kế, deploy, phỏng vấn, báo cáo tuần, OKR, cho gà ăn, tưới cây, đổ rác, uống thuốc...
    - Gõ sai, không dấu, nói ngược thứ tự vẫn hiểu
- Ít phải nói làm bao lâu
    - Việc nhỏ như cho gà ăn, đổ rác, tưới cây, uống thuốc tự lấy 15p
    - Việc giống việc bạn từng làm thì lấy đúng thời gian bạn đã làm, theo nghĩa chứ không chỉ theo chữ
- Tên việc gọn hơn: bỏ "tí nữa", "lát về", "giúp mình", "nhé"...; "tí nữa" hiểu là trong hôm nay
- Từ tiếng Anh viết đúng
    - OKR, PR, GTM, KPI, CPU, RAM, GPU, Wi-Fi, iPhone, TikTok, Figma, CI/CD, check-in...
    - Gõ sai vẫn sửa ("markting" → marketing); nói kiểu Việt cũng hiểu: ma két tinh, rì viu, đì dai, pốt, hát tác, sờ pờ rin, át min...
- Đọc đúng hơn
    - "lên TV2", "xuống B1": lấy được phòng; tin nhắn kiểu "@All chiều mai 16:00 (17/11) các nhóm lên TV2..." thành đúng một việc
    - "họp nhóm tuần sau lúc 9h" vào T2 tuần sau; "22h đến 1h sáng" qua nửa đêm
    - Ngày âm lịch: "15 âm", "mùng 1 âm", "rằm tháng giêng"; khoảng "quý này", "học kỳ này", "năm nay"
    - Không nói giờ thì không tự đặt giờ cố định, kể cả họp có khoảng ("họp nhóm tuần sau") và việc lặp mỗi ngày
- Xếp lịch thông minh hơn
    - Xong sớm hay xoá một việc: việc sau được kéo lên chỗ trống, việc gấp chưa có giờ được ưu tiên trước
    - Buổi đã kín mà thêm việc gấp: việc hạn xa nhường chỗ, việc bạn tự đặt giờ thì giữ nguyên
    - Việc có hạn được xếp xong sớm, khoảng 3/4 quãng tới hạn
    - Không có gì mới thì không xáo trộn lịch
- Danh sách: giờ kết thúc nằm dưới giờ bắt đầu, cùng cỡ chữ, chạm từng giờ để sửa; qua nửa đêm hiện +1, hôm sau hiện -1
- Chi tiết việc
    - Giờ bắt đầu - kết thúc trên một dòng; chỉnh giờ kết thúc trước giờ bắt đầu là sang hôm sau
    - Tự sửa được cả giờ đã qua; zen thì không bao giờ xếp vào quá khứ
    - "Còn nữa" ở buổi cuối: chưa xong thì thêm một buổi, lần sau đoán dài hơn
- Việc lặp mỗi ngày: hiện 14 ngày tới, còn lại gộp thành "+16 buổi · đến 16/12"
- Chia sẻ chữ, link, ảnh, PDF từ app khác vào zen
- Thông báo mới: Online/LMS không nhận mật khẩu (nếu bạn không đổi thì nên kiểm tra); lịch thi đổi giờ; hạn nộp đổi; lớp bù; lớp, lịch thi bị huỷ
- Học phí, điểm: "HK1" thay vì "HKHK01"; ngày đã đóng hiện đúng; "kỳ sau xem lại" đúng tháng
- Nhỏ khác: xong hết việc buổi tối hiện "Hôm nay xong rồi · Mai 8:00, ..."; thông báo xếp xong đếm theo việc ("Xếp xong 11 việc · Bài luận chia 3 buổi"); thời khoá biểu ghi rõ học kỳ; gợi ý thói quen "Tập thể dục xong thì đọc sách nhé"

## 26.0.6

### Patch Changes

- Việc nào cũng có giờ, và nói rõ vì sao
    - "Đọc code trong sáng mai" mà sáng kín lịch: làm vừa khoảng trống còn lại, hoặc dời sang chiều, sang ngày khác, không còn biến mất
    - Bạn không nói làm bao lâu thì mình co lại cho vừa chỗ trống, nhưng không vô lý: việc vặt tối thiểu 15p, tập 30p, học sâu 1h30p; độ dài bạn nói thì giữ nguyên
    - Lý do theo đúng kết quả: "Sáng mai kín, dời sang chiều mai", "Sáng mai trống 2 tiếng", "Hôm nay dồn, làm muộn chút"; hiện ngay trong thông báo khi thêm việc
    - Thật sự không còn giờ trống: báo "Chưa có giờ trống" kèm nút "Chọn giờ", không còn báo đã xếp; việc vẫn hiện trong danh sách
    - "Trong hôm nay 3 tiếng" lúc 19h45 xếp liền một buổi, không còn báo không đủ giờ
    - Nhiều việc tối nay cùng lúc vẫn đủ chỗ: "tối nay" bắt đầu từ 18h
- Lý do luôn theo giờ hiện tại
    - Tự dời một việc thì lý do đổi thành "Bạn chọn giờ này, mình giữ nguyên", không còn nói về giờ cũ
    - Lý do cụ thể hơn, không còn câu chung chung: "Còn 3 ngày tới hạn, làm dần", "Rảnh sau Giải tích 2", "Mấy lần gần đây bạn xong việc quanh 20h"
    - Lời lẽ tự nhiên: "Làm hôm nay 20:00", "Hợp việc nhà", "Việc của bạn · Khác"
- Bảng tin trên trang chủ gọn và đúng hơn
    - Sau khi bạn đổi gì đó làm dời việc khác, bảng tin hiện thay đổi mới nhất, không chỉ thoáng qua trong thông báo
    - Đã xem rồi chuyển sang tuần, tháng hay ngày khác thì tự ẩn
    - Việc đã bị dời thêm lần nữa thì tin cũ tự mất, chỉ còn tin mới
- Sửa tên, địa điểm, ghi chú một việc lặp thì sửa luôn cả chuỗi, nếu trước đó các buổi giống nhau
- Chi tiết việc hiện giờ kết thúc ở dòng riêng dưới giờ bắt đầu ("đến ..."), sửa được
- Tuần và tháng: giữ một việc rồi kéo sang ngày khác; kéo sát mép trái, phải để sang tuần, tháng trước, sau

## 26.0.5

### Patch Changes

- Nhịp hiểu bạn nhanh hơn nhiều
    - Xong 5 việc trong cùng một khoảng giờ là có "Giờ vàng 20h-22h", không còn phải đợi hàng chục lần
    - Số lần không còn bị thổi lên hàng trăm: chỉ đếm việc bạn xong hay tự dời, không đếm khối mình tự xếp lại
    - Lời nhắn rõ hơn: "Mấy hôm nay bạn hay xong việc giờ này. Xong thêm 2 việc giờ này nữa là mình chắc."
- Tuần chỉ có lời dặn như "Tối thứ sáu để trống" vẫn hiện khối gạch chéo, không còn trống trơn
- Widget không còn hiện khung xám khi có nhiều việc lặp mỗi ngày: chỉ gửi việc hôm nay và tối đa 3 việc sắp tới
- Chỉ cần kể việc, mình tự đoán phần còn lại
    - Mỗi loại việc có độ dài, số buổi và hạn riêng: "code b-tree và lsm" là 2 việc, mỗi việc 2 buổi 1h30p, hạn trong 1 tuần
    - Học, làm, nhà cửa, tiền bạc, sức khỏe đều hiểu: "đóng tiền điện" 30p hạn cuối tháng, "dọn phòng" 1h hạn 3 ngày, "làm đồ án" nhiều buổi 2h
    - Việc tập đều tự lặp lại: "tập gym" 3 buổi/tuần, "học tiếng anh" 5 buổi/tuần, "đọc sách" mỗi ngày
    - "Ôn giải tích" có hạn trước buổi thi trên Online
    - Độ dài đoán luôn tròn nửa giờ hay một giờ; độ dài bạn nói được giữ nguyên
    - Hạn tự đoán không quá 2 tuần, cho khỏi dồn tới phút chót
- Một câu nói nhiều việc thì mọi việc cùng nhận ngày, buổi
    - "Tuần sau học toán, viết báo cáo, đi khám": cả 3 việc nằm trong 23 - 29/11, không còn dồn vào chủ nhật
    - Hiểu thêm "trong năm nay", "quý này", "học kỳ này", "sáng mai A, B", và cả khi nói ngày ở cuối câu
    - Việc tự nói ngày, buổi riêng vẫn giữ ngày, buổi đó
- Không còn mất việc
    - "b-tree code, lsm code sau, à không mai" giữ cả 2 việc
    - "từ mai đi khám, dọn phòng" là 2 việc, không còn gộp làm một
    - "học toán, sáng mai dọn phòng, gọi mẹ" giữ đủ 3 việc; chỉ "dọn phòng" là sáng mai
    - Mỗi dòng một việc có ngày riêng ("mai học toán", xuống dòng, "thứ 6 đi khám") là 2 việc, đúng tên, đúng ngày
- Gõ tiếng Anh, viết tắt không còn bị sửa nhầm: "b-tree", "os", "lsm", "api" giữ nguyên
- Hiểu cả những việc lạ như "deploy kubernetes", "nộp thuế TNCN", kể cả khi gõ sai hay không dấu
- Độ dài đoán ngày càng sát với bạn: làm xong vài việc giống nhau, lần sau mình đoán theo thời gian thật của bạn
- Mỗi việc ghi rõ hơn: "Buổi 1/2 · Hạn T2 23/11", "5 buổi/tuần · đến 31/12"; hạn cuối ngày không còn kèm giờ ("Hạn hôm nay")
- Nhấn giữ một buổi: "Cần thêm một buổi", "Bớt một buổi"
- Xếp giờ trong 30 ngày tới; việc lặp vẫn hiện mọi ngày, ngày xa hơn ghi "Chưa xếp giờ"
- Việc hạn hôm nay mà dài hơn phần còn lại trước 22h (như "đọc code 3 tiếng" lúc 19h) giờ xếp thành một buổi chạy quá 22h, không còn tách đôi hay báo "hơi gấp"
- Mọi menu thả xuống đều dùng menu của zen, kể cả nút xoá trong chi tiết việc (iOS không còn menu hệ thống)

## 26.0.4

### Patch Changes

- Sửa ghi chú trong chi tiết việc rồi đóng bàn phím: nút ba chấm không còn tụt khỏi vòng tròn, loại việc không còn đè lên tên việc
- Việc lặp lại không còn mang hạn cuối ngày
    - "Giải leetcode mỗi tối" không còn ghi "Hạn 0:00, xếp sớm cho khỏi dồn vào phút chót"; việc vẫn nằm trong ngày của nó
    - Hạn bạn nói ("mỗi ngày trước 17h") vẫn giữ; nhắc việc không còn kèm "Hạn 0:00"
- Hiểu lời nói đúng hơn
    - Độ dài bạn nói được giữ theo bước 15 phút: "45p" là 45 phút, không còn thành 1 tiếng; không nói thì vẫn đoán theo 30 phút
    - "7:20 - 9:10" là 7:15 - 9:15, không còn hụt 15 phút cuối
    - "Đọc sách tháng này", "trong tháng này" là làm trước hết tháng, không còn dồn vào ngày cuối tháng
    - Chữ viết tắt như "lsm", "sql" giữ nguyên, không còn bị sửa thành "làm"
- Mở app lần đầu trong ngày không còn nhảy sang một ngày xa (như 15/3); vẫn ở hôm nay
- Widget không còn chỉ hiện khung xám: dữ liệu gửi cho widget nhẹ đi khoảng 4 lần
- Nhịp không còn chỉ nói "Mình còn đang học"
    - Từ lần đầu bạn xong hay dời một việc: "Đã thấy 2 lần", "Thêm 1 lần nữa"
    - Sau 3 lần: "Có vẻ 20h-22h", giờ bạn hay làm xong hay kéo việc tới, ghi "Đang đoán" cho tới khi mình chắc

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
- Mở ứng dụng không còn đơ
    - Chạm Tuần, Tháng là chuyển ngay, không còn tự nhảy qua lại giữa các chế độ xem
    - Vuốt sang tuần khác không còn khựng giữa chừng
    - Widget trên iOS cập nhật nhẹ hơn, không làm chậm ứng dụng
- Đồng bộ thời khoá biểu cả học kỳ nhanh hơn: xếp lịch một lần khi xong, không xếp lại sau từng tuần
- Bản mới được tìm thấy sớm hơn: mỗi lần mở hay quay lại ứng dụng, cách nhau ít nhất 15p thay cho 6 tiếng
- Tải bản mới không được thì thông báo vẫn hiện một lúc: "Không tải được", kèm mở trang tải trong trình duyệt; chạm "Có bản …" để thử lại

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
