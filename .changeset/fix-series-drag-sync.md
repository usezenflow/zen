---
"zen": patch
---

Sửa lỗi xóa lặp, kéo việc và đồng bộ
- "Xóa tất cả" một việc lặp xóa cả chuỗi, không chỉ một ngày; nói cùng một việc lặp hai lần không còn tạo bản sao
- Kéo việc sang ngày khác giữ đúng ngày bạn thả, không tự nhảy sang ngày khác; không thả được vào ngày đã qua, và thông báo nói đúng ngày việc thật sự nằm
- Các buổi của một việc thẳng hàng: ngày, giờ bắt đầu, giờ kết thúc cùng cột
- Đồng bộ trường không ghi đè việc bạn vừa tick, xóa hay đổi giờ; kết nối lần đầu không còn báo "học bù" cho các tuần của thời khóa biểu; ngắt kết nối không để việc cũ quay lại
- Buổi học đổi tiết vẫn là buổi cũ, giữ ghi chú của bạn, không báo hủy rồi thêm mới
- Tick hai lần không ghi hai lần; thẻ "Bây giờ" tự chuyển khi hết giờ; tick việc cuối ngày báo "Xong hết hôm nay"
- Thông báo nhắc không bị xóa rồi đặt lại mỗi lần đổi; xếp lại gọn hơn, tháng và tuần mượt hơn
