import { describe, expect, it } from "vitest";
import { think } from "./commands";

const now = new Date("2026-11-13T03:00:00Z"); // 10:00 Fri, UTC+7

describe("a spoken line always creates", () => {
  it("a read line keeps what was read", () => {
    expect(think("họp nhóm mai 9h", now)).toEqual([expect.objectContaining({ op: "create", when: "2026-11-14T09:00:00" })]);
  });
  it("any input, gibberish too, gives at least one create with a title", () => {
    const lines = [
      "mua sữa", "xong bai tap toan", "xoá họp nhóm", "dời bài tập sang mai", "ghi chú: ba gọi điện", "dọn phòng vào thứ 7",
      "asdkjh qwe", "???", "!!!", "...", "123", "3h", "mai", "9h sáng mai", "thứ 2", "hàng tuần", "mỗi", "a", "🙂🙂", "ok", "lol 42 zz",
      "x".repeat(500), "đi đi đi đi đi đi", "   lạ   lắm   ", "hôm qua", "31/2", "25:99", "trước", "từ đến", "sáng hoặc tối",
    ];
    for (const s of lines) {
      const a = think(s, now);
      expect(a.length, s).toBeGreaterThan(0);
      for (const x of a) { expect(x.op, s).toBe("create"); expect(x.title?.trim(), s).toBeTruthy(); }
    }
  });
  it("a line the reader cannot use is the title as said", () => {
    expect(think("  asdkjh   qwe ", now)[0].title).toMatch(/asdkjh/i);
  });
});
