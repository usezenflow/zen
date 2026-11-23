import { describe, expect, it } from "vitest";
import { PARTS } from "../lib/parts";
import { boundsOf } from "./bounds";
import type { Model } from "./model";

// learned parts: 12 done ticks per part, spread over the given hours, so every part is learned and its window widens
const seen = (lo: number, hi: number) => Array.from({ length: 12 }, (_, i) => lo + ((hi - lo) * i) / 11);
const model = (partSeen: Record<string, number[]>) => ({ partSeen, active: [] }) as unknown as Model;

describe("learned parts never overlap (bounds)", () => {
  it("two parts that widen into each other keep their default edge", () => {
    const b = boundsOf(model({ sáng: seen(5 * 60, 16 * 60), trưa: seen(9 * 60, 14 * 60) }));
    for (let k = 1; k < b.parts.length; k++) expect(b.parts[k - 1][1]).toBeLessThanOrEqual(b.parts[k][0]);
    expect(b.parts[0][1]).toBe(PARTS[0][1]);
    expect(b.parts[1][0]).toBe(PARTS[1][0]);
  });

  it("a part is only ever widened, never narrowed", () => {
    const b = boundsOf(model({ tối: seen(16 * 60 + 30, 23 * 60) }));
    for (let k = 0; k < PARTS.length; k++) {
      expect(b.parts[k][0]).toBeLessThanOrEqual(PARTS[k][0]);
      expect(b.parts[k][1]).toBeGreaterThanOrEqual(PARTS[k][1]);
    }
  });
});
