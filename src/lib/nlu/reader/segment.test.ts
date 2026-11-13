// Item cuts inside one line: a separator splits only between items, never inside a number, date or clock.
import { describe, expect, it } from "vitest";
import { segment } from "./segment";

describe("segment: items on one line", () => {
  for (const sep of [",", ";", ".", "!", "?"]) {
    it(`cuts at "${sep}" after an item with a date and before a word pair`, () => {
      const clauses = segment(
        `Launch zf trc mai${sep} Soạn slide zf hết tuần này`,
      );
      expect(clauses.map((c) => c.text)).toEqual([
        "Launch zf trc mai",
        "Soạn slide zf hết tuần này",
      ]);
    });
  }

  it("keeps each clause start at its offset in the line", () => {
    const text =
      "Launch zf trc mai, Soạn slide zf hết tuần này, Viết báo cáo đồ án trước 20/11";
    for (const c of segment(text))
      expect(text.slice(c.start, c.start + c.text.length)).toBe(c.text);
  });

  it("never cuts inside a number, date, clock or room code", () => {
    for (const t of [
      "Nộp báo cáo trước thứ 6, 9/11 nhớ mang laptop",
      "Họp lúc 23h, 9/11 ở A2.101",
      "Học ngày 20.11 ở A2.101 nhé",
    ]) {
      expect(segment(t)).toHaveLength(1);
    }
  });

  it("does not cut when the text before has no mention", () => {
    expect(segment("Mua sữa, học bài nhé")).toHaveLength(1);
  });

  it("does not cut before a single word", () => {
    expect(segment("Launch zf trc mai, gấp")).toHaveLength(1);
  });

  it("does not cut before a clause that completes the item, a date or a correction", () => {
    for (const t of [
      "Chủ nhật đi tình nguyện, tập trung 6h30 cổng trường",
      "Buổi nghỉ: thứ ba, ngày 29/9/2026",
      "thứ sáu, à không, thứ bảy nộp báo cáo",
      "t2, t4, t6 7h tối",
    ]) {
      expect(segment(t)).toHaveLength(1);
    }
  });
});
