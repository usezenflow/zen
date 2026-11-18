import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { MIN } from "./features";
import { HOLDS } from "./grounded";
import { type Env, solve } from "./place";
import type { Piece } from "./value";

const now = new Date(2026, 10, 16, 13, 0).getTime(); // Monday 13:00, a free afternoon
const task = (id: string, kind: Task["kind"], effort: number): Task => ({ id, title: id, kind, source: "user", effort, createdAt: now });
const piece = (t: Task): Piece => ({ id: t.id, task: t, effort: t.effort, k: 1, n: 1, slip: 0 });
const env: Env = { busy: [], fixedEnds: [], now, util: () => 0 };

describe("kind grouping", () => {
  it("two errands and a study task on one free afternoon put the errands back to back", () => {
    const pieces = [piece(task("chợ", "errand", 45)), piece(task("quà", "errand", 30)), piece(task("ôn", "study", 60))];
    const r = solve(pieces, env, 3);
    const s = (id: string) => r.starts.get(id)!;
    const e = (id: string) => s(id) + pieces.find((p) => p.id === id)!.effort * MIN;
    const [a, b] = ["chợ", "quà"].sort((x, y) => s(x) - s(y));
    expect(s(b) - e(a)).toBeGreaterThanOrEqual(0);
    expect(s(b) - e(a)).toBeLessThanOrEqual(15 * MIN);
    // the study task is not wedged between them
    expect(s("ôn") < s(a) || s("ôn") > e(b)).toBe(true);
  });
});

describe("batch reason holds only with a back to back errand or finance neighbour", () => {
  const me = task("chợ", "errand", 45);
  const start = now;
  const near = (kind: Task["kind"], at: number): Task => ({ ...task("quà", kind, 30), start: at, end: at + 30 * MIN });
  const why = { key: "batch" as const, w: 0.2, vars: { title: "quà" } };

  it("holds next to a finance piece that ends 15 min before it starts", () => {
    expect(HOLDS.batch(why, { task: me, start, rules: [], tasks: [near("finance", start - 45 * MIN)] })).toBe(true);
  });
  it("does not hold for a study neighbour, a far neighbour, or no neighbour", () => {
    expect(HOLDS.batch(why, { task: me, start, rules: [], tasks: [near("study", start - 45 * MIN)] })).toBe(false);
    expect(HOLDS.batch(why, { task: me, start, rules: [], tasks: [near("errand", start - 3 * 60 * MIN)] })).toBe(false);
    expect(HOLDS.batch(why, { task: me, start, rules: [] })).toBe(false);
  });
});
