import { describe, expect, it } from "vitest";
import { think } from "./commands";

const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Fri, UTC+7

describe("a spoken line", () => {
  it("a note keeps the original words", () => {
    expect(think("Ghi chú: ba gọi điện chiều mai", now)).toEqual([{ op: "note", title: "ba gọi điện chiều mai" }]);
  });
  it("anything else is a create", () => {
    expect(think("họp nhóm mai 9h", now)).toEqual([expect.objectContaining({ op: "create", when: "2026-11-14T09:00:00" })]);
    for (const s of ["mua sữa", "dọn phòng vào thứ 7", "chuyển tiền vào thứ 6", "hoàn thành báo cáo nhóm trước thứ 6"]) expect(think(s, now)[0]).toMatchObject({ op: "create" });
  });
});
