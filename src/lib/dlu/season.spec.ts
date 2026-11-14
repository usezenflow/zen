import { describe, expect, it } from "vitest";
import { examMonth, feeMonth, isoWeek, marksOpen, resolveTerm, termMondays, termNow } from "./season";

describe("season", () => {
  it("resolves the term with a two week lookahead", () => {
    expect(resolveTerm(Date.UTC(2026, 9, 1))).toMatchObject({ academicYear: "2026-2027", semester: "HK01" });
    expect(resolveTerm(Date.UTC(2027, 0, 15))).toMatchObject({ academicYear: "2026-2027", semester: "HK02" });
    expect(resolveTerm(Date.UTC(2027, 2, 1))).toMatchObject({ semester: "HK02" });
  });
  it("numbers ISO weeks and walks to the term end", () => {
    expect(isoWeek("2026-08-17")).toBe(34);
    const now = Date.UTC(2026, 9, 1);
    const weeks = termMondays(now, resolveTerm(now)).map(isoWeek);
    expect(weeks[0]).toBe(40);
    expect(weeks.length).toBeGreaterThan(10);
  });
  it("keeps exams and marks to their seasons", () => {
    expect([1, 2, 3, 5, 6, 8, 9, 10, 12].map((m) => examMonth(Date.UTC(2026, m - 1, 15)))).toEqual([false, false, true, false, true, false, false, true, false]);
    expect(termNow(Date.UTC(2027, 6, 20))).toMatchObject({ semester: "HK03" }); // resolveTerm already looks at next year's HK01
    const exam = Date.UTC(2026, 10, 20); // HK1 exam, 20/11
    const D = 86_400_000;
    expect([exam + 6 * D, exam + 8 * D, Date.UTC(2027, 0, 31), Date.UTC(2027, 1, 2)].map((n) => marksOpen(n, [exam]))).toEqual([false, true, true, false]);
    expect(marksOpen(Date.UTC(2027, 5, 29), [Date.UTC(2027, 3, 10)])).toBe(true); // HK2 exam, open to end of Jun
    expect(marksOpen(Date.UTC(2027, 6, 2), [Date.UTC(2027, 3, 10)])).toBe(false);
    expect(marksOpen(Date.UTC(2027, 6, 30), [Date.UTC(2027, 5, 20)])).toBe(true); // HK3, open to end of Jul
  });
  it("checks fees from noon on the 15th of Oct, Mar and Jun", () => {
    const vn = (m: number, d: number, h: number) => Date.UTC(2026, m - 1, d, h - 7);
    expect([vn(10, 15, 11), vn(10, 15, 12), vn(10, 31, 23), vn(11, 1, 0), vn(3, 20, 9), vn(6, 16, 8), vn(9, 20, 12)].map(feeMonth))
      .toEqual([null, "2026-10", "2026-10", null, "2026-03", "2026-06", null]);
  });
});
