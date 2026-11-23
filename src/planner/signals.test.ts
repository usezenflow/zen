import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { MIN, hourOf } from "./features";
import { learn, missedReplan, newModel, plan } from "./index";
import { EDGE, edgeCost } from "./value";

// Each signal the app sends (kept, done, later, drag, ignored, missed) and what the planner learns from it, through the real plan() and learn().
const now = new Date(2026, 10, 16, 8, 0).getTime(); // Monday 08:00
const hm = (d: number, h: number, m = 0) => new Date(2026, 10, 16 + d, h, m).getTime();
const vec = new Float32Array(Array.from({ length: 8 }, (_, i) => (i + 1) / 10));
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study" as Kind, source: "user", effort: 60, createdAt: now, vec, ...o });

describe("missed: charged once per distinct missed start", () => {
  it("two plans over the same stale missed task charge the arm and the history once", () => {
    // Placed at 09:00 on day 0 by a first plan, then 10:00 has passed with the block never ticked (apply writes the block back).
    const t0 = task("m");
    const first = plan([t0], [], newModel(hm(0, 7)), hm(0, 7));
    const placed = first.diff.placed[0];
    const missedAt = hm(0, 11, 30); // past the block's end and its 15 min grace (policy GRACE)
    const stale = task("m", { start: placed.start, end: placed.end });
    const m1 = plan([stale], [], first.model, missedAt).model;
    const misses1 = m1.hist.filter((h) => h.miss).length;
    expect(misses1).toBe(1);
    // The same plan again, with the same stale task and the model it returned: nothing new was missed.
    const m2 = plan([stale], [], m1, missedAt).model;
    expect(m2.hist.filter((h) => h.miss).length).toBe(misses1);
    expect(m2.arms).toEqual(m1.arms);
  });
});

// A placed task (the model holds its arm and features), then one signal.
const placed = (t: Task) => { const p = plan([t], [], newModel(hm(0, 7)), hm(0, 7)); return { model: p.model, pl: p.diff.placed[0]! }; };
const bOf = (m: ReturnType<typeof newModel>, a: number) => m.arms[a]!.b[0]!;

describe("signals the app sends", () => {
  it("kept credits the planned hour", () => {
    const { model, pl } = placed(task("k"));
    const after = learn(model, { id: "e1", taskId: "k", type: "kept", at: pl.start }, task("k", { start: pl.start, end: pl.end }));
    expect(bOf(after, pl.arm!)).toBeGreaterThan(bOf(model, pl.arm!));
  });

  it("done early (over an hour before the slot) credits the hour it happened, not the planned one", () => {
    const { model, pl } = placed(task("e"));
    const early = hm(0, 6);
    const actual = Math.floor(hourOf(early));
    const after = learn(model, { id: "e2", taskId: "e", type: "done", at: early }, task("e", { start: pl.start, end: pl.end }));
    expect(bOf(after, actual)).toBeGreaterThan(bOf(model, actual));
  });

  it("done late (over an hour after the block) gives the planned hour a small negative", () => {
    const { model, pl } = placed(task("l"));
    const late = pl.end + 3 * 60 * MIN;
    const after = learn(model, { id: "e3", taskId: "l", type: "done", at: late }, task("l", { start: pl.start, end: pl.end }));
    expect(bOf(after, pl.arm!)).toBeLessThan(bOf(model, pl.arm!));
    expect(bOf(after, pl.arm!)).toBeGreaterThan(bOf(model, pl.arm!) - 0.5 * 0.5); // small: a quarter of R.done, not a full miss
  });
});

describe("misses: the 3rd miss shrinks a guessed length, the reason says so", () => {
  const block = { start: hm(0, 9), end: hm(0, 10) };
  it("a guessed length shrinks one step from the third miss, never below 15; a said one never shrinks", () => {
    const pl = { start: hm(0, 11), end: hm(0, 12), from: block.start };
    expect(missedReplan(task("g", { ...block, effortGuessed: true, misses: 2 }), pl, hm(0, 11))).toEqual({ misses: 3, effort: 30 });
    expect(missedReplan(task("s", { ...block, misses: 2 }), pl, hm(0, 11))).toEqual({ misses: 3 }); // said: no shrink, no effort
    expect(missedReplan(task("g2", { start: hm(0, 9), end: hm(0, 9, 15), effortGuessed: true, misses: 2 }), { start: hm(0, 11), end: hm(0, 11, 15), from: hm(0, 9) }, hm(0, 11))?.effort).toBe(15);
  });

  it("from the third miss the reason missed3 is said, and not before", () => {
    const base = task("r", { misses: 3, start: hm(0, 9), end: hm(0, 10) });
    const { diff } = plan([base], [], newModel(hm(0, 7)), hm(0, 11));
    expect(diff.placed[0].why?.some((r) => r.key === "missed3")).toBe(true);
    const few = plan([{ ...base, misses: 2 }], [], newModel(hm(0, 7)), hm(0, 11)).diff.placed[0];
    expect(few.why?.some((r) => r.key === "missed3")).toBe(false);
  });
});

describe("deadline margin: a dated piece keeps room before its due", () => {
  // Learned: the user dragged work like this from 16:00 to 21:00 several times, so the 21:00 hour is what they want.
  const vec = new Float32Array(Array.from({ length: 8 }, (_, i) => (i + 1) / 10));
  const learned = () => {
    let m = newModel(hm(-7, 7));
    for (let d = -6; d < 0; d++) {
      const t = task(`old${d}`, { vec, start: hm(d, 16), end: hm(d, 17), createdAt: hm(d, 7) });
      m = learn(m, { id: `ev${d}`, taskId: t.id, type: "drag", at: hm(d, 12), data: { fromStart: hm(d, 16), toStart: hm(d, 21) } }, t);
    }
    return m;
  };
  const due = hm(0, 22);
  // Free only from 20:00 to 22:00 (busy until 20:00): without the margin the learned 21:00 start wins (ends 22:00); with it, 20:00 (ends 21:00).
  const target = () => task("d", { vec, deadline: due, effort: 60, createdAt: hm(0, 18) });
  const run1 = (w: number) => {
    EDGE.w = w;
    try { return plan([target()], [{ start: hm(0, 8), end: hm(0, 20) }], learned(), hm(0, 18)).diff.placed[0]!; } finally { EDGE.w = 0.5; }
  };
  it("with the learned 21:00 preference and no margin, it ends exactly at the due (22:00)", () => {
    const pl = run1(0);
    expect(pl.end).toBe(due);
  });
  it("with the margin, it ends by 21:30 under the same preference", () => {
    const pl = run1(0.5);
    expect(pl.end).toBeLessThanOrEqual(hm(0, 21, 30));
  });
  it("when only 20:30 to 22:00 is free, it still lands there (soft, never refused)", () => {
    EDGE.w = 0.5;
    const { diff } = plan([target()], [{ start: hm(0, 8), end: hm(0, 20, 30) }], newModel(hm(0, 15)), hm(0, 15));
    expect(diff.placed).toHaveLength(1);
    expect(diff.placed[0].start).toBeGreaterThanOrEqual(hm(0, 20, 30));
    expect(diff.placed[0].end).toBeLessThanOrEqual(due);
  });
});

describe("deadline margin cost", () => {
  const due = hm(0, 22);
  const piece = (o: Partial<Task> = {}) => ({ id: "p", task: task("p", { deadline: due, ...o }), effort: 60, k: 1, n: 1, slip: 0 });
  it("a sitting that ends inside the margin pays for the hours it uses; one ending before the margin does not", () => {
    expect(edgeCost(piece(), hm(0, 21))).toBeCloseTo(EDGE.w * 0.5); // 21:00-22:00 uses the 30 min margin
    expect(edgeCost(piece(), hm(0, 20, 30))).toBe(0); // 20:30-21:30 ends before 21:30
  });
  it("a prep (its 22:00 cap is already the margin) and a piece with no room to move earlier are exempt", () => {
    expect(edgeCost(piece({ forId: "exam" }), hm(0, 21))).toBe(0);
    expect(edgeCost(piece({ notBefore: hm(0, 21) }), hm(0, 21))).toBe(0);
    expect(edgeCost(piece({ deadline: undefined }), hm(0, 21))).toBe(0);
  });
});
