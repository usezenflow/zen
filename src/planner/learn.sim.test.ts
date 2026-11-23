import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { MIN, hourOf } from "./features";
import { learn, newModel, plan } from "./index";

// Real plan() and learn(): what the user's drags teach where new tasks land.
const now = new Date(2026, 10, 16, 8, 0).getTime(); // Monday 08:00
const hm = (d: number, h: number, m = 0) => new Date(2026, 10, 16 + d, h, m).getTime();
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "other", source: "user", effort: 60, createdAt: now, ...o });
const drag = (m: ReturnType<typeof newModel>, id: string, kind: Kind, from: number, to: number) =>
  learn(m, { id: `e${id}`, taskId: id, type: "drag", at: now, data: { fromStart: from, toStart: to } }, task(id, { kind, start: from, end: from + 90 * MIN }));
const EARLY = (s: number) => hourOf(s) >= 7 && hourOf(s) < 8.5; // 07:00 to 08:30

describe("a drag away from 07:30 teaches the planner off that hour", () => {
  it("one drag of a study task 07:30 to 09:00: a new chores, exercise or self task the next day does not start 07:00 to 08:30", () => {
    const m = drag(newModel(now), "s1", "study", hm(0, 7, 30), hm(0, 9));
    for (const kind of ["chores", "exercise", "self"] as Kind[]) {
      const { diff } = plan([task("n", { kind, notBefore: hm(1, 0) })], [], m, now);
      expect(diff.placed).toHaveLength(1);
      expect(EARLY(diff.placed[0].start)).toBe(false);
    }
  });

  // Part-level learning (linucb prepare): the morning as a whole is marked down, so a 07:00 start can still be the least bad of 20 slots.
  it("after 3 such drags, 20 new tasks of mixed kinds over six days: at most one starts 07:00 to 08:30", () => {
    const kinds: Kind[] = ["study", "exercise", "chores", "social", "other", "work", "errand", "finance", "self"];
    let m = newModel(now);
    for (const i of [1, 2, 3]) m = drag(m, `s${i}`, "study", hm(0, 7, 30), hm(0, 9));
    const ts = Array.from({ length: 20 }, (_, i) => task(`n${i}`, { kind: kinds[i % kinds.length], notBefore: hm(1 + (i % 6), 0) }));
    const { diff } = plan(ts, [], m, now);
    expect(diff.placed).toHaveLength(20);
    expect(diff.placed.filter((p) => EARLY(p.start)).length).toBeLessThanOrEqual(1);
  });

  it("mirror: three drags TO 07:00 make a new task of that kind land 06:30 to 08:00 the next day", () => {
    let m = newModel(now);
    for (const i of [1, 2, 3]) m = drag(m, `c${i}`, "chores", hm(0, 14), hm(0, 7));
    const { diff } = plan([task("n", { kind: "chores", notBefore: hm(1, 0) })], [], m, now);
    expect(diff.placed).toHaveLength(1);
    const s = hourOf(diff.placed[0].start);
    expect(s >= 6.5 && s <= 8).toBe(true);
  });
});
