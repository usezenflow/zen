import { describe, expect, it } from "vitest";
import { kindOf, kindsOf } from "./kind";

describe("kindOf", () => {
  it("reads the four kinds from title words", () => {
    for (const [title, kind] of [
      ["Ôn Giải tích", "study"], ["Học tiếng Anh", "study"], ["Bài tập Toán", "study"], ["Đọc sách", "self"], ["Viết luận", "study"],
      ["Làm báo cáo", "study"], ["Báo cáo thực hành", "study"], ["Đề cương Vật lý", "study"], ["Ôn thi", "study"], ["Học từ vựng", "study"],
      ["Gym", "exercise"], ["Chạy bộ", "exercise"], ["Tập yoga", "exercise"], ["Đi bơi", "exercise"], ["Đá bóng", "exercise"], ["Tập thể dục", "exercise"],
      ["Dọn nhà", "chores"], ["Giặt đồ", "chores"], ["Mua sữa", "errand"], ["Rút tiền", "chores"], ["In tài liệu", "errand"], ["Trả sách", "chores"], ["Tưới cây", "chores"], ["Sửa xe", "chores"],
      ["Cà phê với Quang", "social"], ["Hẹn Lan", "social"], ["Gặp thầy", "social"], ["Gọi điện cho mẹ", "social"], ["Sinh nhật Nam", "social"], ["Đi chơi", "social"],
    ] as const) expect(kindOf(title), title).toBe(kind);
  });
  it("keeps the traps", () => {
    expect(kindOf("Bài tập Toán")).toBe("study"); // not "tập"
    expect(kindOf("Tập trung làm việc")).toBeUndefined();
    expect(kindOf("Mua hộp bút")).toBe("errand"); // not a meeting
    expect(kindOf("Uống trà")).toBeUndefined();
    expect(kindsOf("tối thì dọn nhà")).toEqual(["chores"]); // "thì" is not "thi"
  });
  it("stays undefined when no word says it", () => {
    for (const t of ["Xem phim", "Ngủ trưa", "Làm việc"]) expect(kindOf(t), t).toBeUndefined();
    expect(kindOf("Viết nhật ký")).toBe("self"); // a journal is a habit of the self
  });
});

describe("kindOf from the frame's class", () => {
  it("maps each class's domain to its kind", () => {
    for (const [title, kind] of [
      ["Báo cáo tuần", "work"], ["Phỏng vấn ứng viên", "work"], ["Chấm công tháng 11", "work"], ["Viết OKR quý 1", "work"],
      ["Cho gà ăn", "chores"], ["Tưới cây", "chores"], ["Đổ rác", "chores"], ["Sửa xe máy", "chores"],
      ["Đóng tiền điện", "finance"], ["Lập ngân sách tháng 11", "finance"], ["Khai thuế TNCN", "finance"],
      ["Đón con đi học", "errand"], ["Hẹn bác sĩ khám tổng quát", "errand"], ["Khám răng", "errand"], ["Gửi mail cho GV", "work"],
      ["Cắt tóc", "self"], ["Uống thuốc", "self"], ["Viết nhật ký", "self"],
    ] as const) expect(kindOf(title), title).toBe(kind);
  });
});

import { it as it2, expect as expect2 } from "vitest";
import { itemAction as ia, readFull as rf } from "./adapt";
it2("'trong tuần này' is a due on Sunday, not a said window on one day", () => {
  const a = ia(rf("Quay demo game trong tuần này", new Date(2026, 10, 14, 13, 49)).items[0]);
  expect2(a.notAfter).toBeUndefined();
  expect2(a.deadline).toBe("2026-11-15T23:59:00");
});
