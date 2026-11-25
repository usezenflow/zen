import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { DAY, HOUR, MIN } from "./features";
import { newModel, plan } from "./index";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("../lib/store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  keptPlaced: async () => ({ kept: new Set<string>(), placed: new Map<string, number>() }),
  putEvent: async (e: any) => void db.events.set(e.id, e),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (n: number) => db.model ?? newModel(n),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

const now = new Date(2026, 10, 16, 8, 0).getTime();
const at = (h: number) => new Date(2026, 10, 16, h, 0).getTime();
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "other", source: "user", effort: 60, createdAt: now - DAY, ...o });

describe("stability: the planner never shuffles placed work for an overdue or a same-day cause", () => {
  it("an overdue task never displaces today's locked tasks", () => {
    const locked = task("locked", { start: at(11), end: at(12) }); // placed, not pinned: it holds its slot unless a cause moves it
    const overdue = task("overdue", { deadline: now - DAY, effort: 120 });
    const { diff } = plan([locked, overdue], [], newModel(now), now);
    expect(diff.placed.find((p) => p.id === "locked")?.start).toBe(at(11));
    const o = diff.placed.find((p) => p.id === "overdue");
    if (o) expect(o.start >= at(12) || o.end <= at(11)).toBe(true); // it takes a gap, never an overlap
  });

  it("unlockOver skips today: a crowded today keeps its placed pieces", () => {
    // 8 one-hour undated tasks placed this afternoon: over the day's cap, but today is frozen, so none is unlocked to move.
    const tasks = Array.from({ length: 8 }, (_, i) => task(`t${i}`, { start: at(14) + i * HOUR, end: at(15) + i * HOUR, userEdited: ["start"] }));
    const { diff } = plan(tasks, [], newModel(now), now);
    for (const t of tasks) expect(diff.placed.find((p) => p.id === t.id)?.start).toBe(t.start);
  });
});

describe("stability: setting a task onto a hand-held task moves that one, without overlap", () => {
  beforeEach(() => { db.tasks.clear(); db.events.clear(); db.kv.clear(); db.model = null; });

  it("A set onto B's hold moves B aside: no overlap, B's hold is gone", async () => {
    const { apply } = await import("../lib/apply");
    db.tasks.set("b", task("b", { start: at(13), end: at(14), userEdited: ["start"], holdUntil: at(20), createdAt: now }));
    db.tasks.set("a", task("a", { createdAt: now }));
    await apply([{ op: "edit", target: "a", when: new Date(at(13) + 10 * MIN).toISOString() }], now);
    const a = db.tasks.get("a"), b = db.tasks.get("b");
    expect(a.start).toBe(at(13) + 10 * MIN);
    expect(b.holdUntil).toBeUndefined();
    expect(b.userEdited ?? []).not.toContain("start");
    expect(b.start === undefined || a.end <= b.start || a.start >= b.end).toBe(true);
  });
});
