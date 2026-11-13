import { expect, it } from "vitest";
import { cosine } from "../../planner/habits";
import { titleVec } from "./vec";

it("puts repeated and near-spelled titles close, unrelated ones apart", () => {
  const a = titleVec("Ôn Giải tích");
  expect(cosine(a, titleVec("ôn giai tich 2"))).toBeGreaterThan(0.75);
  expect(cosine(a, titleVec("Tập gym"))).toBeLessThan(0.3);
  expect(cosine(a, a)).toBeCloseTo(1);
  expect(Math.hypot(...titleVec(""))).toBe(0);
});
