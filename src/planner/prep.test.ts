import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { split } from "./split";
import { preps, skipPrep } from "./prep";

const exam = (over: Partial<Task> = {}): Task => ({
  id: "dlu:e", title: "Toán", kind: "study", source: "dlu", fixed: "exam", effort: 90, start: 1e12, end: 1e12 + 9e6, deadline: 1e12, createdAt: 0, ...over,
});

describe("preps", () => {
  it("titles the prep with the course's short name and the format; the whole course stays in course", () => {
    for (const [format, title] of [
      ["Báo cáo(TL)", "Viết báo cáo Toán"], ["Báo cáo TTTT,TL", "Viết báo cáo Toán"], ["Tiểu luận", "Viết tiểu luận Toán"], ["Thực hành", "Luyện thực hành Toán"], ["Thi máy", "Luyện thực hành Toán"],
      ["Vấn đáp", "Luyện vấn đáp Toán"], ["Tự luận", "Luyện đề Toán"], ["Trắc nghiệm", "Ôn thi Toán"], [undefined, "Ôn thi Toán"],
    ] as const) {
      expect(preps(exam({ format }))[0]).toMatchObject({ title, course: "Toán", source: "user", forId: "dlu:e", deadline: 1e12, maxSitting: 60 });
    }
  });
  it("names the course from the exam's title past its exam words, and keeps the prep id", () => {
    expect(preps(exam({ title: "Thi Giải tích 2", format: "Tự luận" }))[0]).toMatchObject({ id: "prep:dlu:e", title: "Luyện đề GT2", course: "Thi Giải tích 2" });
  });
  it("with no course name the title is the format's own", () => {
    expect(preps(exam({ title: "", format: "Tự luận" }))[0].title).toBe("Ôn lý thuyết, luyện đề");
  });
  it("Không cần ôn marks the prep deleted by the student, and again keeps one mark", () => {
    const [p] = preps(exam());
    const gone = skipPrep(p, 5);
    expect(gone).toMatchObject({ id: p.id, deletedAt: 5, userEdited: ["deleted"] });
    expect(skipPrep(gone, 6).userEdited).toEqual(["deleted"]);
  });
  it("sizes a report or essay format as a report, by the marks multiplier, in sittings of up to an hour", () => {
    for (const [format, mult, sizes] of [["Báo cáo(TL)", 0.75, [60, 60, 60, 30]], ["Báo cáo(TL)", 1, [60, 60, 60, 60, 30]], ["Báo cáo(TL)", 1.6, [60, 60, 60, 60, 60, 60, 60]]] as const) {
      const [p] = preps(exam({ format }), mult);
      expect(split(p.effort, p.maxSitting)).toEqual(sizes);
    }
  });
  it("sizes any other format by the exam's title, with no stakes 180 minutes", () => {
    for (const [format, mult, sizes] of [["Tự luận", 0.75, [60, 60, 30]], ["Tự luận", 1, [60, 60, 60]], ["Tự luận", 1.6, [60, 60, 60, 60, 60]], ["Tự luận", 9, [60, 60, 60, 60, 60]]] as const) {
      const [p] = preps(exam({ format }), mult);
      expect(split(p.effort, p.maxSitting)).toEqual(sizes);
    }
  });
  it("a final exam from its title is at least 480 minutes, in 5 or more sittings", () => {
    const [p] = preps(exam({ title: "Thi cuối kỳ Giải tích", format: undefined }));
    expect(p.effort).toBeGreaterThanOrEqual(480);
    expect(split(p.effort, p.maxSitting).length).toBeGreaterThanOrEqual(5);
  });
  it("a quiz is 120 minutes", () => {
    expect(preps(exam({ title: "Quiz Giải tích", format: undefined }))[0].effort).toBe(120);
  });
  it("a midterm is 360 minutes", () => {
    expect(preps(exam({ title: "Giữa kỳ Giải tích", format: undefined }))[0].effort).toBe(360);
  });
  it("scales by credits: 4 more than 2, 2 to 5 credits only", () => {
    const effort = (credits?: number) => preps(exam({ format: "Tự luận", credits }))[0].effort;
    expect(effort(4)).toBeGreaterThan(effort(2));
    expect(effort(10)).toBe(effort(5)); // clamped to 1.67
    expect(effort(1)).toBe(effort(2)); // clamped to 0.67
    expect(effort(0)).toBe(effort(undefined)); // no credits said
  });
  it("a retake is 1.3 times longer", () => {
    expect(preps(exam({ format: "Tự luận", retake: true }))[0].effort).toBe(240); // 180 × 1.3 → 234 → 240
    expect(preps(exam({ format: "Tự luận", retake: false }))[0].effort).toBe(180);
  });
  it("the learned class multiplier of its class scales the prep, clamped to 0.7 to 1.5", () => {
    const base = preps(exam({ format: "Tự luận" }))[0].effort;
    expect(preps(exam({ format: "Tự luận" }), 1, { exam_review: 1.2 })[0].effort).toBeGreaterThan(base);
    expect(preps(exam({ format: "Tự luận" }), 1, { exam_review: 9 })[0].effort).toBe(preps(exam({ format: "Tự luận" }), 1, { exam_review: 1.5 })[0].effort);
    expect(preps(exam({ format: "Báo cáo(TL)" }), 1, { exam_review: 1.2 })[0].effort).toBe(preps(exam({ format: "Báo cáo(TL)" }))[0].effort);
  });
  it("keeps every effort in half hours and names the class and its unpaced length", () => {
    for (const credits of [undefined, 1, 2, 3, 4, 5, 10]) for (const retake of [undefined, true]) for (const mult of [0.75, 1, 1.6]) for (const pace of [0.7, 1.2, 1.5]) {
      const [p] = preps(exam({ format: "Tự luận", credits, retake }), mult, { exam_review: pace });
      expect(p.effort % 30).toBe(0);
      expect(p.guessMin! % 30).toBe(0);
    }
    expect(preps(exam({ format: "Báo cáo(TL)" }))[0]).toMatchObject({ cls: "write_doc" });
    expect(preps(exam({ format: "Tự luận" }))[0]).toMatchObject({ cls: "exam_review" });
  });
});
