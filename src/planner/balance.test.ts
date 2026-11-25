import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { dayStart } from "./features";
import { plan } from "./index";
import { newModel } from "./model";

// Monday 16 Nov 2026, 08:00: a week with no work yet.
const now = new Date(2026, 10, 16, 8, 0).getTime();
const day = (d: number, h = 0) => new Date(2026, 10, 16 + d, h, 0).getTime();
const task = (id: string, o: Partial<Task> = {}): Task =>
  ({ id, title: id, kind: "other", source: "user", effort: 60, createdAt: now, ...o });
// The flexible tasks the planner placed (fixed blocks such as lectures are not counted).
const placed = (tasks: Task[]) => plan(tasks, [], newModel(now), now).diff.placed.filter((p) => tasks.some((t) => t.id === p.id && !t.fixed));

describe("day leveling", () => {
  it("one task in an open week lands today", () => {
    const [p] = placed([task("solo")]);
    expect(p).toBeDefined();
    expect(dayStart(p.start)).toBe(dayStart(now));
  });

  it("four one-hour tasks spread across days, none piling on one", () => {
    const ts = ["a", "b", "c", "d"].map((id) => task(id));
    const ps = placed(ts);
    expect(ps.length).toBe(4);
    const perDay = new Map<number, number>();
    for (const p of ps) perDay.set(dayStart(p.start), (perDay.get(dayStart(p.start)) ?? 0) + 1);
    expect(perDay.size).toBeGreaterThanOrEqual(2);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
  });

  it("a task skips a heavy lecture day (over its cap at half-hour lectures) for a light one", () => {
    // Tuesday: 14 h of lectures, i.e. 7 h of load at half, over the 6 h cap.
    const heavy = [
      task("l1", { fixed: "lecture", kind: "study", start: day(1, 8), end: day(1, 15), effort: 420 }),
      task("l2", { fixed: "lecture", kind: "study", start: day(1, 15), end: day(1, 22), effort: 420 }),
    ];
    const ps = placed([...heavy, task("own", { notBefore: day(1, 7), deadline: day(3, 22) })]);
    expect(ps.length).toBe(1);
    expect(dayStart(ps[0].start)).not.toBe(dayStart(day(1)));
  });
});
