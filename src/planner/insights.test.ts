import { describe, expect, it } from "vitest";
import { D, I_AFTER, I_ENERGY, energy } from "./features";
import { grounded } from "./grounded";
import { insights } from "./insights";
import { update } from "./linucb";
import { learn, newModel, plan } from "./index";

const now = new Date(2026, 10, 16, 8, 0).getTime();

describe("insights", () => {
  it("counts what it has seen, and after three names the stretch you finished or dragged work to, as a guess", () => {
    const m = newModel(now), at = (h: number) => new Date(2026, 10, 15, h, 20).getTime();
    expect(insights(m, now).seen).toBe(0); expect(insights(m, now).early).toBeUndefined();
    m.doneHours.push({ hour: 20.3, at: at(20) });
    m.hist.push({ vec: [], hour: 9, r: -1, at: at(9) }); // moved away from 9h: seen, not a good hour
    expect(insights(m, now).seen).toBe(2); expect(insights(m, now).early).toBeUndefined();
    m.moved!.push({ hour: 21.3, at: at(21) }); // dragged to 21h
    m.doneHours.push({ hour: 21.5, at: at(21) });
    const i = insights(m, now);
    expect(i).toMatchObject({ seen: 3, early: { from: 20, to: 22, n: 3 } }); // three name the stretch, as a guess; the range itself waits for five
    expect(i.golden).toBeUndefined();
    const two = newModel(now); two.doneHours.push({ hour: 20.3, at: at(20) }, { hour: 21.5, at: at(21) });
    expect(insights(two, now).early).toBeUndefined(); // two things are not a habit
    two.doneHours.push({ hour: 20.6, at: at(20) });
    expect(insights(two, now).early).toMatchObject({ from: 20, to: 22 }); // the data holds; the words are the rhythm's to say
    // two weeks old says nothing; scattered hours name no range
    expect(insights(m, now + 20 * 86400000).seen).toBe(0); expect(insights(m, now + 20 * 86400000).early).toBeUndefined();
    const s = newModel(now);
    for (const h of [7, 12, 18]) s.doneHours.push({ hour: h, at: at(h) });
    expect(insights(s, now).seen).toBe(3); expect(insights(s, now).early).toBeUndefined();
  });
  it("names the golden range from five ticks in one stretch, and planner misses are not moves you made", () => {
    const m = newModel(now), at = (d: number, h: number) => new Date(2026, 10, 15 - d, h, 20).getTime();
    for (let d = 0; d < 5; d++) m.doneHours.push({ hour: 20.4 + (d % 2), at: at(d, 20) });
    m.doneHours.push({ hour: 9.2, at: at(1, 9) });
    for (let n = 0; n < 50; n++) m.hist.push({ vec: [], hour: 10, r: -1, at: at(0, 10), miss: true });
    const i = insights(m, now);
    expect(i.seen).toBe(6);
    expect(i.golden).toMatchObject({ from: 20, to: 22 });
    expect(i.golden!.sure).toBeGreaterThan(0.4);
    expect(i.early).toBeUndefined();
    for (let d = 5; d < 13; d++) m.doneHours.push({ hour: 21, at: at(d % 13, 21) });
    expect(insights(m, now).golden!.sure).toBeGreaterThanOrEqual(0.55); // week-old evidence counts for less
  });
  it("says nothing when cold", () => {
    const i = insights(newModel(now), now);
    expect(i.golden).toBeUndefined();
    expect(i.pairs).toEqual([]);
    expect(i.learned).toEqual([]);
  });
  it("stays silent on a model with no outcomes after 6 mornings of planning", () => {
    let m = newModel(now);
    for (let d = 0; d < 6; d++) { const t = now + d * 86400000; m = plan([], [], m, t).model; }
    const i = insights(m, now + 6 * 86400000);
    expect(i.golden).toBeUndefined();
    expect(i.learned).toEqual([]);
  });
  it("does not name a golden range from a few outcomes", () => {
    const m = newModel(now);
    for (let n = 0; n < 5; n++) for (const h of [8, 9, 10]) { const x = new Array(D).fill(0); x[0] = 1; x[I_ENERGY] = energy(h + 0.5, 15); update(m.arms[h], x, 1); }
    const i = insights(m, now);
    expect(i.golden).toBeUndefined();
    expect(i.learned).toEqual([]);
  });
  it("finds the golden window after rewards on arms 8-10", () => {
    const m = newModel(now);
    for (let n = 0; n < 60; n++) for (const h of [8, 9, 10]) { const x = new Array(D).fill(0); x[0] = 1; x[I_ENERGY] = energy(h + 0.5, 15); update(m.arms[h], x, 1); }
    const i = insights(m, now);
    expect(i.golden!.from).toBeLessThanOrEqual(9);
    expect(i.golden!.to).toBeGreaterThanOrEqual(11);
  });
  it("learns the best hours for a kind", () => {
    const m = newModel(now);
    for (let n = 0; n < 60; n++) for (const h of [8, 9, 10]) { const x = new Array(D).fill(0); x[0] = 1; x[4] = 1; update(m.arms[h], x, 1); }
    const k = insights(m, now).byKind.find((e) => e.kind === "study")!;
    expect(k.from).toBeGreaterThanOrEqual(7);
    expect(k.from).toBeLessThanOrEqual(8);
    expect(insights(m, now).learned).toContainEqual(expect.objectContaining({ text: "Việc học hợp buổi sáng" })); // a part, never a weekday
  });
  it("reports slip and pairs once learned", () => {
    const m = newModel(now);
    for (let h = 7; h < 23; h++) for (let n = 0; n < 5; n++) { const x = new Array(D).fill(0); x[0] = 1; x[I_AFTER] = 1; update(m.arms[h], x, 1); }
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
    const x = new Array(D).fill(0); x[0] = 1; x[4] = 1;
    for (let k = 0; k < 6; k++) {
      m.placed.a = { start: now + 6 * 3600e3, arm: 14, x, policy: "linucb" } as (typeof m.placed)[string];
      m = learn(m, { id: `e${k}`, taskId: "a", type: "drag", at: now, data: { fromStart: now + 6 * 3600e3, toStart: now + 3600e3 } }, task);
    }
    const g = insights(m, now).golden!;
    expect(g.from).toBeLessThanOrEqual(9);
    expect(g.to).toBeGreaterThan(9);
    expect(g.sure!).toBeLessThan(0.75);
  });
  it("drags of tasks the planner never placed (pinned, user-timed) still move the rhythm", () => {
    const m0 = newModel(now), at = (h: number) => new Date(2026, 10, 15, h, 20).getTime();
    for (const h of [8, 8, 9]) m0.doneHours.push({ hour: h + 0.3, at: at(h) });
    let m = m0;
    for (let n = 0; n < 6; n++) {
      const task = { id: `u${n}`, title: "x", kind: "work" as const, source: "user" as const, effort: 60, createdAt: now, start: at(9), end: at(10), pinned: true };
      m = learn(m, { id: `e${n}`, taskId: task.id, type: "drag", at: now, data: { fromStart: at(9), toStart: at(15) } } as never, task);
    }
    const i = insights(m, now);
    expect(i.golden ?? i.early).toMatchObject({ from: 14, to: 16 });
    // what you did today outweighs older mornings: three drags flip a settled morning range
    const old = newModel(now);
    for (let d = 0; d < 5; d++) old.doneHours.push({ hour: 8.4, at: new Date(2026, 10, 15 - d, 8, 20).getTime() });
    expect(insights(old, now).golden ?? insights(old, now).early).toMatchObject({ to: 9 });
    for (let n = 0; n < 4; n++) old.moved!.push({ hour: 15.3, at: now - n * 3600_000 });
    expect(insights(old, now).golden ?? insights(old, now).early).toMatchObject({ from: 14 });
  
  });
});

describe("keep share for the Sunday line", () => {
  const DAY_MS = 86400000;
  // r > 0 is a tick on time; a later, a drag, a delete or a miss is r < 0. Written on a cold model too (it returns early).
  const week = (m: ReturnType<typeof newModel>, days: number, ticks: number, fromDay: number) => {
    for (let i = 0; i < days; i++) m.hist.push({ vec: [], hour: 9, r: i < ticks ? 1 : -1, at: now - fromDay * DAY_MS - (i + 1) * 60_000 });
  };
  it("shows this week's share and the change from last week, with 10 placements each side", () => {
    const m = newModel(now);
    week(m, 10, 9, 1); // this week: 9 of 10 kept (90%)
    week(m, 10, 8, 8); // last week: 8 of 10 (80%)
    expect(insights(m, now).keep).toEqual({ pct: 90, delta: 10 });
  });
  it("shows a drop as a negative change", () => {
    const m = newModel(now);
    week(m, 10, 7, 1); // 70%
    week(m, 10, 8, 8); // 80%
    expect(insights(m, now).keep).toEqual({ pct: 70, delta: -10 });
  });
  it("counts a placement left where Zen put it as kept, though it never reached hist", () => {
    const m = newModel(now);
    week(m, 4, 2, 1); // this week: 2 ticks on time, 2 moved...
    m.kept = Array.from({ length: 6 }, (_, i) => now - DAY_MS - i * 60_000); // ...and 6 silent keeps: 8 of 10
    week(m, 10, 6, 8); // last week: 60%
    expect(insights(m, now).keep).toEqual({ pct: 80, delta: 20 });
  });
  it("stays silent under 10 placements this week, under a 5-point change, or with no last week", () => {
    const few = newModel(now); week(few, 9, 9, 1); week(few, 10, 2, 8);
    expect(insights(few, now).keep).toBeUndefined();
    const flat = newModel(now); week(flat, 10, 9, 1); week(flat, 19, 17, 8); // 90% against 89%
    expect(insights(flat, now).keep).toBeUndefined();
    const none = newModel(now); week(none, 10, 9, 1);
    expect(insights(none, now).keep).toBeUndefined();
  });
});

describe("the week, as a person says it", () => {
  const sun = new Date(2026, 10, 15, 12).getTime(); // a Sunday
  const mk = (days: number[], hour: number) => {
    const m = newModel(sun);
    for (const d of days) { const at = new Date(2026, 10, 15 - d, hour, 20).getTime(); m.doneHours.push({ hour: hour + 0.3, at, wd: new Date(at).getDay() }); }
    return m;
  };
  it("names the part and the days that are yours, only with several things on several days", () => {
    expect(insights(mk([0, 1, 2], 9), sun).when).toBeUndefined(); // three is not enough
    expect(insights(mk([6, 6, 6, 6], 9), sun).when).toBeUndefined(); // four on one day is one day
    const w = insights(mk([6, 5, 4, 3, 2], 9), sun).when!; // Mon..Fri mornings (15 Nov is a Sunday)
    expect(w).toMatchObject({ part: 0, wds: [1, 2, 3, 4, 5] });
    expect(insights(mk([1, 8, 15, 22], 20), sun).when).toMatchObject({ part: 3, wds: [6] }); // four Saturday evenings
  });
  it("grid is weekday by part, 0..1, and one odd day does not outweigh a habit", () => {
    const m = mk([6, 5, 4, 3, 2], 9);
    m.doneHours.push({ hour: 20.3, at: sun - 3600_000, wd: 0 }); // one late-night Sunday
    const i = insights(m, sun);
    expect(i.grid).toHaveLength(7);
    expect(Math.max(...i.grid.flat())).toBe(1);
    expect(i.when).toMatchObject({ part: 0 });
  });
  it("a drag to another day and part moves a reason's claim: stale ones are dropped", () => {
    const r = { key: "hour" as const, w: 1, vars: { hour: 9, n: 4, pn: "sáng", dt: "ngày thường" } };
    const at = (h: number, d: number) => new Date(2026, 10, d, h).getTime(); // 16 Nov is a Monday, 21 a Saturday
    const f = (start: number) => ({ task: { id: "a", title: "x", kind: "study", source: "user", effort: 30, createdAt: 0 } as never, start, rules: [] });
    expect(grounded([r], f(at(10, 16)))).toHaveLength(1);
    expect(grounded([r], f(at(15, 16)))).toHaveLength(0); // afternoon
    expect(grounded([r], f(at(10, 21)))).toHaveLength(0); // weekend
  });
});
