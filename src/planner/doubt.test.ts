import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { HOUR } from "./features";
import { update } from "./linucb";
import { newModel, plan } from "./index";
import type { Model } from "./model";

const now = new Date(2026, 10, 16, 8, 0).getTime(); // Monday 08:00
const at = (h: number) => new Date(2026, 10, 16, h, 0).getTime();
const task = (start: number): Task =>
  ({ id: "t", title: "t", kind: "study", source: "user", effort: 60, createdAt: now - 86400000, start, end: start + HOUR });

// A freed gap at 10:00 pulls the task at 14:00 earlier.
const pull = { from: at(10), to: at(11) };
const startOf = (plan0: { diff: { placed: { id: string; start: number }[] } }, s: number) =>
  new Date(plan0.diff.placed.find((p) => p.id === "t")?.start ?? s).getHours();

// Evidence on one hour's arm, on the features this task gets there: that hour becomes narrow, and its mean follows the outcomes.
function sureAt(m: Model, hour: number, r: number, n: number) {
  const x = m.placed.t.x;
  for (let i = 0; i < n; i++) update(m.arms[hour], x, r);
}

describe("a task with a place moves to a gap only on a clearly better hour", () => {
  const seeded = () => {
    const { model } = plan([task(at(14))], [], newModel(now), now);
    return structuredClone(model);
  };

  it("a confident, clearly better gap still wins", () => {
    const m = seeded();
    sureAt(m, 14, -1, 20); // 14h has gone badly many times
    sureAt(m, 10, 1, 20); // 10h has gone well many times
    const { diff } = plan([task(at(14))], [], m, now, { pull });
    expect(startOf({ diff }, at(14))).toBe(10);
  });
});
