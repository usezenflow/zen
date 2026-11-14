import { describe, expect, it } from "vitest";
import { energy } from "./features";
import { insights } from "./insights";
import { update } from "./linucb";
import { newModel, plan } from "./index";

const now = new Date(2026, 10, 16, 8, 0).getTime();

describe("insights", () => {
  it("says nothing when cold", () => {
    const i = insights(newModel(now), now);
    expect(i.golden).toBeUndefined();
    expect(i.pairs).toEqual([]);
    expect(i.guesses).toEqual([]);
    expect(i.weekly).toBeUndefined();
  });
  it("stays silent on a model with no outcomes after 6 mornings of planning", () => {
    let m = newModel(now);
    for (let d = 0; d < 6; d++) { const t = now + d * 86400000; m = plan([], [], m, t).model; }
    const i = insights(m, now + 6 * 86400000);
    expect(i.golden).toBeUndefined();
    expect(i.guesses).toEqual([]);
    expect(i.weekly).toBeUndefined();
  });
  it("does not name a golden range from a few outcomes", () => {
    const m = newModel(now);
    for (let n = 0; n < 5; n++) for (const h of [8, 9, 10]) { const x = new Array(16).fill(0); x[0] = 1; x[14] = energy(h + 0.5, 15); update(m.arms[h], x, 1); }
    const i = insights(m, now);
    expect(i.golden).toBeUndefined();
    expect(i.weekly).toBeUndefined();
  });
  it("finds the golden window after rewards on arms 8-10", () => {
    const m = newModel(now);
    for (let n = 0; n < 60; n++) for (const h of [8, 9, 10]) { const x = new Array(16).fill(0); x[0] = 1; x[14] = energy(h + 0.5, 15); update(m.arms[h], x, 1); }
    const i = insights(m, now);
    expect(i.golden!.from).toBeLessThanOrEqual(9);
    expect(i.golden!.to).toBeGreaterThanOrEqual(11);
    expect(i.weekly).toMatch(/^Bạn/);
  });
  it("learns the best hours for a kind", () => {
    const m = newModel(now);
    for (let n = 0; n < 60; n++) for (const h of [8, 9, 10]) { const x = new Array(16).fill(0); x[0] = 1; x[4] = 1; update(m.arms[h], x, 1); }
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

describe("insights from moves", () => {
  it("names a guessed golden range after a few drags to the morning", async () => {
    const { learn } = await import("./policy");
    let m = newModel(now);
    const task = { id: "a", kind: "study", title: "x", source: "user", effort: 30, createdAt: 0 } as Parameters<typeof learn>[2];
    const x = new Array(16).fill(0); x[0] = 1; x[4] = 1;
    for (let k = 0; k < 6; k++) {
      m.placed.a = { start: now + 6 * 3600e3, arm: 14, x, policy: "linucb" } as (typeof m.placed)[string];
      m = learn(m, { id: `e${k}`, taskId: "a", type: "drag", at: now, data: { fromStart: now + 6 * 3600e3, toStart: now + 3600e3 } }, task);
    }
    const g = insights(m, now).golden!;
    expect(g.from).toBeLessThanOrEqual(9);
    expect(g.to).toBeGreaterThan(9);
    expect(g.sure!).toBeLessThan(0.75);
  });
});
