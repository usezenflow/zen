import { describe, expect, it } from "vitest";
import { lunarHolidayDates, lunarToSolar, solarToLunar } from "./lunar";

describe("lunar calendar", () => {
  it.each([
    [1985, "1985-01-21"], // a month before the Chinese new year that year
    [2007, "2007-02-17"], // a day before the Chinese new year
    [2023, "2023-01-22"],
    [2024, "2024-02-10"],
    [2025, "2025-01-29"],
    [2026, "2026-02-17"],
    [2027, "2027-02-06"],
  ])("Tết %i falls on %s", (year, date) => {
    expect(lunarToSolar({ year, month: 1, day: 1, leap: false })).toBe(date);
    expect(solarToLunar(date)).toEqual({ year, month: 1, day: 1, leap: false });
  });

  it("finds the lunar holidays of a year", () => {
    expect(lunarHolidayDates(2025)).toEqual([
      { kind: "TET", date: "2025-01-29" },
      { kind: "HUNG_KINGS", date: "2025-04-07" },
      { kind: "MID_AUTUMN", date: "2025-10-06" },
    ]);
    expect(lunarHolidayDates(2026).map((h) => h.date)).toEqual(["2026-02-17", "2026-04-26", "2026-09-25"]);
  });

  it("handles leap months", () => {
    expect(solarToLunar("2023-03-22")).toEqual({ year: 2023, month: 2, day: 1, leap: true });
    expect(lunarToSolar({ year: 2023, month: 2, day: 1, leap: true })).toBe("2023-03-22");
    expect(solarToLunar("2025-07-25")).toEqual({ year: 2025, month: 6, day: 1, leap: true });
    expect(lunarToSolar({ year: 2024, month: 6, day: 1, leap: true })).toBeNull();
  });

  it("round trips every day of 2020 to 2030", () => {
    for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2031, 0, 1); t += 86_400_000) {
      const date = new Date(t).toISOString().slice(0, 10);
      expect(lunarToSolar(solarToLunar(date))).toBe(date);
    }
  });
});
