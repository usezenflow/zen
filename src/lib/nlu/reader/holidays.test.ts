// Section 3c2: a holiday name resolves to its date through the shared solar and lunar tables.
import { describe, expect, it } from "vitest";
import { holidayOf, isHolidayDate } from "./holidays";

const ref = { y: 2026, m: 11, d: 5 };
const iso = (w: { y: number; m: number; d: number } | null) =>
  w && `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;

describe("holidays: a name is its date", () => {
  it("resolves solar holidays to the next occurrence", () => {
    expect(iso(holidayOf("noel", ref))).toBe("2026-12-25");
    expect(iso(holidayOf("giáng sinh", ref))).toBe("2026-12-25");
    expect(iso(holidayOf("đêm giáng sinh", ref))).toBe("2026-12-24");
    expect(iso(holidayOf("valentine", ref))).toBe("2027-02-14");
    expect(iso(holidayOf("quốc khánh", ref))).toBe("2027-09-02");
    expect(iso(holidayOf("ngày nhà giáo", ref))).toBe("2026-11-20");
  });

  it("picks the Vietnamese 20/10 over the 8/3 of the same kind", () => {
    expect(iso(holidayOf("phụ nữ Việt Nam", ref))).toBe("2027-10-20");
    expect(iso(holidayOf("quốc tế phụ nữ", ref))).toBe("2027-03-08");
  });

  it("resolves lunar holidays and their offsets", () => {
    expect(iso(holidayOf("tết", ref))).toBe("2027-02-06");
    expect(iso(holidayOf("giao thừa", ref))).toBe("2027-02-05");
    expect(iso(holidayOf("mùng 2 tết", ref))).toBe("2027-02-07");
    expect(iso(holidayOf("trung thu", ref))).toBe("2027-09-15");
    expect(iso(holidayOf("rằm tháng 8", ref))).toBe("2027-09-15");
  });

  it("reads a lunar 15th without a month as the next one", () => {
    const w = holidayOf("rằm", ref);
    expect(w).not.toBeNull();
    const days =
      (Date.UTC(w!.y, w!.m - 1, w!.d) - Date.UTC(ref.y, ref.m - 1, ref.d)) /
      86_400_000;
    expect(days).toBeGreaterThanOrEqual(0);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("dates the holidays the shared set does not name", () => {
    expect(iso(holidayOf("halloween", ref))).toBe("2027-10-31");
    expect(iso(holidayOf("quốc tế thiếu nhi", ref))).toBe("2027-06-01");
    expect(iso(holidayOf("năm mới", ref))).toBe("2027-01-01");
  });

  it("knows a date that is a holiday in the shared calendar", () => {
    expect(isHolidayDate({ y: 2026, m: 11, d: 20 })).toBe(true);
    expect(isHolidayDate({ y: 2026, m: 11, d: 21 })).toBe(false);
    expect(isHolidayDate({ y: 2027, m: 2, d: 6 })).toBe(true);
  });
});

describe("holidays: generated grid, every ref day of a year", () => {
  const NAMES = ["tết", "giao thừa", "mùng 3 tết", "trung thu", "rằm", "rằm tháng giêng", "rằm tháng 7", "mùng 1 tháng giêng", "giỗ tổ", "quốc khánh", "noel", "đêm giáng sinh", "halloween", "valentine", "năm mới", "quốc tế phụ nữ", "phụ nữ việt nam", "ngày nhà giáo", "quốc tế thiếu nhi"];
  const day = (w: { y: number; m: number; d: number }) => Date.UTC(w.y, w.m - 1, w.d) / 86_400_000;
  it("is the next occurrence: on or after ref, within a year (a lunar 15th within a month)", () => {
    const bad: string[] = [];
    for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2027, 1, 28); t += 86_400_000) {
      const d = new Date(t);
      const ref = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
      for (const n of NAMES) {
        const w = holidayOf(n, ref);
        const gap = w ? day(w) - day(ref) : NaN;
        if (!(gap >= 0 && gap <= (n === "rằm" ? 30 : 365))) bad.push(`${iso(ref)} ${n} -> ${iso(w)}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("finds the rằm of lunar month 12 in January", () => {
    expect(iso(holidayOf("rằm", { y: 2027, m: 1, d: 5 }))).toBe("2027-01-22");
  });
});
