import { describe, expect, it } from "vitest";
import type { Kind, Task, TaskEvent } from "../lib/types";
import { dayStart } from "./features";
import { DEFAULT_BOUNDS, boundsOf } from "./bounds";
import { learn, newModel, plan, type Model } from "./index";
import { awake } from "./place";
import type { Piece } from "./value";

// Tue 17/11/2026, local time as the other planner grids build it.
const at = (h: number, m = 0, d = 0) => new Date(2026, 10, 17 + d, h, m).getTime();
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study" as Kind, source: "user", effort: 60, createdAt: at(8), ...o });
const tick = (m: Model, t: Task, when: number): Model => learn(m, { id: `d${when}`, taskId: t.id, type: "done", at: when, data: {} } as TaskEvent, t);
const kept = (m: Model, when: number): Model => learn(m, { id: `k${when}`, taskId: "k", type: "kept", at: when, data: {} } as TaskEvent, task("k"));
// a piece just for awake(): only its task's tods, its effort and `over` are read
const piece = (effort: number, tods?: [number, number][]) => ({ id: "x", task: task("x", { tods }), effort, over: false }) as unknown as Piece;

// A night owl: up at 10:00, ticks at 23:00 and at 00:30 after midnight, six days running.
function nightOwl(): Model {
  let m = newModel(at(0));
  const t = task("study");
  for (let d = 0; d < 6; d++) {
    m = kept(m, at(10, 0, d));
    m = tick(m, t, at(23, 0, d));
    m = tick(m, t, at(0, 30, d + 1));
  }
  return m;
}

describe("a night owl's awake window moves to the end of the day", () => {
  it("learned end is 24:00, the default 22:00", () => {
    const b = boundsOf(nightOwl());
    expect(b.to).toBe(24 * 60);
    expect(DEFAULT_BOUNDS.to).toBe(22 * 60);
  });

  it("23:00 is awake only under the learned bounds", () => {
    const p = piece(60);
    expect(awake(p, at(23, 0), dayStart(at(23, 0)), DEFAULT_BOUNDS)).toBe(false);
    expect(awake(p, at(23, 0), dayStart(at(23, 0)), boundsOf(nightOwl()))).toBe(true);
  });

  it("a flexible task still gets 22:00 to 24:00 tonight, no earlier than a cold model (a said window's start is always awake)", () => {
    const n = at(21, 30, 6);
    const t = task("late", { effort: 60, notBefore: at(22, 0, 6), notAfter: at(0, 0, 7) });
    const learned = plan([t], [], nightOwl(), n).diff.placed[0];
    const cold = plan([t], [], newModel(n), n).diff.placed[0];
    expect(learned.start).toBeGreaterThanOrEqual(cold.start); // the owl's late ticks teach the late hours, so it may sit later
    expect(learned.start).toBeGreaterThanOrEqual(at(22, 0, 6));
    expect(learned.end).toBeLessThanOrEqual(at(0, 0, 7));
  });
});

describe("learned parts only widen, never narrow", () => {
  it("tối ticks at 22-23h widen tối to cover 23h, and 18-22 stays allowed", () => {
    let m = newModel(at(0));
    const t = task("late", { tods: [[18 * 60, 22 * 60]] });
    for (let d = 0; d < 5; d++) for (const h of [22, 22.5, 23]) m = tick(m, t, at(Math.floor(h), (h % 1) * 60, d));
    const [lo, hi] = boundsOf(m).parts[3];
    expect(hi).toBeGreaterThanOrEqual(23 * 60);
    expect(hi).toBeLessThanOrEqual(22 * 60 + 90 + 60);
    expect(lo).toBeLessThanOrEqual(18 * 60);
    expect(lo).toBeLessThanOrEqual(19 * 60);
  });

  it("tối ticks at 19-20h never narrow tối below its default", () => {
    let m = newModel(at(0));
    const t = task("eve", { tods: [[18 * 60, 22 * 60]] });
    for (let d = 0; d < 5; d++) for (const h of [19, 19.5, 20]) m = tick(m, t, at(Math.floor(h), (h % 1) * 60, d));
    const [lo, hi] = boundsOf(m).parts[3];
    expect(lo).toBeLessThanOrEqual(18 * 60);
    expect(hi).toBeGreaterThanOrEqual(22 * 60);
  });
});

describe("cold and said cases stay as they were", () => {
  it("a cold model has the defaults", () => {
    expect(boundsOf(newModel(at(8)))).toEqual(DEFAULT_BOUNDS);
  });

  it("a said window (06:00 to 07:00) places the same under cold and learned bounds", () => {
    const n = at(5, 0, 6);
    const t = task("run", { effort: 60, notBefore: at(6, 0, 6), notAfter: at(7, 0, 6), tods: [[6 * 60, 7 * 60]] });
    const cold = plan([t], [], newModel(n), n).diff.placed[0];
    const learned = plan([t], [], nightOwl(), n).diff.placed[0];
    expect(learned.start).toBe(cold.start);
    expect(learned.end).toBe(cold.end);
  });
});
