import { describe, expect, it } from "vitest";
import { kindOf, kindsOf } from "./kind";

describe("kindOf", () => {
  it("reads the four kinds from title words", () => {
    for (const [title, kind] of [
      ["Ôn Giải tích", "study"], ["Học tiếng Anh", "study"], ["Bài tập Toán", "study"], ["Đọc sách", "study"], ["Viết luận", "study"],
      ["Làm báo cáo", "study"], ["Báo cáo thực hành", "study"], ["Đề cương Vật lý", "study"], ["Ôn thi", "study"], ["Học từ vựng", "study"],
      ["Gym", "exercise"], ["Chạy bộ", "exercise"], ["Tập yoga", "exercise"], ["Đi bơi", "exercise"], ["Đá bóng", "exercise"], ["Tập thể dục", "exercise"],
      ["Dọn nhà", "chores"], ["Giặt đồ", "chores"], ["Mua sữa", "chores"], ["Rút tiền", "chores"], ["In tài liệu", "chores"], ["Trả sách", "chores"], ["Tưới cây", "chores"], ["Sửa xe", "chores"],
      ["Cà phê với Quang", "social"], ["Hẹn Lan", "social"], ["Gặp thầy", "social"], ["Gọi điện cho mẹ", "social"], ["Sinh nhật Nam", "social"], ["Đi chơi", "social"],
    ] as const) expect(kindOf(title), title).toBe(kind);
  });
  it("keeps the traps", () => {
    expect(kindOf("Bài tập Toán")).toBe("study"); // not "tập"
    expect(kindOf("Tập trung làm việc")).toBeUndefined();
    expect(kindOf("Mua hộp bút")).toBe("chores"); // not a meeting
    expect(kindOf("Uống trà")).toBeUndefined();
    expect(kindsOf("tối thì dọn nhà")).toEqual(["chores"]); // "thì" is not "thi"
  });
  it("stays undefined when no word says it", () => {
    for (const t of ["Viết nhật ký", "Xem phim", "Ngủ trưa", "Làm việc"]) expect(kindOf(t), t).toBeUndefined();
  });
});

import { it as it2, expect as expect2 } from "vitest";
import { itemAction as ia, readFull as rf } from "./adapt";
it2("'trong tuần này' is a due on Sunday, not a said window on one day", () => {
  const a = ia(rf("Quay demo game trong tuần này", new Date(2026, 10, 14, 13, 49)).items[0]);
  expect2(a.notAfter).toBeUndefined();
  expect2(a.deadline).toBe("2026-11-15T23:59:00");
});
