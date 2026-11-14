import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { split } from "./split";
import { preps } from "./prep";

const exam = (over: Partial<Task> = {}): Task => ({
  id: "dlu:e", title: "Toán", kind: "study", source: "dlu", fixed: "exam", effort: 90, start: 1e12, end: 1e12 + 9e6, deadline: 1e12, createdAt: 0, ...over,
});

describe("preps", () => {
  it("titles the prep by the exam format, the subject only in course", () => {
    for (const [format, title] of [
      ["Báo cáo(TL)", "Viết báo cáo"], ["Báo cáo TTTT,TL", "Viết báo cáo"], ["Tiểu luận", "Viết tiểu luận"], ["Thực hành", "Luyện thực hành"], ["Thi máy", "Luyện thực hành"],
      ["Vấn đáp", "Luyện vấn đáp"], ["Tự luận", "Ôn lý thuyết, luyện đề"], ["Trắc nghiệm", "Ôn thi"], [undefined, "Ôn thi"],
    ] as const) {
      expect(preps(exam({ format }))[0]).toMatchObject({ title, course: "Toán", source: "user", forId: "dlu:e", deadline: 1e12, maxSitting: 45 });
    }
  });
  it("sizes 45 min sittings by the format and the marks multiplier", () => {
    for (const [format, mult, n] of [["Báo cáo(TL)", 0.75, 3], ["Báo cáo(TL)", 1, 4], ["Báo cáo(TL)", 1.6, 6], ["Tự luận", 0.75, 2], ["Tự luận", 1, 3], ["Tự luận", 1.6, 4], ["Tự luận", 9, 4]] as const) {
      const [p] = preps(exam({ format }), mult);
      expect(split(p.effort, p.maxSitting)).toEqual(Array(n).fill(45));
    }
  });
});
