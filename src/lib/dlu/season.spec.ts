import { describe, expect, it } from "vitest";
import { isoWeek, resolveTerm, weeksToTermEnd } from "./season";

describe("season", () => {
  it("resolves the term with a two week lookahead", () => {
    expect(resolveTerm(Date.UTC(2026, 9, 1))).toMatchObject({ academicYear: "2026-2027", semester: "HK01" });
    expect(resolveTerm(Date.UTC(2027, 0, 15))).toMatchObject({ academicYear: "2026-2027", semester: "HK02" });
    expect(resolveTerm(Date.UTC(2027, 2, 1))).toMatchObject({ semester: "HK02" });
  });
  it("numbers ISO weeks and walks to the term end", () => {
    expect(isoWeek("2026-08-17")).toBe(34);
    const now = Date.UTC(2026, 9, 1);
    const weeks = weeksToTermEnd(now, resolveTerm(now));
    expect(weeks[0]).toBe(40);
    expect(weeks.length).toBeGreaterThan(10);
  });
});
