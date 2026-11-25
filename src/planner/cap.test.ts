import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { capOf } from "../lib/rest";
import { HOUR, dayStart } from "./features";
import { plan } from "./index";
import { newModel } from "./model";
import { type Env, solve } from "./place";
import type { Piece } from "./value";

// 31 Dec 2026: 1 Jan 2027 is Tết Dương lịch (a holiday); 2 Jan is an ordinary day.
const now = new Date(2026, 11, 31, 8, 0).getTime();
const day = (d: number, h = 0) => new Date(2027, 0, d, h, 0).getTime();
const task = (id: string, o: Partial<Task> = {}): Task =>
  ({ id, title: id, kind: "other", source: "user", effort: 60, createdAt: now, deadline: day(3, 23), ...o });
// Five 1 h tasks that may go on 1 or 2 January only.
const flex = () => ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => task(id, { notBefore: day(1, 7), deadline: day(2, 22) }));
// Placements on a day, counted per task: the planner's own answer for that day.
const onDay = (tasks: Task[], d: number) =>
  plan(tasks, [], newModel(now), now).diff.placed.filter((p) => p.id !== "exam" && dayStart(p.start) === dayStart(d)).length;

describe("day cap in the planner", () => {
  it("a cold day is capped at 6 h", () => {
    expect(capOf([], day(2), now).ms).toBe(6 * HOUR);
  });

  it("a holiday takes fewer flexible tasks than an ordinary day", () => {
    expect(onDay(flex(), day(1))).toBeLessThan(onDay(flex(), day(2)));
  });

  it("the day before an exam is capped at 4.5 h (x 0.75)", () => {
    const exam = task("exam", { fixed: "exam", kind: "study", start: day(3, 9), end: day(3, 11), effort: 120 });
    expect(capOf([exam], day(2), now).ms).toBe(4.5 * HOUR);
  });

  it("a lower cap on a day keeps the solver from loading it", () => {
    const ps = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, task: task(`p${i}`, { notBefore: day(1, 7), deadline: day(2, 22) }), effort: 60, k: 1, n: 1, slip: 0 }) as Piece);
    const env: Env = { busy: [], fixedEnds: [], now, util: () => 0 };
    const on1 = (cap?: Env["cap"]) => [...solve(ps, { ...env, cap }, 3).starts.values()].filter((s) => s >= 0 && dayStart(s) === day(1)).length;
    expect(on1((d) => (dayStart(d) === day(1) ? 3 : 6))).toBeLessThan(on1());
  });

  it("a cold cap gives the same placements as no cap at all", () => {
    const ps: Piece[] = ["x", "y", "z"].map((id, i) => ({ id, task: task(id, { deadline: day(2, 20) }), effort: 60, k: 1, n: 1, slip: 0 }) as Piece);
    const env: Env = { busy: [{ start: day(1, 9), end: day(1, 12) }], fixedEnds: [], now, util: (p, s) => -Math.abs(new Date(s).getHours() - 10) * 0.1 + p.id.length * 0.001 };
    const a = solve(ps, env, 5), b = solve(ps, { ...env, cap: () => 6 }, 5);
    expect([...b.starts]).toEqual([...a.starts]);
  });

  it("on the eve of an exam, prep is exempt from the cap and other work is not", () => {
    // Six 1 h prep sittings, a 2 h cap on 11 Jan (the eve), and a flat utility so only the load hinge decides.
    const eve = day(11);
    const ps = Array.from({ length: 6 }, (_, i) => ({ id: `prep:exam#${i + 1}`, task: task(`prep:exam#${i + 1}`, { forId: "exam", notBefore: day(10, 7), deadline: day(12, 22) }), effort: 60, k: 1, n: 1, slip: 0 }) as Piece);
    const env: Env = { busy: [], fixedEnds: [], now, util: () => 0 };
    const cap: Env["cap"] = (d) => (dayStart(d) === eve ? 2 : 6);
    const onEve = (e: Env) => [...solve(ps, e, 3).starts.values()].filter((s) => s >= 0 && dayStart(s) === eve).length;
    expect(onEve({ ...env, cap, exempt: (p) => p.task.forId !== undefined })).toBeGreaterThan(onEve({ ...env, cap }));
  });

  // Guard: a dated task never goes past its deadline because of load. The day is full of lectures (7 h, over the cap).
  it("a task due tonight lands tonight on a day already over its cap", () => {
    const lec = [task("l1", { fixed: "lecture", kind: "study", start: day(9, 8), end: day(9, 14), effort: 360 }), task("l2", { fixed: "lecture", kind: "study", start: day(9, 14), end: day(9, 21), effort: 420 })];
    const due = task("due", { deadline: day(9, 23), effort: 60 });
    const placed = plan([...lec, due], [], newModel(now), day(9, 7)).diff.placed.find((p) => p.id === "due")!;
    expect(placed).toBeDefined();
    expect(dayStart(placed.start)).toBe(day(9));
    expect(placed.end).toBeLessThanOrEqual(day(9, 23));
  });

  // Guard: a lecture day with 5 h of lectures and a 6 h cap still takes 1 h of own work.
  it("a DLU day with 5 h of lectures still takes 1 h of own work", () => {
    const lec = task("lec", { fixed: "lecture", kind: "study", start: day(11, 8), end: day(11, 13), effort: 300 });
    const own = task("own", { notBefore: day(11, 7), deadline: day(11, 22), effort: 60 });
    const n = day(8, 8); // within the 7-day horizon of the day in question
    const placed = plan([lec, own], [], newModel(n), n).diff.placed.filter((p) => p.id === "own");
    expect(placed.length).toBe(1);
    expect(dayStart(placed[0].start)).toBe(day(11));
  });
});
