import { describe, expect, it } from "vitest";
import { energy } from "./features";
import { insights } from "./insights";
import { update } from "./linucb";
import { newModel, plan } from "./index";

const now = new Date(2026, 10, 16, 8, 0).getTime();

describe("insights", () => {
  it("counts what it has seen, and after three names the hours you finished or dragged work to", () => {
    const m = newModel(now), at = (h: number) => new Date(2026, 10, 15, h, 20).getTime();
    expect(insights(m, now).seen).toBe(0); expect(insights(m, now).early).toBeUndefined();
    m.doneHours.push({ hour: 20.3, at: at(20) });
    m.hist.push({ vec: [], hour: 9, r: -1, at: at(9) }); // moved away from 9h: seen, not a good hour
    expect(insights(m, now).seen).toBe(2); expect(insights(m, now).early).toBeUndefined();
    m.placed.x = { arm: 21, x: [], start: at(21), at: at(8), moved: true }; // dragged to 21h
    m.doneHours.push({ hour: 21.5, at: at(21) });
    const i = insights(m, now);
    expect(i).toMatchObject({ seen: 3, early: { from: 20, to: 22, n: 3 } });
    expect(i.guesses).toContainEqual({ text: "Bạn hay làm việc lúc 20h-22h", sure: 0.3 });
    // two weeks old says nothing; scattered hours name no range
    expect(insights(m, now + 20 * 86400000).seen).toBe(0); expect(insights(m, now + 20 * 86400000).early).toBeUndefined();
    const s = newModel(now);
    for (const h of [7, 12, 18]) s.doneHours.push({ hour: h, at: at(h) });
    expect(insights(s, now).seen).toBe(3); expect(insights(s, now).early).toBeUndefined();
  });
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
