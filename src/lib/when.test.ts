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
