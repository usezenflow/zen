// Vietnamese syllables that people write often, with their marks: the OpenSubtitles 2018 Vietnamese word list
// (scripts/embed/build/src/vi_50k.txt, the list build_vocab.py fetches) keeping the one-syllable words seen at least
// 300 times, plus the syllables the repo's own Vietnamese text uses at least twice (golden sets, training set, i18n
// strings: "nộp" is there, rare in subtitles). A Telex or VNI decode is accepted only when its result is in this set, so a rare decode is not a word:
// "tree" stays "tree" (trê is seen 19 times), "os" stays "os" (ó is seen 235 times).
const WORDS = `
a ai am an ang anh at ba ban bang banh bao bay be ben bi bia binh biên biến biết biển biểu biện biệt
bom bong but buôn buông buýt buồm buồn buồng buổi buộc by bye bà bài bàn bàng bào bày bá bác bách
bám bán bánh báo bát báu bây bã bãi bão bè bé béo bê bên bì bình bí bò bó bóc bóng bóp bôi bông bù
bùa bùm bùn bùng búa búp bút băng bơ bơi bơm bưu bước bướm bạc bạch bại bạn bạo bả bản bảng bảnh bảo
bảy bấm bất bấy bầm bầu bầy bẩm bẩn bẫy bậc bận bật bậy bắc bắn bắp bắt bằng bẻ bế bến bếp bề bể bệ
bệnh bỉ bị bịa bịch bịt bọ bọc bọn bỏ bỏng bố bốc bối bốn bồ bồi bồn bổ bổng bỗng bộ bội bột bớt bờ
bởi bụi bụng bức bữa bự bực ca cai cam can canh cao cat cay cha chai chanh che chen chi chia chim
chinh chip chiên chiêu chiếc chiếm chiến chiếu chiều cho choàng choáng chu chua chui chun chung chuy
chuyên chuyến chuyền chuyển chuyện chuông chuẩn chuồn chuồng chuỗi chuộc chuột chà chàng chào chày
chán cháu cháy châm chân châu chèo chém chén chép chì chìa chìm chìu chí chích chín chính chó chóc
chóng chót chôm chôn chùa chú chúa chúc chúng chút chăm chăn chăng chĩa chơi chư chưa chương chước
chạm chạp chạy chả chảy chấm chấn chấp chất chẩn chậm chắc chắn chằm chẳng chặn chặt chế chết chỉ
chỉnh chị chịu chọc chọn chối chốn chống chốt chồn chồng chổ chỗ chớ chớp chờ chở chợ chục chụp chủ
chủng chứ chứa chức chứng chừng chửi chữ chữa cia co coi con cu cua cung cuối cuốn cuồng cuộc cuộn
cà cài càng cá các cách cái cám cán cánh cáo cáp cát cáu câm cân câu cây cãi cò còi còn còng có cóc
cô côi côn công cõi cùng cú cúi cún cúp cút căm căn căng cũ cũng cơ cơm cơn cư cưa cưng cương cước
cưới cướp cười cường cưỡi cưỡng cược cạn cạnh cạo cả cải cảm cản cảng cảnh cấm cấp cất cấu cấy cầm
cần cầu cẩn cẩu cận cập cậu cậy cắm cắn cắp cắt cặn cặp cỏ cố cốc cống cốt cổ cổng cỗ cộng cột cớ
cớm cờ cởi cỡ cụ cục cụt củ của cứ cứng cứt cứu cừu cử cửa cự cực cựu da dan danh dao day de dean di
dinh diễn diện diệp diệt diệu do doanh doc don doạ du dung duy duyên duyệt dài dàn dàng dành dày dám
dán dáng dâm dân dâng dâu dây dã dãy dét dê dì dính dò dòng dõi dù dùm dùng dĩ dũng dơ dơi dư dưa
dương dưới dường dưỡi dưỡng dược dạ dại dạng dạo dạy dấu dần dầu dẫn dập dậy dắt dặm dặn dẹp dễ dị
dịch dịp dịt dịu dọa dọc dọn dốc dối dồn dỗ dội dờ dời dở dỡ dụ dục dụng dứt dừng dữ dự dựa dựng e
em ga gai gan gay gen get ghen ghi ghé ghép ghét ghê ghế gi gia giai giam gian giang giao già giành
giàu giày giá giác giám gián giáng giáo giáp giây giãn giêng gió giùm giúp giơ giường giả giải giảm
giản giảng giấc giấu giấy giầy giận giật giặt giết giọng giọt giỏi giống giỗ giới giờ giời giở giỡn
giữ giữa go got guy gà gài gác gái gánh gây gã gãy gì gìn góc gói góp gõ găng gũi gươm gương gạch
gạt gấp gấu gầm gần gầy gậy gắn gắng gặp gịt gọi gọn gốc gối gồm gỗ gội gớm gờ gởi gỡ gợi gục gửi ha
hai ham han hang hay he heo hey hi him hiếm hiến hiếp hiếu hiền hiểm hiển hiểu hiện hiệp hiệu ho hoa
hoan hoang hoà hoài hoàn hoàng hoành hoá hoãn hoăc hoạch hoại hoạn hoạt hoảng hoặc hung huy huynh
huyết huyền huấn huệ huống huỷ hy hà hài hàm hàn hàng hành hào hái hát hâm hân hãi hãm hãng hãnh hãy
hè hèn hét hình hít hò hòa hòn hòng hóa hô hôi hôm hôn hông hù hùng hút hơi hơn hư hưu hương hước
hướng hưởng hạ hại hạm hạn hạng hạnh hạt hả hải hảo hấp hầm hầu hận hậu hắc hắn hằng hẳn hẹn hẹp hết
hề hệ hệt họ họa học họng họp hỏa hỏi hỏng hố hối hồ hồi hồn hồng hổ hổng hỗ hỗn hộ hội hộp hở hỡi
hợp hụt hủy hứa hứng hử hữu i ian im in it kem ken khai khao khe khen khi khinh khiên khiêu khiến
khiếp khiết khiếu khiển kho khoa khoai khoan khoang khoe khoá khoác khoái khoản khoảng khoảnh khoẻ
khu khung khuya khuyên khuyến khuôn khuất khuẩn khá khác khách khái khám khán kháng khánh khát khâu
khéo khí khích khó khóa khóc khói khô khôi khôn không khùng khúc khăn khơi khả khảo khấu khẩn khẩu
khắc khắp khẳng khỉ khỏa khỏe khỏi khối khốn khống khổ khổng khớp khờ khởi khủng khứ khử ki kia kim
king kinh kiên kiêu kiếm kiến kiếp kiềm kiểm kiểu kiệm kiện kiệt ko kèm kèn kèo kém kéo kép két kê
kênh kêu kì kìa kí kích kín kính ký kĩ kẹo kẹp kẹt kẻ kế kết kể kệ kỉ kịch kịp kỳ kỵ kỷ kỹ la lai
lam lan lang lao lau lee len leo let li linh liên liêng liếm liền liều liễu liệt liệu lo long loài
loại loạn loạt lui lung luyện luân luôn luận luật ly là làm làn làng lành lá lái lánh láo láp lát
lâm lâu lây lãng lãnh lão lén lét lê lên lí lính lít líu lò lòng lót lô lôi lông lõi lùi lùn lùng
lúc lý lăm lăn lăng lĩnh lũ lũng lơ lưng lưu lương lưới lướt lười lưỡi lưỡng lược lượn lượng lượt lạ
lạc lại lạm lạnh lạp lạt lạy lấp lấy lầm lần lầu lẩn lẩu lẫn lẫy lận lập lật lậu lắc lắm lắng lắp
lặn lặng lặp lẹ lẻ lẻn lẽ lề lều lễ lệ lệch lệnh lịch lọ lọc lọt lỏng lố lối lồ lồng lỗ lỗi lộ lội
lộn lột lớn lớp lờ lời lỡ lợi lợn lục lừa lửa lựa lực lựu ma mac mai man mang manh mau may me men mi
mia minh miêu miếng miền miễn miện miệng moi mong mu mua muôn muối muốn muội muộn my mà mài màn màng
màu mày má mác mái mánh mát máu máy mây mã mãi mãn mãnh mèo mét mê mì mình mít mò mòn móc món móng
mô môi môn mông mù mùa mùi mùng múa mĩ mũ mũi mơ mưa mưu mươi mười mượn mạc mạch mại mạn mạng mạnh
mạo mảnh mất mấy mẫu mập mật mắc mắn mắt mặc mặt mẹ mẻ mẽ mến mềm mệnh mệt mọc mọi mỏ mỏi mỏng mối
mốt mồ mồi mồm mồng mổ mỗi mộ mộc mộng một mớ mới mờ mời mở mỡ mợ mụ mục mức mừn mừng mực mỹ na nam
nay neo nga ngai ngang ngay nghe nghi nghiêm nghiên nghiền nghiệm nghiện nghiệp nghiệt nghèo nghìn
nghĩ nghĩa nghề nghệ nghỉ nghị nghịch ngoan ngon ngoài ngoái ngoại ngu nguy nguyên nguyền nguyễn
nguyện nguyệt nguồn ngài ngàn ngành ngào ngày ngân ngây ngã ngón ngô ngôi ngôn ngăn ngũ ngơi ngư
ngưng ngươi người ngưỡng ngược ngạc ngại ngạo ngất ngầm ngầu ngẩn ngẫu ngậm ngập ngắm ngắn ngắt ngọc
ngọn ngọt ngốc ngồi ngộ ngột ngớ ngờ ngợi ngục ngụy ngủ ngừng ngửi ngữ ngự ngựa ngực nha nhai nhanh
nhau nhi nhiên nhiêu nhiều nhiễm nhiễu nhiệm nhiệt nho nhu nhuận nhà nhàng nhá nhánh nhát nháy nhân
nhã nhãn nhé nhét nhì nhìn nhí nhích nhóc nhóm nhúc nhúng như nhưng nhường nhượng nhạc nhạo nhạt
nhạy nhảm nhảy nhấc nhấn nhất nhầm nhẫn nhận nhập nhật nhắc nhắm nhắn nhằm nhặt nhẹ nhện nhỉ nhị
nhịp nhỏ nhốt nhồi nhổ nhớ nhờ nhở nhỡ nhục nhứt những nhựa nhựt ninh niên niềm niệm no non not nuôi
nuốt nàn nàng nào này náo nát nân nâng nâu nã não nãy nè né ném nét nên nít nó nóc nói nón nóng nô
nôn nông núc núi nút năm năng nơi nương nước nướng nạ nạn nạp nạt nảy nấm nấp nấu nắc nắm nắng nằm
nẵng nặng nếm nến nếu nền nọ nối nốp nốt nồng nổ nổi nỗ nỗi nộ nội nộp nớt nở nợ nụ nứt nửa nữ nữa o
on ong out pha phang phanh phe phi phim phiên phiêu phiến phiếu phiền phong phu phun phàn phá phái
phán pháo pháp phát phân phép phê phí phía phòng phó phóng phô phôn phù phú phúc phút phơi phương
phước phạm phạt phải phản phấn phần phẩm phẩy phẫu phận phật phế phết phỏng phố phối phổ phổi phụ
phục phụng phủ phức pin pát pét pê pích pót pốt pờ qua quan quang quanh quay que queen quen quy
quyến quyết quyền quyển quà quá quái quán quát quân quãng quét quê quên quí quít quý quăng quả quản
quảng quấy quần quầy quận quậy quặc quốc quỳ quỷ quỹ ra ranh rau ray re riêng ro roi ron roy run
rung ruồi ruột ryan ràng rào rác rách rán ráng râu rèn rên rít rô rôi rôm rõ rùa rút răng rũ rơi
rưởi rưỡi rượu rạc rạp rảnh rất rầy rập rắc rắn rằm rằng rẻ rẽ rể rỉ rối rốp rốt rồ rồi rồng rỗi
rỗng rộn rộng rớt rờ rời rủa rủi rừng rửa rực sa sai sam san sang sao sau say sean see sinh siêu so
soi son song soát soạn su sung suy suýt suất suốt suỵt sàn sàng sách sáng sánh sáo sát sáu sân sâu
séc sét sê sòng sóc sói sóng sót sô sôi sông súc súng súp săn sĩ sơ sơn sư sưu sương sướng sườn sưởi
sạch sạn sản sảnh sần sập sắc sắm sắp sắt sẵn sẹo sẻ sẽ sếp sỉ sọ số sốc sống sốt sổ sớm sờ sở sợ
sợi sụp sứ sức sừn sừng sử sửa sữa sự sỹ ta tai tam tan tang tao tay team tha thai tham than thang
thanh thao that thay the thea then theo they thi thiên thiêng thiêu thiếp thiết thiếu thiền thiểu
thiện thiệp thiệt thiệu thoáng thoát thoại thoả thoải thoảng thu thua thung thuyết thuyền thuê thuần
thuận thuật thuế thuốc thuộc thuỷ thà thành thác thách thái thám tháng thánh tháo tháp thâm thân
thây thèm thép thét thê thêm thì thí thích thói thô thôi thông thù thùng thú thúc thăm thăng thơ
thơm thư thưa thương thước thường thưởng thượng thạc thạch thả thải thảm thảo thảy thấp thất thấu
thấy thầm thần thầy thẩm thậm thận thập thật thắc thắn thắng thắt thằng thẳng thẻ thế thề thể thỉnh
thỉu thị thịnh thịt thỏ thỏa thối thống thổ thổi thờ thời thở thợ thụ thụy thủ thủng thủy thứ thức
thừa thử thự thực ti tia tim tin tinh tiêm tiên tiêu tiếc tiến tiếng tiếp tiết tiềm tiền tiểu tiễn
tiệc tiệm tiện tiệt to toa toi tom toà toàn toán tra trai trang tranh trao treo tri trinh triết
triều triển triệu tro trong trung truy truyền truyện trà tràn trá trách trái trán tráng tránh trân
trèo trên trêu trì trình trí trích trò tròn trói trôi trông trùm trùng trú trúc trúng trăm trăng
trơn trưa trưng trương trước trường trưởng trượng trượt trại trạm trạng trả trải trấn trầm trần trận
trật trắng trặc trẻ trễ trị trọ trọn trọng trốn trống trồng trộm trộn trời trở trợ trụ trục trứng
trừ trừng trữ trực tu tui tung tuy tuyên tuyến tuyết tuyển tuyệt tuân tuần tuầng tuệ tuổi ty tà tài
tàn tàng tào tàu tá tác tách tái tám tán táo táp tát tâm tân tây tè té téc tê tên tìm tình tí tích
tím tín tính tò tòa tóc tóm tóp tô tôi tôm tôn tông tù tùng tùy túc túi túng túy tý tăm tăng tĩnh tư
tươi tương tước tưới tướng tường tưởng tượng tạ tại tạm tạng tạo tạp tả tải tản tảng tấm tấn tất tầm
tần tầng tầu tẩu tẩy tận tập tật tắc tắm tắt tặc tặng tế tếch tết tể tệ tỉ tỉa tỉnh tị tịch tọa tỏ
tỏa tố tốc tối tốn tống tốp tốt tồi tồn tổ tổn tổng tộc tội tớ tới tờ tởm tụ tục tụi tủ tủy tứ tức
từ từng tử tự tỷ u um ung up uy uých uýt uống va vai van vang vay ve vi vinh viêm viên viết viễn
việc viện việt voi vong vu vua vui vuốt và vài vàng vào vá vác vách ván váy vân vâng vâu vây vã vãi
vãn vé vì ví vòi vòng vô võ vùng vú văn vĩ vĩnh vũ vương vướng vườn vượt vạch vạn vả vải vấn vất vần
vầy vẩn vẫn vẫy vận vật vậy vắng vặn vặt vẹn vẻ vẽ vết về vệ vị vịnh vịt vọng vỏ vốn vồ vỗ vội vớ
với vờ vời vở vỡ vợ vụ vụn vứt vừa vững vực vựng xa xanh xe xem xin xinh xoa xoay xong xoá xu xui
xung xuyên xuân xuôi xuất xuẩn xuống xà xài xá xác xách xám xáng xâm xây xã xé xét xê xì xí xích xíu
xóa xóm xót xô xôi xông xúc xăm xăng xơ xưa xưng xương xưởng xạ xả xảy xấu xẹt xế xếp xỉn xộn xứ
xứng xử y yi yo yên yêu yếu yểm à ào á ác ái ám án ánh áo áp âm ân âu ây ép ét ê êm ích ít óc ô ôi
ôm ôn ông úy ý ăn đa đai đam đan đang đao đau đe đem đen đeo đi đii đinh điên điếc điếm điếu điền
điều điểm điển điện điệp điệu đo đoan đoàn đoán đoạn đoạt đua đuôi đuối đuổi đà đài đàm đàn đàng đào
đá đái đám đáng đánh đáo đáp đáy đâm đâu đây đã đãi đãng đè đèn đéo đét đê đêm đình đích đính đít
đòi đòn đó đói đón đóng đô đôi đôn đông đùa đùi đúng đăng đĩ đĩa đũa đơ đơn đưa đươc đương đường
được đạc đại đạn đạo đạp đạt đảm đảng đảo đấm đấng đất đấu đấy đầm đần đầu đầy đẩy đập đậu đậy đắm
đắn đắt đằng đẳng đặc đặn đặt đẹp đẻ đẽ đế đếch đếm đến đề đền đều để đệ đệch đệt đỉnh địa địch định
địt đọc đỏ đố đốc đối đống đốt đồ đồi đồn đồng đổ đổi đỗ độ độc đội độn động đột đớn đời đỡ đợi đợt
đụng đủ đứa đức đứng đứt đừng đực đựng ơ ơi ơn ư ưa ưu ước ướt ảnh ảo ấm ấn ấy ẩm ẩn ận ếch ết ểu ốc
ối ốm ống ồn ổn ổng ớt ờ ở ủi ủng ủy ứ ức ứng ừ ừm
`;

/** Letters with their marks in any order: the decoder and the list may put a tone on a different vowel ("ngòai", "ngoài"). */
export function syllableKey(word: string): string {
  let base = "";
  const marks: string[] = [];
  for (const ch of word.normalize("NFD").toLowerCase()) {
    if (/\p{M}/u.test(ch)) marks.push(ch);
    else if (ch === "đ") { base += "d"; marks.push("-"); }
    else base += ch;
  }
  return `${base}|${marks.sort().join("")}`;
}

const KEYS = new Set(WORDS.split(/\s+/).filter(Boolean).map(syllableKey));

/** A word (marks on, any case) that is a common Vietnamese syllable. */
export function isFrequentSyllable(word: string): boolean {
  return KEYS.has(syllableKey(word));
}

/** The list as written, for tests and the eval. */
export const FREQ_SYLLABLES: ReadonlySet<string> = new Set(WORDS.split(/\s+/).filter(Boolean));
