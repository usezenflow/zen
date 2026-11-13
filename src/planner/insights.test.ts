import { describe, expect, it } from "vitest";
import { energy } from "./features";
import { insights } from "./insights";
import { update } from "./linucb";
import { newModel } from "./model";

const now = new Date(2026, 10, 16, 8, 0).getTime();

describe("insights", () => {
  it("says nothing when cold", () => {
    const i = insights(newModel(now), now);
    expect(i.golden).toBeUndefined();
    expect(i.pairs).toEqual([]);
    expect(i.guesses).toEqual([]);
  });
  it("finds the golden window after rewards on arms 8-10", () => {
    const m = newModel(now);
    for (let n = 0; n < 20; n++) for (const h of [8, 9, 10]) { const x = new Array(16).fill(0); x[0] = 1; x[14] = energy(h + 0.5, 15); update(m.arms[h], x, 1); }
    const i = insights(m, now);
    expect(i.golden!.from).toBeLessThanOrEqual(9);
    expect(i.golden!.to).toBeGreaterThanOrEqual(11);
    expect(i.weekly).toMatch(/^Bạn/);
  });
  it("learns the best hours for a kind", () => {
    const m = newModel(now);
    for (let n = 0; n < 20; n++) for (const h of [8, 9, 10]) { const x = new Array(16).fill(0); x[0] = 1; x[4] = 1; update(m.arms[h], x, 1); }
    const k = insights(m, now).byKind.find((e) => e.kind === "study")!;
    expect(k.from).toBeGreaterThanOrEqual(7);
    expect(k.from).toBeLessThanOrEqual(8);
    expect(insights(m, now).weekly).toMatch(/hợp nhất lúc/);
  });
  it("reports slip and pairs once learned", () => {
    const m = newModel(now);
    for (let h = 7; h < 23; h++) for (let n = 0; n < 5; n++) { const x = new Array(16).fill(0); x[0] = 1; x[9] = 1; update(m.arms[h], x, 1); }
    m.slip.study = { later: 4, placed: 10 };
    const i = insights(m, now);
    expect(i.pairs[0].before).toBe("study");
    expect(i.slip).toEqual([{ kind: "study", rate: 0.4 }]);
  });
});
