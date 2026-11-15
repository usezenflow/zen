import { expect, it } from "vitest";
import { day, dayLabel, when } from "./when";

const vn = (d: number, h = 0, m = 0, mo = 10) => Date.UTC(2026, mo, d, h - 7, m); // Vietnam wall clock
const FRI = vn(13, 9); // Fri 13 Nov 2026

it("same ISO week drops the date", () => {
  expect(when(vn(13, 14), FRI)).toBe("Hôm nay 14:00");
  expect(day(vn(13, 0), FRI)).toBe("Hôm nay");
  expect(when(vn(12, 14), FRI)).toBe("T5 14:00");
  expect(day(vn(9, 8), FRI)).toBe("T2"); // Monday of this week
  expect(day(vn(15, 23, 30), FRI)).toBe("CN"); // Sunday 23:30 is still this week
});
it("another week adds the date, the week turns on Monday 00:00 +07", () => {
  expect(when(vn(21, 14), FRI)).toBe("T7 21/11 14:00");
  expect(day(vn(16, 0, 30), FRI)).toBe("T2 16/11");
  expect(day(vn(8, 23, 59), FRI)).toBe("CN 8/11");
});
it("dayLabel always shows the date", () => {
  expect(dayLabel(vn(13, 9))).toBe("T6, 13/11");
  expect(dayLabel(vn(15, 12))).toBe("CN, 15/11");
});

import { endAt } from "./when";
const L = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime(); // device-local wall clock
const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);
it("endAt: an end before the start runs past midnight, and turning it back brings it back", () => {
  expect(endAt(L(17, 23), L(17, 23, 30), at(0))).toBe(L(18, 0)); // 23:00 → 00:00 next day
  expect(endAt(L(17, 23), L(18, 0), at(23, 45))).toBe(L(17, 23, 45)); // back the same day
  expect(endAt(L(17, 9), L(17, 10), at(8))).toBe(L(18, 8)); // before the start: next morning, never negative
  expect(endAt(L(17, 9), L(17, 10), at(9))).toBe(L(18, 9)); // equal to the start: a full day, not zero
});
it("endAt: an end days later keeps its day", () => {
  expect(endAt(L(20, 18), L(22, 12), at(14))).toBe(L(22, 14));
  expect(endAt(L(20, 18), L(22, 12), at(6))).toBe(L(22, 6));
});
