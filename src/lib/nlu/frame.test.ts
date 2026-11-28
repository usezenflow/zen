import { describe, expect, it } from "vitest";
import { frameOf, within1, type TaskClass } from "./frame";

/** The title without accents: đ maps to d. */
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");

// Three phrasings per class, verb-first or object-first where that reads naturally.
const GRID: [TaskClass, string[]][] = [
  ["code", ["code b-tree và lsm", "b-tree code", "lập trình game Unity"]],
  ["fix", ["fix bug đăng nhập", "sửa lỗi giỏ hàng", "đăng nhập debug"]],
  ["review_code", ["review PR #12", "review code module auth", "PR review code thanh toán"]],
  ["write_doc", ["viết báo cáo mạng máy tính", "báo cáo thực tập", "viết tài liệu API"]],
  ["essay", ["tiểu luận Triết học", "essay về khí hậu", "bài luận Triết học"]],
  ["slides", ["slide chương 3", "làm powerpoint giới thiệu", "thuyết trình Marketing"]],
  ["thesis", ["khóa luận tốt nghiệp", "luận văn thạc sĩ", "bảo vệ đồ án tốt nghiệp"]],
  ["exam_review", ["ôn thi cuối kì giải tích", "giải tích ôn", "ôn tập Vật lý"]],
  ["homework", ["bài tập về nhà Toán", "BTVN tuần 4", "làm bài tập Đại số"]],
  ["read", ["đọc 3 chương giáo trình", "đọc tài liệu Mạng", "đọc giáo trình OS"]],
  ["language", ["học tiếng Anh giao tiếp", "ôn IELTS", "luyện TOEIC"]],
  ["skill", ["học đàn guitar", "tập piano", "học vẽ tranh"]],
  ["workout_gym", ["tập gym buổi sáng", "gym 60 phút", "tập tạ chân"]],
  ["workout_run", ["chạy bộ công viên", "chạy 5 km", "chạy sáng sớm"]],
  ["workout_yoga", ["yoga buổi tối", "tập yoga", "yoga 30 phút"]],
  ["workout_swim", ["bơi 1 km", "bơi buổi sáng", "tập bơi"]],
  ["habit_read", ["đọc sách buổi tối", "đọc sách", "đọc sách mỗi ngày"]],
  ["habit_meditate", ["thiền 10 phút", "thiền buổi sáng", "thiền trước khi ngủ"]],
  ["habit_journal", ["viết nhật ký", "nhật ký cuối ngày", "journal tối"]],
  ["clean", ["dọn phòng ngủ", "lau nhà", "dọn bếp"]],
  ["laundry", ["giặt đồ", "phơi đồ", "laundry tuần này"]],
  ["cook", ["nấu ăn tối", "nấu cơm", "cook pasta"]],
  ["shop", ["đi chợ", "đi siêu thị", "mua rau"]],
  ["bill", ["đóng tiền điện", "trả tiền nước", "đóng học phí"]],
  ["budget", ["lập ngân sách tháng 11", "tính chi tiêu", "budget tháng này"]],
  ["tax", ["khai thuế TNCN", "quyết toán thuế", "tax return"]],
  ["paperwork", ["làm giấy tờ", "gia hạn visa", "nộp hồ sơ học bổng"]],
  ["email", ["gửi mail cho GV", "trả lời email", "nhắn tin cho bạn"]],
  ["call", ["gọi điện cho mẹ", "call khách hàng", "gọi cho ngân hàng"]],
  ["meeting", ["họp nhóm đồ án", "standup sáng", "meeting với GV"]],
  ["appointment", ["khám răng", "đi khám bệnh", "hẹn bác sĩ"]],
  ["selfcare", ["cắt tóc", "gội đầu", "massage thư giãn"]],
  ["content", ["viết post cho fanpage", "làm reel cho fanpage", "edit video review sản phẩm"]],
  ["design", ["thiết kế banner sự kiện", "design logo mới", "mockup landing page"]],
  ["sales", ["báo giá cho khách", "sales call với client", "chốt đơn bán hàng"]],
  ["report", ["báo cáo tuần", "báo cáo tháng 11", "weekly report team"]],
  ["plan", ["viết OKR q4 cho team markting", "kế hoạch quý 1", "roadmap sản phẩm"]],
  ["interview", ["phỏng vấn ứng viên", "tuyển dụng backend", "interview ứng viên FE"]],
  ["deploy", ["deploy bản mới", "release v2.1", "hotfix cho production"]],
  ["research", ["nghiên cứu thị trường", "phân tích dữ liệu khách", "khảo sát người dùng"]],
  ["spec", ["viết spec tính năng", "tài liệu kỹ thuật API", "PRD cho checkout"]],
  ["presentation", ["pitch startup cho nhà đầu tư", "present kết quả", "presentation quý 4"]],
  ["admin_work", ["ký hợp đồng thuê", "gửi hóa đơn", "chấm công tháng 11"]],
  ["pet", ["cho gà ăn", "cho ăn gà", "cho cá ăn"]],
  ["plants", ["tưới cây", "tưới hoa ban công", "water the plants"]],
  ["trash", ["đổ rác", "vứt rác", "bỏ rác"]],
  ["meds", ["uống thuốc", "thuốc buổi sáng", "uống thuốc sau ăn"]],
  ["pickup", ["đón con đi học", "đưa em đi học", "pick up con"]],
  ["repair", ["sửa xe máy", "sửa điện nước", "repair máy giặt"]],
];

// One 1-letter typo in a class keyword of 4+ letters, with accents kept.
const TYPOS: [TaskClass, string][] = [
  ["code", "cdoe b-tree"],
  ["fix", "debgu memory leak"],
  ["review_code", "reveiw code auth"],
  ["write_doc", "reprot mạng máy tính"],
  ["report", "reprot tuần 3"],
  ["content", "reeel cho fanpage"],
  ["design", "desing logo"],
  ["interview", "intervew ứng viên"],
  ["deploy", "deplyo bản mới"],
  ["research", "reserach nhanh"],
  ["plan", "roadmpa sản phẩm"],
  ["sales", "slaes bán hàng"],
  ["presentation", "presentaiton quý 4"],
  ["admin_work", "invoce tháng 11"],
  ["trash", "tarsh rác"],
  ["repair", "repiar máy giặt"],
  ["pickup", "pickpu con"],
  ["essay", "essy về khí hậu"],
  ["slides", "slied chương 3"],
  ["thesis", "thesiss machine learning"],
  ["homework", "homwork Toán"],
  ["read", "raed 2 chương"],
  ["language", "ielst tuần này"],
  ["skill", "guiatar lessons"],
  ["workout_run", "chya bo"],
  ["workout_yoga", "yogaa sáng"],
  ["workout_swim", "swmi buổi sáng"],
  ["habit_meditate", "meditaiton sáng"],
  ["habit_journal", "jornal tối"],
  ["clean", "cleen phòng"],
  ["laundry", "laudnry tuần này"],
  ["cook", "coook pasta"],
  ["shop", "shpo rau"],
  ["bill", "đóng tiền internte"],
  ["budget", "bugdet tháng 11"],
  ["tax", "khai thuee"],
  ["paperwork", "làm giya tờ"],
  ["email", "emial cho GV"],
  ["call", "clal khách hàng"],
  ["meeting", "meetnig nhóm"],
  ["appointment", "appintment nha sĩ"],
];

describe("frameOf class grid", () => {
  for (const [cls, titles] of GRID)
    for (const t of titles)
      it(`${cls}: ${t}`, () => {
        expect(frameOf(t).cls).toBe(cls);
        expect(frameOf(plain(t)).cls).toBe(cls);
      });

  for (const [cls, t] of TYPOS)
    it(`${cls} with a typo: ${t}`, () => {
      expect(frameOf(t).cls).toBe(cls);
      expect(frameOf(plain(t)).cls).toBe(cls);
    });
});

describe("within1", () => {
  it("accepts one insert, delete, substitute or adjacent swap", () => {
    expect(within1("code", "cdoe")).toBe(true);
    expect(within1("code", "cde")).toBe(true);
    expect(within1("code", "codes")).toBe(true);
    expect(within1("code", "cxde")).toBe(true);
    expect(within1("code", "code")).toBe(true);
  });
  it("rejects two edits", () => {
    expect(within1("code", "xxde")).toBe(false);
    expect(within1("code", "co")).toBe(false);
  });
});

describe("frameOf objects and verb", () => {
  it("is order-free: verb before or after the objects", () => {
    const a = frameOf("code b-tree và lsm");
    expect(a).toMatchObject({ verb: "code", objects: ["b-tree", "lsm"], cls: "code" });
    expect(frameOf("b-tree code và lsm")).toMatchObject({ verb: "code", objects: ["b-tree", "lsm"] });
    expect(frameOf("giải tích ôn")).toMatchObject({ verb: "on", objects: ["giai tich"], cls: "exam_review" });
    expect(frameOf("ôn giải tích")).toMatchObject({ verb: "on", objects: ["giai tich"] });
    expect(frameOf("on giai tich").objects).toEqual(["giai tich"]);
  });
  it("splits objects on và, vs, comma, plus and ampersand", () => {
    expect(frameOf("code b-tree , lsm + ram & cache").objects).toEqual(["b-tree", "lsm", "ram", "cache"]);
    expect(frameOf("code b-tree vs lsm").objects).toEqual(["b-tree", "lsm"]);
  });
  it("keeps the spelling of objects: only class words are fuzzed", () => {
    const f = frameOf("lập trình bảng");
    expect(f.cls).toBe("code");
    expect(f.objects).toEqual(["bang"]);
  });
  it("does not read a course name as a class", () => {
    const f = frameOf("Giải tích");
    expect(f.cls).toBeUndefined();
    expect(f.objects).toEqual(["giai tich"]);
  });
  it("does not fuzz short words or tokens with digits and hyphens", () => {
    expect(frameOf("fx b-tree").cls).toBeUndefined();
    expect(frameOf("c0de b-tree").cls).toBeUndefined();
  });
  it("reads báo cáo mon web as a write_doc on mon web", () => {
    expect(frameOf("bao cao mon web")).toMatchObject({ verb: "bao cao", objects: ["mon web"], cls: "write_doc" });
  });
});

describe("frameOf quantities", () => {
  it("reads digits with a unit", () => {
    expect(frameOf("đọc 10 cuốn sách").qty).toEqual({ n: 10, unit: "cuon" });
    expect(frameOf("viết 20 trang").qty).toEqual({ n: 20, unit: "trang" });
    expect(frameOf("chạy 5 km").qty).toEqual({ n: 5, unit: "km" });
    expect(frameOf("viết 500 chữ").qty).toEqual({ n: 500, unit: "chu" });
  });
  it("reads spoken numbers with a unit", () => {
    expect(frameOf("đọc ba chương").qty).toEqual({ n: 3, unit: "chuong" });
    expect(frameOf("đọc mười trang").qty).toEqual({ n: 10, unit: "trang" });
    expect(frameOf("đọc hai mươi trang").qty).toEqual({ n: 20, unit: "trang" });
    expect(frameOf("làm một slide").qty).toEqual({ n: 1, unit: "slide" });
  });
  it("does not read làm bài tập as five exercises", () => {
    const f = frameOf("làm bài tập Đại số");
    expect(f.qty).toBeUndefined();
    expect(f.cls).toBe("homework");
  });
  it("takes the count out of the objects", () => {
    expect(frameOf("đọc 3 chương giáo trình").objects).toEqual(["giao trinh"]);
  });
  it("gives 5 bài a homework count", () => {
    expect(frameOf("làm 5 bài")).toMatchObject({ cls: "homework", qty: { n: 5, unit: "bai" } });
  });
});

describe("frameOf reads, flags and stakes", () => {
  it("reads a book with a count as read, without one as a habit", () => {
    expect(frameOf("đọc 10 cuốn sách").cls).toBe("read");
    expect(frameOf("đọc giáo trình OS").cls).toBe("read");
    expect(frameOf("đọc sách").cls).toBe("habit_read");
    expect(frameOf("đọc sách mỗi tối").cls).toBe("habit_read");
  });

  it("sets stakes", () => {
    expect(frameOf("ôn thi cuối kì giải tích")).toMatchObject({ cls: "exam_review", stakes: "final", objects: ["giai tich"] });
    expect(frameOf("kiểm tra giữa kỳ Toán").stakes).toBe("mid");
    expect(frameOf("GK Hóa").stakes).toBe("mid");
    expect(frameOf("quiz 15p Anh văn").stakes).toBe("quiz");
    expect(frameOf("đồ án web").stakes).toBe("deliverable");
    expect(frameOf("luận văn thạc sĩ").stakes).toBe("thesis");
    expect(frameOf("khóa luận tốt nghiệp").stakes).toBe("thesis");
  });
  it("reads đa as đồ án only as a whole word", () => {
    expect(frameOf("đa web").stakes).toBe("deliverable");
    expect(frameOf("đã nộp báo cáo").stakes).toBeUndefined();
  });
  it("sets group from nhóm, team and cả nhóm", () => {
    expect(frameOf("họp nhóm đồ án").group).toBe(true);
    expect(frameOf("làm slide cả nhóm").group).toBe(true);
    expect(frameOf("lập trình team game")).toMatchObject({ group: true, objects: ["game"] });
    expect(frameOf("họp nhóm đồ án").objects).toEqual([]);
  });
  it("sets hard from khó, lại từ đầu, chưa biết gì, từ con số 0 and mất gốc", () => {
    expect(frameOf("giải tích khó").hard).toBe(true);
    expect(frameOf("lại từ đầu tiếng Anh").hard).toBe(true);
    expect(frameOf("học bơi từ con số 0").hard).toBe(true);
    expect(frameOf("mất gốc tiếng Nhật").hard).toBe(true);
    expect(frameOf("chưa biết gì về code b-tree").hard).toBe(true);
    expect(frameOf("giải tích").hard).toBe(false);
  });
  it("gives a domain by class", () => {
    expect(frameOf("code b-tree").domain).toBe("study");
    expect(frameOf("tập gym").domain).toBe("health");
    expect(frameOf("đóng tiền điện").domain).toBe("finance");
    expect(frameOf("giải tích").domain).toBeUndefined();
  });
  it("gives the more specific class first", () => {
    expect(frameOf("review pr").cls).toBe("review_code");
    expect(frameOf("đọc 3 chương").cls).toBe("read");
    expect(frameOf("bài tập lớn").cls).toBe("homework");
    expect(frameOf("ôn thi tiếng anh").cls).toBe("language");
    expect(frameOf("học bơi").cls).toBe("workout_swim");
    expect(frameOf("học bơi lội").cls).toBe("skill");
  });

  it("in is printing, not writing; English in/on stay out of it", () => {
    expect(frameOf("In báo cáo ktpm").cls).toBe("print");
    expect(frameOf("in tài liệu").cls).toBe("print");
    expect(frameOf("check in the report").cls).not.toBe("print");
    expect(frameOf("Call mom on Sunday").cls).toBe("call");
    expect(frameOf("Đặt đồ ăn").cls).toBe("shop");
  });
});
