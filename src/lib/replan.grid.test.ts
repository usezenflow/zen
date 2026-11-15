import { beforeEach, describe, expect, it, vi } from "vitest";
import { newModel, plan } from "../planner";
import type { Task, TaskEvent } from "./types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  putEvent: async (e: TaskEvent) => void db.events.set(e.id, e),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

import { apply, preview, removeScope, swipeDone } from "./apply";

// Setting a time by hand, against every kind of partner it can land on, at every distance from now.
const NOW = new Date("2026-11-16T08:00:00").getTime(), H = 3600_000, D = 24 * H;
const flex = (id: string, start: number, min = 60, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: min, createdAt: NOW, start, end: start + min * 60_000, ...o } as Task);
const PARTNERS: Record<string, (s: number) => Task[]> = {
  flex: (s) => [flex("B", s)],
  handset: (s) => [flex("B", s, 60, { pinned: true, notBefore: s, userEdited: ["start"] })],
  sitting: (s) => [{ ...flex("P", s), start: undefined, end: undefined, effort: 120 } as Task, flex("B", s, 60, { parentId: "P" }), flex("P#2", s + D, 60, { parentId: "P" })],
  lecture: (s) => [flex("B", s, 90, { source: "dlu", fixed: "lecture", kind: "study" })],
  busy: (s) => [flex("B", s, 60, { fixed: "busy" })],
};
const AT: Record<string, number> = { today: NOW + 5 * H, tomorrow: NOW + D + 3 * H, nextWeek: NOW + 7 * D + 3 * H };
const moves = (b: Task, ts: Task[]) => ts.find((x) => x.id === b.id);
const over = (a: Task, b: Task) => a.start! < b.end! && b.start! < a.end!;

beforeEach(() => { db.tasks.clear(); db.events.clear(); db.kv.clear(); db.model = null; });

describe("set a time onto another task", () => {
  for (const [kind, mk] of Object.entries(PARTNERS))
    for (const [far, s] of Object.entries(AT))
      it(`${kind}, ${far}`, async () => {
        for (const x of [flex("A", NOW + 3 * D + 6 * H), ...mk(s), flex("C", NOW + 10 * D)]) db.tasks.set(x.id, x);
        const b0 = db.tasks.get("B") as Task, c0 = db.tasks.get("C") as Task;
        const dry = await preview("A", { when: s, effortMinutes: 60 }, NOW);
        expect(db.tasks.get("A").start).toBe(NOW + 3 * D + 6 * H); // a preview writes nothing
        const r = await apply([{ op: "edit", target: "A", when: new Date(s).toISOString(), effortMinutes: 60 }], NOW);
        const a = db.tasks.get("A") as Task, b = moves(b0, [...db.tasks.values()])!;
        expect(a.start).toBe(s); // the time set holds
        expect(db.tasks.get("C").start).toBe(c0.start); // nothing unrelated moves
        if (b0.fixed) {
          expect(b.start).toBe(b0.start); // classes and busy blocks never move
          expect(r.clashes?.map((c) => c.fixed.id)).toEqual(["B"]);
          expect(dry.clashes?.map((c) => c.fixed.id)).toEqual(["B"]);
          return;
        }
        expect(over(a, b)).toBe(false); // never a silent overlap
        expect(Math.abs(b.start! - b0.start!)).toBeLessThanOrEqual(D); // it gives way nearby, not days away
        const m = r.moves?.find((x) => x.id === "B");
        expect(m?.cause).toContain("A"); // and says why
        expect(dry.moves?.find((x) => x.id === "B")?.to).toBe(b.start); // the preview said what would happen
        await r.undo();
        expect(db.tasks.get("B").start).toBe(b0.start);
        expect(db.tasks.get("A").start).toBe(NOW + 3 * D + 6 * H);
      });
});

describe("freed time", () => {
  for (const [how, free] of Object.entries({ done: (id: string) => swipeDone(id, NOW), delete: (id: string) => removeScope(id, "this", NOW) }))
    it(`${how}: a task with no time takes it, nothing else moves`, async () => {
      for (const x of [flex("A", NOW + 3 * H), flex("C", NOW + 2 * D), { ...flex("U", 0), start: undefined, end: undefined } as Task]) db.tasks.set(x.id, x);
      const r = await free("A");
      expect(db.tasks.get("U").start).toBeDefined();
      expect(db.tasks.get("C").start).toBe(NOW + 2 * D);
      expect(r.sub).toContain("U");
    });
  it("done with nothing waiting: no plan at all", async () => {
    for (const x of [flex("A", NOW + 3 * H), flex("C", NOW + 2 * D)]) db.tasks.set(x.id, x);
    await swipeDone("A", NOW);
    expect(db.kv.get("plannedAt")).toBeUndefined();
  });
});

it("bench: plan over a full store (ms logged)", () => {
  const ts: Task[] = [];
  for (let d = 0; d < 120; d++) {
    ts.push(flex(`read${d}`, NOW + d * D + 12 * H, 30, { rrule: "FREQ=DAILY", deadline: NOW + (d + 1) * D }));
    if (d % 7 < 5) ts.push(flex(`lec${d}`, NOW + d * D + 1 * H, 150, { source: "dlu", fixed: "lecture" }));
  }
  for (let i = 0; i < 40; i++) ts.push(flex(`w${i}`, NOW + (i % 30) * D + 15 * H, 60, { deadline: NOW + 100 * D }));
  const m = newModel(NOW);
  const first = plan(ts, [], m, NOW);
  const placed = ts.map((x) => { const p = first.diff.placed.find((q) => q.id === x.id); return p ? { ...x, start: p.start, end: p.end } : x; });
  const t0 = performance.now();
  plan([...placed.map((x) => (x.id === "w0" ? { ...x, start: NOW + 15 * H, end: NOW + 16 * H, pinned: true } : x))], [], first.model, NOW);
  const ms = performance.now() - t0;
  console.log(`replan after one edit, ${placed.length} tasks: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(2000);
});
