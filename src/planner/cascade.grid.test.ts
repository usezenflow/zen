import { describe, expect, it } from "vitest";
import type { Kind, Task } from "../lib/types";
import { DAY, MIN, dayStart, hourOf } from "./features";
import { learn, newModel, plan } from "./index";
import { PARTS } from "./place";

// Tue 17/11/2026, local time as planner.test.ts builds it.
const at = (h: number, m = 0, d = 0) => new Date(2026, 10, 17 + d, h, m).getTime();
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study" as Kind, source: "user", effort: 60, createdAt: at(8), ...o });
const partOf = (s: number) => PARTS.findIndex(([a, b]) => { const m = (s - dayStart(s)) / MIN; return m >= a && m < b; });

describe("a said part that is full runs on to the adjacent parts, today then tomorrow", () => {
  const NOWS = [[8, 0], [12, 0], [15, 0], [19, 0], [21, 20]] as const;
  for (const [h, mi] of NOWS) for (const i of [0, 2, 3]) for (const len of [15, 60, 90, 150]) for (const fill of ["empty", "full"]) {
    const n = at(h, mi), [a, b] = PARTS[i];
    if (b * MIN <= n - dayStart(n)) continue; // the said part is already gone today
    it(`now ${h}:${String(mi).padStart(2, "0")}, part ${i}, ${len} min, ${fill}`, () => {
      const busy = fill === "full" ? [{ start: dayStart(n) + a * MIN, end: dayStart(n) + b * MIN }] : [];
      const t = task("g", { effort: len, notBefore: dayStart(n) + a * MIN, notAfter: dayStart(n) + b * MIN, tods: [[a, b]] });
      const { diff } = plan([t], busy, newModel(n), n);
      expect(diff.placed).toHaveLength(1);
      const p = diff.placed[0];
      expect(p.start).toBeGreaterThanOrEqual(n);
      expect(p.start).toBeLessThan(dayStart(n) + 2 * DAY);
      expect(p.start).toBeGreaterThanOrEqual(at(7));
      const k = partOf(p.start);
      expect(Math.abs(k - i)).toBeLessThanOrEqual(1);
      expect(p.end - p.start).toBe(len * MIN);
      expect(hourOf(p.start) < 24).toBe(true);
    });
  }
});

describe("tonight means tonight", () => {
  it("Tue 21:20, tối, 60 min, empty: today, from 21:30 on, ends by midnight : the rest of tối runs on into đêm, 21:30", () => {
    const n = at(21, 20);
    const t = task("tn", { effort: 60, notBefore: at(18), notAfter: at(22), tods: [[18 * 60, 22 * 60]] });
    const { diff } = plan([t], [], newModel(n), n);
    expect(diff.placed).toHaveLength(1);
    const p = diff.placed[0];
    expect(dayStart(p.start)).toBe(at(0));
    expect(p.start).toBe(at(21, 30));
    expect(p.end).toBeLessThanOrEqual(at(0, 0, 1));
  });

  it("after 3 drags away from 22:30 to 19:00, the same ask lands tomorrow inside 18:00 to 22:00", () => {
    const n = at(21, 20);
    let m = newModel(n);
    for (const i of [1, 2, 3]) {
      const from = at(22, 30), to = at(19);
      m = learn(m, { id: `e${i}`, taskId: `d${i}`, type: "drag", at: n, data: { fromStart: from, toStart: to } }, task(`d${i}`, { kind: "study", start: from, end: from + 90 * MIN }));
    }
    const t = task("tn", { effort: 60, notBefore: at(18), notAfter: at(22), tods: [[18 * 60, 22 * 60]] });
    const { diff } = plan([t], [], m, n);
    expect(diff.placed).toHaveLength(1);
    const p = diff.placed[0];
    expect(dayStart(p.start)).toBe(at(0, 0, 1));
    expect(hourOf(p.start) >= 18 && p.end <= at(22, 0, 1)).toBe(true);
  });
});
