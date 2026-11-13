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
vi.mock("./calendar", () => ({ readBusy: async () => [] }));

const pl = vi.hoisted(() => ({ from: undefined as number | undefined }));
vi.mock("../planner", async (orig) => {
  const m = await orig<typeof import("../planner")>();
  return { ...m, plan: (...a: Parameters<typeof m.plan>) => { // the planner under test elsewhere; here only stamp `from`
    const r = m.plan(...a);
    if (pl.from !== undefined) r.diff.placed = r.diff.placed.map((p) => ({ ...p, from: pl.from, why: [{ key: "stable" as const, w: 1 }] }));
    return r;
  } };
});

import { addRule, apply, ingest, pickNow, pin, putBack, removeRule, scopeIds, swipeDone } from "./apply";
import { loadMoves } from "./moves";

const NOW = new Date("2026-11-13T10:00:00").getTime();
const live = () => [...db.tasks.values()].filter((x: Task) => !x.deletedAt);

beforeEach(() => {
  pl.from = undefined; db.tasks.clear(); db.notes.clear(); db.events.clear(); db.kv.clear(); db.model = null;
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

import { futureDlu, moveMine, removeImported } from "./apply";
import { overlaps, keepBoth, pendingOverlaps } from "./overlap";
import { allDayBusy } from "./busy";

const T = (o: Partial<Task>): Task => ({ id: "x", title: "x", kind: "study", source: "user", effort: 60, createdAt: NOW, ...o });
const H1 = 3_600_000;

it("a user-deleted DLU task is marked so sync cannot revive it", async () => {
  db.tasks.set("dlu:a", T({ id: "dlu:a", source: "dlu", upstreamKey: "a", fixed: "lecture", start: NOW + 5 * H1, end: NOW + 6 * H1 }));
  await apply([{ op: "delete", target: "dlu:a" }], NOW);
  expect(db.tasks.get("dlu:a").userEdited).toContain("deleted");
});

it("finds pinned tasks over a lecture; keep both persists, move mine unpins", async () => {
  const lec = T({ id: "l", source: "dlu", fixed: "lecture", start: NOW + 2 * H1, end: NOW + 4 * H1 });
  const mine = T({ id: "m", start: NOW + 3 * H1, end: NOW + 4 * H1, userEdited: ["start"] });
  const free = T({ id: "f", start: NOW + 3 * H1, end: NOW + 4 * H1 });
  expect(overlaps([lec, mine, free], NOW).map((o) => o.mine.id)).toEqual(["m"]);
  db.tasks.set("l", lec); db.tasks.set("m", mine);
  const [o] = await pendingOverlaps(NOW);
  await keepBoth(o);
  expect(await pendingOverlaps(NOW)).toEqual([]);
  await moveMine("m", NOW);
  expect(db.tasks.get("m").userEdited).not.toContain("start");
  expect(db.tasks.get("m").start).not.toBe(NOW + 3 * H1);
});

it("removeImported drops only future dlu tasks", async () => {
  const past = T({ id: "p", source: "dlu", start: NOW - 5 * H1, end: NOW - 4 * H1 });
  const fut = T({ id: "q", source: "dlu", start: NOW + 5 * H1, end: NOW + 6 * H1 });
  const mine = T({ id: "u", start: NOW + 5 * H1, end: NOW + 6 * H1 });
  expect(futureDlu([past, fut, mine], NOW).map((x) => x.id)).toEqual(["q"]);
  [past, fut, mine].forEach((x) => db.tasks.set(x.id, x));
  await removeImported(NOW);
  expect(db.tasks.get("q").deletedAt).toBe(NOW);
  expect(db.tasks.get("p").deletedAt).toBeUndefined();
  expect(db.tasks.get("u").deletedAt).toBeUndefined();
});

it("an all-day event blocks the whole UTC+7 day", () => {
  const day = Date.UTC(2026, 10, 12, 17); // 13 Nov 00:00 +07
  expect(allDayBusy(day, day + 86400_000 - 1000)).toEqual({ start: day, end: day + 86400_000 });
  expect(allDayBusy(Date.UTC(2026, 10, 13), Date.UTC(2026, 10, 14))).toEqual({ start: day, end: day + 86400_000 });
});

it("repeat scope: following covers this and later siblings, one only itself; note edit pins the field", async () => {
  await apply([{ op: "create", title: "Gym", kind: "exercise", repeat: "FREQ=WEEKLY;COUNT=3" }, { op: "create", title: "Other", kind: "study", effortMinutes: 30 }], NOW);
  const gyms = live().filter((x: Task) => x.title === "Gym").sort((a: Task, b: Task) => a.start! - b.start!);
  const all = live();
  expect(scopeIds(all, gyms[0].id, "this")).toEqual([gyms[0].id]);
  expect(scopeIds(all, gyms[1].id, "following").sort()).toEqual([gyms[1].id, gyms[2].id].sort());
  const r = await apply(scopeIds(all, gyms[1].id, "following").map((target) => ({ op: "delete" as const, target })), NOW);
  expect(live().filter((x: Task) => x.title === "Gym")).toHaveLength(1);
  await r.undo();
  expect(live().filter((x: Task) => x.title === "Gym")).toHaveLength(3);
  await apply([{ op: "edit", target: gyms[0].id, note: "bring towel" }], NOW);
  expect(db.tasks.get(gyms[0].id).note).toBe("bring towel");
  expect(db.tasks.get(gyms[0].id).userEdited).toContain("note");
});

import { loadGone, removeScope, topUp } from "./apply";
const DAYMS = 86400_000;

it("scope covers a lecture section by section id; all includes earlier ones", () => {
  const lec = (id: string, d: number, section = "S1") => T({ id, source: "dlu", section, fixed: "lecture", start: NOW + d * DAYMS, end: NOW + d * DAYMS + H1 });
  const ts = [lec("a", 1), lec("b", 8), lec("c", 15), lec("z", 8, "S2")];
  expect(scopeIds(ts, "b", "this")).toEqual(["b"]);
  expect(scopeIds(ts, "b", "following")).toEqual(["b", "c"]);
  expect(scopeIds(ts, "b", "all")).toEqual(["a", "b", "c"]);
});

it("removeScope tombstones the section and a fresh repeating create clears a series tombstone", async () => {
  for (const [id, d] of [["a", 1], ["b", 8]] as const) db.tasks.set(id, T({ id, source: "dlu", section: "S1", fixed: "lecture", start: NOW + d * DAYMS, end: NOW + d * DAYMS + H1 }));
  const r = await removeScope("b", "following", NOW);
  expect((await loadGone()).sections.S1).toBe(NOW + 8 * DAYMS);
  expect(db.tasks.get("a").deletedAt).toBeUndefined();
  expect(db.tasks.get("b").deletedAt).toBe(NOW);
  await r.undo();
  expect((await loadGone()).sections.S1).toBeUndefined();
  await apply([{ op: "create", title: "Gym", repeat: "FREQ=WEEKLY" }], NOW);
  const g = live().find((x: Task) => x.title === "Gym")!;
  await removeScope(g.id, "all", NOW);
  expect((await loadGone()).series["FREQ=WEEKLY|Gym"]).toBe(0);
  await apply([{ op: "create", title: "Gym", repeat: "FREQ=WEEKLY" }], NOW);
  expect((await loadGone()).series["FREQ=WEEKLY|Gym"]).toBeUndefined();
});

it("topUp keeps a daily series 14 days ahead without duplicating days", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", repeat: "FREQ=DAILY" }], NOW);
  const later = NOW + 6 * DAYMS;
  await topUp(later);
  const days = live().filter((x: Task) => x.title === "Read").map((x: Task) => x.deadline!);
  expect(new Set(days).size).toBe(days.length);
  expect(Math.max(...days)).toBeGreaterThanOrEqual(later + 14 * DAYMS);
  const n = days.length;
  expect(await topUp(later)).toBeUndefined();
  expect(live().filter((x: Task) => x.title === "Read")).toHaveLength(n);
});

it("topUp adds per-week copies of COUNT=3, stops after a following delete, ignores DLU and finite daily", async () => {
  await apply([{ op: "create", title: "Gym", repeat: "FREQ=WEEKLY;COUNT=3" }, { op: "create", title: "Once", repeat: "FREQ=DAILY;COUNT=2" }], NOW);
  db.tasks.set("d", T({ id: "d", source: "dlu", rrule: "FREQ=WEEKLY", deadline: NOW + DAYMS }));
  await topUp(NOW);
  expect(live().filter((x: Task) => x.title === "Gym" && !x.parentId)).toHaveLength(6);
  expect(live().filter((x: Task) => x.title === "Once")).toHaveLength(2);
  expect(live().filter((x: Task) => x.title === "x")).toHaveLength(1);
  const first = live().filter((x: Task) => x.title === "Gym").sort((a: Task, b: Task) => a.deadline! - b.deadline!)[0];
  await removeScope(first.id, "all", NOW);
  await topUp(NOW + 7 * DAYMS);
  expect(live().filter((x: Task) => x.title === "Gym")).toHaveLength(0);
});

it("moves record from/to/why, skip dragged ids, and undo restores them", async () => {
  pl.from = 1;
  const r = await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
  const id = live()[0].id;
  const [m] = await loadMoves();
  expect(m).toMatchObject({ id, title: "Read", from: 1, why: [{ key: "stable" }] });
  expect(m.to).toBe(live()[0].start);
  expect(r.moved).toBe(1);
  await r.undo();
  expect(await loadMoves()).toEqual([]);
  pl.from = undefined;
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
  const id2 = live()[0].id;
  await putBack(id2, NOW + 3600_000, NOW + 2000);
  expect([...db.events.values()].some((e) => e.type === "drag" && e.taskId === id2)).toBe(true);
  expect((await loadMoves()).filter((x) => x.at === NOW + 2000)).toEqual([]);
});

it("addRule and removeRule round-trip, pin sets pinned", async () => {
  await addRule({ text: "Tối T6 để trống", days: [5], from: 1080, to: 1440, kinds: [] }, NOW);
  const rules = db.model.rules;
  expect(rules).toHaveLength(1);
  await removeRule(rules[0].id, NOW);
  expect(db.model.rules).toHaveLength(0);
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
  const id = live()[0].id;
  await pin(id, true, NOW);
  expect(db.tasks.get(id).pinned).toBe(true);
  expect(db.tasks.get(id).userEdited).toContain("start");
});

it("a move's cause is the new class over its old slot", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60 }], NOW);
  const read = live()[0], s0 = read.start!;
  const lec: Task = { id: "lec", title: "Tiết bù", kind: "study", source: "dlu", fixed: "lecture", effort: 90, start: s0 - 1800_000, end: s0 + 3600_000, createdAt: NOW };
  await ingest([lec], [], NOW + 1000);
  const m = (await loadMoves()).find((x) => x.id === read.id)!;
  expect(m.from).toBe(s0);
  expect(m.cause).toMatch(/^Vì Tiết bù /);
});
