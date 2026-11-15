import { describe, expect, it } from "vitest";
import { read } from "./reader";

// The whole text becomes a task's note only when it is that one task's context (a long line, a pasted notice),
// never when it is a jotted list of several tasks: each would carry every other task's words.
const ref = { y: 2026, m: 11, d: 14, h: 9, mi: 0 };
const ITEMS = ["học system design hết tuần này", "viết báo cáo môn web trước 20/11", "đọc code zenflow hết tuần này", "quay demo sản phẩm trước mai", "dọn phòng tối nay"];
const SOURCES = ["typed", "paste", "ocr"] as const;

describe("whole-text note", () => {
  for (const source of SOURCES)
    for (let n = 2; n <= ITEMS.length; n++)
      for (const sep of [", ", "; "]) {
        const text = ITEMS.slice(0, n).join(sep);
        it(`${source}, ${n} on one line (${JSON.stringify(sep)}, ${text.length} chars): no item carries the whole text`, () => {
          const r = read(text, { source, ref });
          expect(r.items.length).toBeGreaterThan(1);
          for (const x of r.items) expect(x.note ?? "").not.toContain(ITEMS[1].slice(0, 12));
        });
      }

  for (const source of SOURCES)
    it(`${source}, a typed list on lines: typed drops it, a pasted notice keeps it`, () => {
      const r = read(ITEMS.map((x) => `- ${x}`).join("\n"), { source, ref });
      const noted = r.items.filter((x) => x.note);
      if (source === "typed") expect(noted).toHaveLength(0);
      else expect(noted.length).toBe(r.items.length);
    });

  for (const source of SOURCES)
    it(`${source}, one long task: keeps the whole text as its note`, () => {
      const text = "Viết báo cáo môn web trước 20/11 nhớ ghi rõ phần phân công nhóm và đính kèm link github cùng video demo dài khoảng năm phút để thầy chấm cho dễ";
      const r = read(text, { source, ref });
      expect(r.items).toHaveLength(1);
      expect(r.items[0].note).toBeTruthy();
    });
});
