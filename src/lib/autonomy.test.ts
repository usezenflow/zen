import { beforeEach, describe, expect, it, vi } from "vitest";
import { newModel, plan } from "../planner";
import type { Task, TaskEvent } from "./types";
import { markRolled, swipeLater } from "./apply";
import { reactToTime } from "./sync";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  putEvent: async (e: TaskEvent) => void db.events.set(e.id, e),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  keptPlaced: async () => ({ kept: new Set(), placed: new Map() }),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));
// sync.ts pulls in the campus, queue and device modules: none of them is touched by the clock's replans.
vi.mock("expo-secure-store", () => ({}));
vi.mock("expo/fetch", () => ({ fetch: (u: string, i?: RequestInit) => globalThis.fetch(u, i) }));
vi.mock("react-native", () => ({ AppState: { currentState: "background" }, Platform: { OS: "ios" } }));
vi.mock("expo-notifications", () => ({ scheduleNotificationAsync: vi.fn(async () => undefined) }));
vi.mock("./queue", () => ({ enqueue: async () => {}, dropWhere: async () => {}, work: async () => {}, nextDue: async () => null, snapshot: async () => ({ jobs: [], current: null }), onQueue: () => () => {} }));
vi.mock("./dlu", () => ({ loadCreds: async () => null, hasPortal: () => false, hasLms: () => false, materialize: () => ({ upserts: [], deletes: [], digest: { exams: [], assignments: [], rooms: [], moved: [], due: [], makeup: [], cancelled: [] } }) }));
vi.mock("./dlu/background", () => ({ stopBackgroundSync: async () => undefined }));
vi.mock("./widgets", () => ({ pushWidgetsNow: async () => undefined }));

const H = 3600_000, MIN = 60_000;
const at = (h: number, m = 0, d = 0) => new Date(2026, 10, 16 + d, h, m).getTime(); // a Monday
const NOW = at(8);
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: id, kind: "study", source: "user", effort: 60, createdAt: NOW, ...o } as Task);

beforeEach(() => { db.tasks.clear(); db.events.clear(); db.kv.clear(); db.model = null; });

describe("the clock: a block is busy through its grace, then missed", () => {
  const block = () => task("h", { start: at(9), end: at(10) });
  it("inside the 15 min grace the block is still busy: nothing is rolled yet", () => {
    const { diff } = plan([block()], [], newModel(at(10, 10)), at(10, 10));
    expect(diff.placed.some((p) => p.id === "h")).toBe(false);
  });
  it("past the grace it is missed and rolls forward from its old start", () => {
    const { diff } = plan([block()], [], newModel(at(10, 20)), at(10, 20));
    const p = diff.placed.find((x) => x.id === "h");
    expect(p?.start).toBeGreaterThanOrEqual(at(10, 20));
    expect(p?.from).toBe(at(9));
  });
});

describe("a time set by hand is a hold, not a pin", () => {
  const held = () => task("h", { start: at(15), end: at(16), userEdited: ["start"], holdUntil: at(12) });
  it("busy while the hold runs: no piece is planned over it", () => {
    const { diff } = plan([held(), task("a")], [], newModel(at(8)), at(8));
    expect(diff.placed.some((p) => p.id === "h")).toBe(false);
  });
  it("after the hold ends it is a preference the planner may place again", () => {
    const { diff } = plan([held()], [], newModel(at(13)), at(13));
    expect(diff.placed.find((p) => p.id === "h")?.start).toBe(at(15));
  });
});

describe("a pull takes any of the freed gaps", () => {
  it("a task moves into the second gap when the first is too small", () => {
    const C = task("c", { start: at(14), end: at(15) });
    const gaps = [{ from: at(9), to: at(9, 30) }, { from: at(11), to: at(12) }];
    const { diff } = plan([C], [], newModel(at(8)), at(8), { pull: gaps });
    expect(diff.placed.find((p) => p.id === "c")?.start).toBe(at(11));
  });
});

describe("a said block that is set aside does not fire later actions", () => {
  it("swipeLater on a fixed lecture writes nothing and logs no event", async () => {
    db.tasks.set("L", task("L", { fixed: "lecture", source: "dlu", start: at(13), end: at(14), effort: 60 }));
    await swipeLater("L", NOW);
    expect([...db.events.values()].filter((e) => e.type === "later")).toHaveLength(0);
    expect(db.tasks.get("L").start).toBe(at(13));
  });
});

describe("reactToTime (the 30 s tick, launch and background)", () => {
  it("a block that ended past its grace stays where it is: the overrun nudge asks, nothing rolls by itself", async () => {
    db.kv.set("plannedAt", String(at(5)));
    db.tasks.set("m", task("m", { start: NOW - 2 * H, end: NOW - 90 * MIN }));
    const r = await reactToTime(NOW, false);
    expect(r).toBeUndefined();
    expect(db.tasks.get("m").start).toBe(NOW - 2 * H);
  });
  it("a new day, an idle gap and the tick plan nothing: an unscheduled task waits", async () => {
    const yesterday = at(5, 0, -1);
    db.kv.set("plannedAt", String(yesterday));
    db.tasks.set("busy", task("busy", { fixed: "busy", start: at(14), end: at(15) })); // an idle gap 08:00-14:00
    db.tasks.set("u", task("u"));
    expect(await reactToTime(NOW, false)).toBeUndefined();
    expect(db.tasks.get("u").start).toBeUndefined();
    expect(db.kv.get("plannedAt")).toBe(String(yesterday));
  });
  it("the open app places what waits for a time, and nothing placed moves", async () => {
    db.kv.set("plannedAt", String(at(5, 0, -1)));
    db.tasks.set("p", task("p", { start: at(10), end: at(11), notBefore: at(10) }));
    db.tasks.set("u", task("u"));
    const r = await reactToTime(NOW, true);
    expect(r?.changed).toBe(true);
    expect(db.tasks.get("u").start).toBeDefined();
    expect(db.tasks.get("p").start).toBe(at(10));
  });
  it("the 21:30 sweep moves only the leftovers that ended today, to tomorrow", async () => {
    db.tasks.set("left", task("left", { start: at(18), end: at(19) })); // ended, undone
    db.tasks.set("later", task("later", { start: at(21, 40), end: at(21, 55), effort: 15 })); // still ahead tonight
    const r = await reactToTime(at(21, 30), false);
    expect(r?.changed).toBe(true);
    expect(db.tasks.get("left").start).toBeGreaterThanOrEqual(at(9, 0, 1));
    expect(db.tasks.get("later").start).toBe(at(21, 40));
    expect(r?.silent).toBe(true); // the move happened, the user is not told
  });
  it("a sweep with nothing to roll is not reported at all", async () => {
    db.tasks.set("later", task("later", { start: at(21, 40), end: at(21, 55), effort: 15 }));
    expect(await reactToTime(at(21, 30), false)).toBeUndefined();
  });
  it("inside the grace nothing is replanned", async () => {
    db.kv.set("plannedAt", String(at(5)));
    db.tasks.set("m", task("m", { start: NOW - 2 * H, end: NOW - 5 * MIN }));
    const r = await reactToTime(NOW, true);
    expect(r).toBeUndefined();
    expect(db.tasks.get("m").start).toBe(NOW - 2 * H);
  });
});

describe("markRolled: the five-misses question is marked once", () => {
  it("the first call marks it and says so; later calls do not", async () => {
    db.tasks.set("r", task("r", { misses: 5 }));
    expect(await markRolled("r")).toBe(true);
    expect(db.tasks.get("r").askedRolled).toBe(true);
    expect(await markRolled("r")).toBe(false);
  });
  it("an unknown task is not marked", async () => {
    expect(await markRolled("nope")).toBe(false);
  });
});
