import { describe, expect, it } from "vitest";

import {
  HOLIDAY_TIER,
  holidayKind,
  isLunarHoliday,
  normHoliday,
  type HolidayKind,
} from "./holiday";

describe("holidayKind", () => {
  it.each<[string, HolidayKind]>([
    // Vietnamese, Google and Samsung style titles
    ["Tết Nguyên Đán", "TET"],
    ["Mùng 1 Tết", "TET"],
    ["Mùng 2 Tết", "TET"],
    ["Giao thừa", "TET"],
    ["Nghỉ Tết", "TET"],
    ["Tết Âm lịch", "TET"],
    ["Tết Dương lịch", "NEW_YEAR"],
    ["Tết Trung Thu", "MID_AUTUMN"],
    ["Giỗ Tổ Hùng Vương", "HUNG_KINGS"],
    ["Ngày Quốc tế Lao động", "LABOR"],
    ["Ngày Giải phóng miền Nam", "REUNIFICATION"],
    ["Quốc khánh", "NATIONAL"],
    ["Giáng sinh", "CHRISTMAS"],
    ["Ngày Valentine", "VALENTINE"],
    ["Ngày Phụ nữ Việt Nam", "WOMEN"],
    ["Ngày Nhà giáo Việt Nam", "TEACHER"],
    ["Ngày Gia đình Việt Nam", "FAMILY"],
    // English titles
    ["Vietnamese New Year", "TET"],
    ["Lunar New Year", "TET"],
    ["Chinese New Year", "TET"],
    ["New Year's Day", "NEW_YEAR"],
    ["New Year's Eve", "NEW_YEAR"],
    ["Hung Kings Commemoration Day", "HUNG_KINGS"],
    ["Reunification Day", "REUNIFICATION"],
    ["International Workers' Day", "LABOR"],
    ["Labour Day", "LABOR"],
    ["National Day", "NATIONAL"],
    ["Mid-Autumn Festival", "MID_AUTUMN"],
    ["Christmas Day", "CHRISTMAS"],
    ["Valentine's Day", "VALENTINE"],
    ["International Women's Day", "WOMEN"],
    ["Vietnamese Teachers' Day", "TEACHER"],
    ["Family Day", "FAMILY"],
    // Specific rules win over the generic tet rule
    ["Vietnamese New Year's Eve", "TET"],
    // Negatives
    ["Sinh nhật mẹ", "BIRTHDAY"],
    ["Thôi nôi bé Na", "BIRTHDAY"],
    ["Linh's B-day", "BIRTHDAY"],
    ["Birthday", "BIRTHDAY"],
    ["Mother's Day", "OTHER"],
    ["Tetris night", "OTHER"],
    ["Noelle's party", "OTHER"],
    ["Trip to Đà Lạt", "OTHER"],
  ])("%s is %s", (title, kind) => {
    expect(holidayKind(title)).toBe(kind);
  });
});

describe("isLunarHoliday", () => {
  it.each([
    ["Tết Nguyên Đán", true],
    ["Tết Trung thu", true],
    ["Giỗ Tổ Hùng Vương", true],
    ["Tết Dương lịch", false],
    ["Quốc khánh", false],
    ["Birthday", false],
  ])("%s is lunar: %s", (title, lunar) => {
    expect(isLunarHoliday(title)).toBe(lunar);
  });
});

describe("normHoliday", () => {
  it("strips diacritics, punctuation and case", () => {
    expect(normHoliday("Tết Đ. Dương-lịch!")).toBe("tet d duong lich");
  });
});
