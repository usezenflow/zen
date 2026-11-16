import { expect, it } from "vitest";
import { cos, embed } from "./embed";

it("puts a phrase near its meaning, across accents and spellings", () => {
  expect(cos(embed("tập gym"), embed("tập thể dục"))).toBeGreaterThan(cos(embed("tập gym"), embed("đóng tiền điện")));
  expect(cos(embed("code b-tree"), embed("lập trình cây b"))).toBeGreaterThan(cos(embed("code b-tree"), embed("đi chợ")));
  expect(cos(embed("giai tich"), embed("giải tích"))).toBeGreaterThan(0.95);
});

it("is unit length, and zero for a title with no letters", () => {
  expect(Math.hypot(...embed("nộp thuế TNCN"))).toBeCloseTo(1, 5);
  expect(Math.hypot(...embed("12 / 3"))).toBe(0);
});
