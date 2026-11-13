import { beforeEach, expect, it, vi } from "vitest";
import { newModel } from "../planner";
import type { Note, Task, TaskEvent } from "./types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), notes: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  putNote: async (n: Note) => void db.notes.set(n.id, n),
  removeNotes: async (ids: string[]) => ids.forEach((i) => db.notes.delete(i)),
  allEvents: async () => [...db.events.values()],
  putEvent: async (e: TaskEvent) => void db.events.set(e.id, e),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));
const cal = vi.hoisted(() => ({ sync: vi.fn(async (_: unknown[]) => ({}) as Record<string, string | null>) }));
vi.mock("./calendar", () => ({ readBusy: async () => [], syncCalendar: cal.sync }));
vi.mock("./embed", () => ({ embed: async () => undefined }));

import { apply, pickNow, swipeDone } from "./apply";

const NOW = new Date("2026-11-13T10:00:00").getTime();
const live = () => [...db.tasks.values()].filter((x: Task) => !x.deletedAt);

beforeEach(() => {
  db.tasks.clear(); db.notes.clear(); db.events.clear(); db.kv.clear(); db.model = null; cal.sync.mockClear();
});

it("one line becomes several placed tasks, one undo removes all", async () => {
  const r = await apply([
    { op: "create", title: "Gym", kind: "exercise", repeat: "FREQ=WEEKLY;COUNT=3" },
    { op: "create", title: "Essay", kind: "study", effortMinutes: 240, deadline: "2026-11-17T23:00:00" },
    { op: "note", title: "call mom" },
  ], NOW);
  const tasks = live();
  expect(tasks.filter((x) => x.title === "Gym")).toHaveLength(3);
  expect(tasks.filter((x) => x.parentId).length).toBeGreaterThan(1); // essay split into sittings
  expect(tasks.filter((x) => !x.parentId && x.title === "Gym").every((x) => x.start !== undefined)).toBe(true);
  expect(db.notes.size).toBe(1);
  expect(r.toast).toMatch(/sittings|buổi/);
  await r.undo();
  expect(db.tasks.size).toBe(0);
  expect(db.notes.size).toBe(0);
  expect(db.events.size).toBe(0);
});

it("done by split parent finishes sittings and logs done events", async () => {
  await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 240, deadline: "2026-11-17T23:00:00" }], NOW);
  const parent = live().find((x) => !x.parentId)!;
  await apply([{ op: "done", target: parent.id }], NOW + 1000);
  expect(live().filter((x) => x.parentId).every((x) => x.doneAt)).toBe(true);
  expect([...db.events.values()].some((e) => e.type === "done")).toBe(true);
});

it("swipe done marks the task and undo reverts", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
  const t0 = live()[0];
  const r = await swipeDone(t0.id, NOW + 5000);
  expect(db.tasks.get(t0.id).doneAt).toBe(NOW + 5000);
  await vi.waitFor(() => expect(JSON.parse(db.kv.get("stats.queue") ?? "[]")).toMatchObject([{ reward: 0.5, kind: "study", zeroEdit: true }]));
  await r.undo();
  expect(db.tasks.get(t0.id).doneAt).toBeUndefined();
});

it("pickNow prefers the running task, else the next one", () => {
  const mk = (id: string, s: number, e: number): Task => ({ id, title: id, kind: "other", source: "user", effort: 30, start: s, end: e, createdAt: 0 });
  const ts = [mk("a", NOW + 3600_000, NOW + 7200_000), mk("b", NOW - 600_000, NOW + 600_000)];
  expect(pickNow(ts, NOW)?.id).toBe("b");
  expect(pickNow([ts[0]], NOW)?.id).toBe("a");
});
