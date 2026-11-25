import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import { DAY, HOUR, MIN } from "./features";
import { newModel, plan } from "./index";

const now = new Date(2026, 10, 16, 8, 0).getTime(); // Monday 08:00
const at = (d: number, h: number) => new Date(2026, 10, 16 + d, h, 0).getTime();
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 60, createdAt: now, ...o });
// a task already placed: its start and end are its time
const placed = (id: string, start: number, o: Partial<Task> = {}): Task => task(id, { start, end: start + 60 * MIN, deadline: at(3, 22), ...o });
const startOf = (diff: { placed: { id: string; start: number }[] }, id: string, fallback: number) => diff.placed.find((p) => p.id === id)?.start ?? fallback;

describe("fill: place once, never move silently", () => {
  it("on create, a new task takes open time and no placed task moves", () => {
    const old = [placed("a", at(0, 9)), placed("b", at(0, 11)), placed("c", at(1, 14), { deadline: at(1, 20) })];
    for (const n of [task("n1", { deadline: at(0, 20) }), task("n2", { effort: 120 }), task("n3", { effort: 90, deadline: at(1, 12) })]) {
      const r = plan([...old, n], [], newModel(now), now, { fill: true, only: [n.id] });
      for (const o of old) expect(startOf(r.diff, o.id, o.start!)).toBe(o.start);
      expect(r.diff.placed.some((p) => p.id === n.id)).toBe(true);
    }
  });

  it("on early done, the freed time goes to a task with no time and placed tasks stay", () => {
    const a = placed("a", at(0, 9), { doneAt: now });
    const rest = [placed("b", at(0, 13)), placed("c", at(0, 15)), task("u", { deadline: at(0, 20) })];
    const r = plan([a, ...rest], [], newModel(now), now, { fill: true, pull: [{ from: at(0, 9), to: at(0, 10) }] });
    expect(startOf(r.diff, "b", at(0, 13))).toBe(at(0, 13));
    expect(startOf(r.diff, "c", at(0, 15))).toBe(at(0, 15));
    expect(r.diff.placed.some((p) => p.id === "u")).toBe(true);
  });

  it("on delete, placed tasks after the freed slot stay where they are", () => {
    const rest = [placed("b", at(0, 13)), placed("c", at(0, 15)), placed("d", at(1, 10))];
    const r = plan(rest, [], newModel(now), now, { fill: true, pull: [{ from: at(0, 9), to: at(0, 10) }] });
    for (const x of rest) expect(startOf(r.diff, x.id, x.start!)).toBe(x.start);
  });
});

describe("a task that needs day 8 or later", () => {
  it("stays unplaced when it cannot start inside the 7-day horizon", () => {
    const far = task("far", { notBefore: now + 8 * DAY, deadline: now + 12 * DAY });
    const r = plan([far], [], newModel(now), now);
    expect(r.diff.placed.some((p) => p.id === "far")).toBe(false);
    expect(r.diff.unplaced?.some((u) => u.id === "far")).toBe(true);
  });

  it("with a deadline past day 7 but no earliest day, still gets a slot inside the 7 days", () => {
    const due = task("due", { deadline: now + 12 * DAY });
    const r = plan([due], [], newModel(now), now);
    const p = r.diff.placed.find((x) => x.id === "due");
    expect(p).toBeDefined();
    expect(p!.start).toBeLessThan(now + 7 * DAY);
  });
});

describe("an overdue task", () => {
  it("never displaces today's tasks when it is placed on create", () => {
    const today = [placed("t", at(0, 10), { deadline: at(0, 22) })];
    const overdue = task("o", { deadline: now - 2 * HOUR, effort: 60 });
    const r = plan([...today, overdue], [], newModel(now), now, { fill: true, only: ["o"] });
    expect(startOf(r.diff, "t", at(0, 10))).toBe(at(0, 10));
  });

  it("keeps its slot on a replan (its lock is not decided again each time)", () => {
    const late = placed("l", now + 2 * HOUR, { deadline: now - HOUR });
    const r = plan([late], [], newModel(now), now);
    expect(startOf(r.diff, "l", late.start!)).toBe(late.start);
  });

  it("is still moved when its deadline is ahead and the slot is now late", () => {
    const late = placed("l", now + 2 * HOUR, { deadline: now + HOUR + 30 * MIN });
    const r = plan([late], [], newModel(now), now);
    const p = r.diff.placed.find((x) => x.id === "l");
    expect(p).toBeDefined();
    expect(p!.start + 60 * MIN).toBeLessThanOrEqual(late.deadline!);
  });
});

describe("timing: far tasks", () => {
  it.skipIf(!!process.env.CI)("150 tasks due 30-90 days out, most unplaced, plan in under 1.5 s", () => { // timing: off in CI, its runners vary 3x; was ~2.6 s when each unplaced task scanned every block per slot of its free-time span
    const ts = Array.from({ length: 150 }, (_, i) => task(`p${i}`, { deadline: at(30 + (i % 60), 18), effort: 60 + (i % 4) * 30 }));
    const t0 = Date.now();
    plan(ts, [], newModel(now), now);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
