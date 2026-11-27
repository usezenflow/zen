import { beforeEach, describe, expect, it, vi } from "vitest";
import { newModel } from "../planner";
import { apply, moveToDay } from "./apply";
import type { Task, TaskEvent } from "./types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  putEvent: async (e: TaskEvent) => void db.events.set(e.id, e),
  putEvents: async (es: TaskEvent[]) => es.forEach((e) => db.events.set(e.id, e)),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

const NOW = new Date("2026-11-13T10:00:00").getTime(); // Friday morning
const MON = new Date("2026-11-16T00:00:00").getTime();
const live = () => [...db.tasks.values()].filter((x: Task) => !x.deletedAt);

beforeEach(() => { db.tasks.clear(); db.events.clear(); db.kv.clear(); db.model = null; });

describe("moveToDay", () => {
  it("moves a flexible task to the day, keeps its part of the day, and plans it inside that day", async () => {
    await apply([{ op: "create", title: "Đọc sách", kind: "study", effortMinutes: 60, tods: [[13 * 60, 18 * 60]] }], NOW);
    const id = live()[0].id;
    await moveToDay(id, MON, NOW);
    const x = db.tasks.get(id);
    expect(x.tods).toEqual([[13 * 60, 18 * 60]]); // the part stays
    expect(x.notBefore).toBe(MON);
    expect(x.notAfter).toBe(MON + 86_400_000);
    expect(x.pinned).toBe(false);
    expect(x.userEdited ?? []).not.toContain("start");
    expect(x.start).toBeDefined();
    expect(x.start! >= MON && x.start! < MON + 86_400_000).toBe(true);
    const mins = (x.start! - MON) / 60_000;
    expect(mins >= 13 * 60 && mins + 60 <= 18 * 60).toBe(true);
  });

  it("a chosen part replaces the window: Dời to chiều puts it in 13-18h that day", async () => {
    await apply([{ op: "create", title: "Viết báo cáo", kind: "study", effortMinutes: 45 }], NOW);
    const id = live()[0].id;
    await moveToDay(id, MON, NOW, [13 * 60, 18 * 60]);
    const x = db.tasks.get(id);
    expect(x.tods).toEqual([[13 * 60, 18 * 60]]);
    const mins = (x.start! - MON) / 60_000;
    expect(mins >= 13 * 60 && mins + 45 <= 18 * 60).toBe(true);
  });

  it("rejects a fixed task: nothing is written", async () => {
    const fixed: Task = { id: "lec", title: "Giải tích", kind: "study", source: "user", effort: 90, createdAt: NOW, fixed: "lecture", start: NOW + 3_600_000, end: NOW + 3 * 3_600_000 };
    db.tasks.set(fixed.id, fixed);
    const r = await moveToDay("lec", MON, NOW);
    expect(db.tasks.get("lec")).toBe(fixed);
    expect(r.changed).toBe(false);
  });

  it("a day mostly full of classes: the task stays on the dropped day, never tomorrow's morning", async () => {
    const H = 3_600_000;
    // classes 07-12 and 13-21 leave only 12-13 and the evening tail on Monday
    for (const [i, [a, b]] of ([[7, 12], [13, 20.5]] as const).entries())
      db.tasks.set(`c${i}`, { id: `c${i}`, title: "Lớp", kind: "study", source: "dlu", effort: (b - a) * 60, createdAt: NOW, fixed: "lecture", start: MON + a * H, end: MON + b * H } as Task);
    await apply([{ op: "create", title: "Đọc sách", kind: "study", effortMinutes: 60 }], NOW);
    const id = live().find((x) => x.title === "Đọc sách")!.id;
    await moveToDay(id, MON, NOW);
    const x = db.tasks.get(id);
    if (x.start !== undefined) expect(x.start >= MON && x.start < MON + 86_400_000).toBe(true);
    expect(x.notBefore).toBe(MON);
  });

  it("a past day or one beyond the horizon is refused, nothing is written", async () => {
    await apply([{ op: "create", title: "Đọc sách", kind: "study", effortMinutes: 60 }], NOW);
    const id = live()[0].id, before = db.tasks.get(id);
    await moveToDay(id, NOW - 3 * 86_400_000, NOW);
    await moveToDay(id, NOW + 60 * 86_400_000, NOW);
    expect(db.tasks.get(id)).toBe(before);
  });

  it("a day with no room leaves the task where it was, not unscheduled", async () => {
    await apply([{ op: "create", title: "Học coursera", kind: "study", effortMinutes: 60 }], NOW);
    const id = live()[0].id, before = db.tasks.get(id).start;
    expect(before).toBeDefined();
    db.tasks.set("busy", { id: "busy", title: "Bận", kind: "other", source: "user", fixed: "busy", effort: 1440, start: MON, end: MON + 86_400_000, createdAt: NOW });
    const r = await moveToDay(id, MON, NOW);
    expect(r.changed).toBe(false);
    expect(db.tasks.get(id).start).toBe(before);
    expect(db.tasks.get(id).userDay).toBeUndefined();
  });
});
