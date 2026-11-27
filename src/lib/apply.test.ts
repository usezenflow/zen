import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskEvent } from "./types";

const db = vi.hoisted(() => ({ tasks: new Map<string, any>(), events: new Map<string, any>(), kv: new Map<string, string>(), model: null as any }));
vi.mock("./store", () => ({
  allTasks: async () => [...db.tasks.values()],
  putTasks: async (ts: Task[]) => ts.forEach((x) => db.tasks.set(x.id, x)),
  removeTasks: async (ids: string[]) => ids.forEach((i) => db.tasks.delete(i)),
  allEvents: async () => [...db.events.values()],
  keptPlaced: async () => {
    const kept = new Set<string>(), placed = new Map<string, number>();
    for (const e of db.events.values()) {
      if (e.type === "kept") kept.add(e.taskId);
      if (e.type === "placed") placed.set(e.taskId, Math.max(e.at, placed.get(e.taskId) ?? 0));
    }
    return { kept, placed };
  },
  putEvent: async (e: TaskEvent) => void db.events.set(e.id, e),
  removeEvents: async (ids: string[]) => ids.forEach((i) => db.events.delete(i)),
  loadModel: async (now: number) => db.model ?? newModel(now),
  saveModel: async (m: unknown) => void (db.model = m),
  kvGet: async (k: string) => db.kv.get(k) ?? null,
  kvSet: async (k: string, v: string) => void db.kv.set(k, v),
}));

const pl = vi.hoisted(() => ({ from: undefined as number | undefined }));
vi.mock("../planner", async (orig) => {
  const m = await orig<typeof import("../planner")>();
  return { ...m, plan: (...a: Parameters<typeof m.plan>) => { // the planner under test elsewhere; here only stamp `from`
    const r = m.plan(...a);
    if (pl.from !== undefined) r.diff.placed = r.diff.placed.map((p) => ({ ...p, from: pl.from, why: [{ key: "stable" as const, w: 1 }] }));
    return r;
  } };
});

import { previewCreates, addRule, addSitting, addWorked, apply, dropSitting, ingest, keepSweep, lastMore, liveEdit, loadClassMult, makeRoom, needMore, pin, putBack, removeRule, retime, scopeIds, stillMore, swipeDone } from "./apply";
import { newModel } from "../planner";
import { loadMoves } from "./moves";
import { preps } from "../planner/prep";import { partAt, plain, t } from "./i18n";
import { hm } from "./when";
import { holidays } from "./holidays";


const NOW = new Date("2026-11-13T10:00:00").getTime();
const live = () => [...db.tasks.values()].filter((x: Task) => !x.deletedAt);

beforeEach(() => {
  pl.from = undefined; db.tasks.clear(); db.events.clear(); db.kv.clear(); db.model = null;
});

it("addWorked adds minutes and leaves the task open, unplanned", async () => {
  db.tasks.set("w", { id: "w", title: "Ôn", kind: "study", source: "user", effort: 60, createdAt: 0 });
  await Promise.all([addWorked("w", 15), addWorked("w", 15)]);
  const x = db.tasks.get("w");
  expect(x.workedMin).toBe(30);
  expect(x.doneAt).toBeUndefined();
  await addWorked("missing", 15); // no such task: nothing written, no throw
  expect(db.tasks.has("missing")).toBe(false);
});

it("one line becomes several placed tasks, one undo removes all", async () => {
  const r = await apply([
    { op: "create", title: "Gym", kind: "exercise", repeat: "FREQ=WEEKLY;COUNT=3" },
    { op: "create", title: "Essay", kind: "study", effortMinutes: 240, deadline: "2026-11-17T23:00:00" },
  ], NOW);
  const tasks = live();
  expect(tasks.filter((x) => x.title === "Gym")).toHaveLength(3);
  expect(tasks.filter((x) => x.parentId).length).toBeGreaterThan(1); // essay split into sittings
  expect(tasks.filter((x) => !x.parentId && x.title === "Gym").every((x) => x.start !== undefined)).toBe(true);
  expect(r.toast).toMatch(/^Mình đã xếp xong \d+ việc$/); // counts tasks, not sittings
  expect(plain(r.sub!)).toMatch(/^Mình chia Essay thành \d+ buổi$/); // the most-split task names its sittings
  await r.undo();
  expect(db.tasks.size).toBe(0);
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
  expect(JSON.parse(db.kv.get("stats.queue") ?? "[]")).toHaveLength(0); // the undone done's stat row is gone too
});

import { futureDlu, moveMine, removeImported } from "./apply";
import { overlaps, keepBoth, pendingOverlaps } from "./overlap";

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

it("split sittings are a series; the parent goes once no sitting is left, so it is not split again", () => {
  const sit = (id: string, d: number) => T({ id, parentId: "p", start: NOW + d * DAYMS, end: NOW + d * DAYMS + H1 });
  const ts = [T({ id: "p" }), sit("p#1", 1), sit("p#2", 2), sit("p#3", 3)];
  expect(scopeIds(ts, "p#2", "this")).toEqual(["p#2"]);
  expect(scopeIds(ts, "p#2", "following")).toEqual(["p#2", "p#3"]);
  expect(scopeIds(ts, "p#2", "all")).toEqual(["p#1", "p#2", "p#3", "p"]);
  expect(scopeIds([ts[0], { ...ts[1], deletedAt: NOW }, ts[2]], "p#2", "this")).toEqual(["p#2", "p"]);
});

it("ingest keeps what the user did after the sync snapshot: done stays done, a done task is not deleted", async () => {
  const base = T({ id: "d1", source: "dlu", fixed: "lecture", start: NOW + DAYMS, end: NOW + DAYMS + H1 });
  db.tasks.set("d1", { ...base, doneAt: NOW });
  db.tasks.set("d2", { ...base, id: "d2", doneAt: NOW });
  await ingest([{ ...base, title: "renamed" }], ["d2"], NOW);
  expect(db.tasks.get("d1")).toMatchObject({ title: "renamed", doneAt: NOW });
  expect(db.tasks.get("d2").deletedAt).toBeUndefined();
});

it("delete all on a split repeat covers every day, parents and sittings", () => {
  const day = (id: string, d: number, parentId?: string) => T({ id, title: "Giải code", rrule: "FREQ=DAILY", seriesId: "s1", ...(parentId ? { parentId } : {}), start: parentId ? NOW + d * DAYMS : undefined, notBefore: NOW + d * DAYMS });
  const ts = [day("a", 1), day("a#1", 1, "a"), day("a#2", 1, "a"), day("b", 2), day("b#1", 2, "b"), day("b#2", 2, "b"), T({ id: "z", title: "Khác", rrule: "FREQ=DAILY", seriesId: "s2" })];
  expect(scopeIds(ts, "b#1", "all").sort()).toEqual(["a", "a#1", "a#2", "b", "b#1", "b#2"]);
  expect(scopeIds(ts, "b#1", "following").sort()).toEqual(["b", "b#1", "b#2"]);
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
  expect((await loadGone()).series[g.seriesId!]).toBe(0);
  await apply([{ op: "create", title: "Gym", repeat: "FREQ=WEEKLY" }], NOW);
  const g2 = live().find((x: Task) => x.title === "Gym" && !x.deletedAt)!;
  expect(g2.seriesId).not.toBe(g.seriesId); // a fresh series, not under the old one's tombstone
});

it("topUp keeps a daily series 120 days ahead without duplicating days", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", repeat: "FREQ=DAILY" }], NOW);
  const later = NOW + 6 * DAYMS;
  await topUp(later);
  const days = live().filter((x: Task) => x.title === "Read").map((x: Task) => x.deadline!);
  expect(new Set(days).size).toBe(days.length);
  expect(Math.max(...days)).toBeGreaterThanOrEqual(later + 119 * DAYMS);
  const n = days.length;
  expect(await topUp(later)).toBeUndefined();
  expect(live().filter((x: Task) => x.title === "Read")).toHaveLength(n);
});

it("sessions deleted one by one (a said week) are not brought back by topUp", async () => {
  await apply([{ op: "create", title: "Gym", kind: "study", repeat: "FREQ=WEEKLY;BYDAY=MO,WE,FR" }], NOW);
  await topUp(NOW);
  const xs = live().filter((x: Task) => x.title === "Gym").sort((a: Task, b: Task) => (a.deadline ?? 0) - (b.deadline ?? 0));
  const gone = xs.slice(1, 3).map((x: Task) => x.id);
  await apply(gone.map((target: string) => ({ op: "delete" as const, target })), NOW);
  await topUp(NOW + DAYMS);
  const after = live().filter((x: Task) => x.title === "Gym");
  expect(after.some((x: Task) => gone.includes(x.id))).toBe(false);
  // no new session on a deleted one's day
  const dayOf = (x: Task) => Math.floor(((x.deadline ?? 0) - 1) / DAYMS);
  const goneDays = new Set(xs.slice(1, 3).map(dayOf));
  expect(after.filter((x: Task) => goneDays.has(dayOf(x)))).toEqual([]);
});

it("a rename on one occurrence renames the series it shared a name with, and keeps it one series", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", repeat: "FREQ=DAILY" }], NOW);
  const xs = live().filter((x: Task) => x.title === "Read"), n = xs.length;
  await apply([{ op: "edit", target: xs[1].id, title: "Read ch. 4" }], NOW);
  await topUp(NOW + 6 * DAYMS); // no copies as a series of its own
  const all = live().filter((x: Task) => x.seriesId === xs[0].seriesId);
  expect(new Set(all.map((x: Task) => x.deadline)).size).toBe(all.length);
  expect(all.every((x: Task) => x.title === "Read ch. 4")).toBe(true);
  expect(all.length).toBeGreaterThanOrEqual(n);
});

it("an older repeat (no series id) gets one on topUp, and its tombstone moves with it", async () => {
  const day = (k: number) => T({ id: `o${k}`, title: "Gym", source: "user", rrule: "FREQ=DAILY", deadline: NOW + k * DAYMS, notBefore: NOW + (k - 1) * DAYMS });
  for (const k of [1, 2, 3]) db.tasks.set(`o${k}`, day(k));
  db.kv.set("gone", JSON.stringify({ sections: {}, series: { "FREQ=DAILY|Gym": NOW + 3 * DAYMS } }));
  await topUp(NOW);
  const id = db.tasks.get("o1").seriesId;
  expect(id).toBeTruthy();
  expect(["o2", "o3"].every((k) => db.tasks.get(k).seriesId === id)).toBe(true);
  expect((await loadGone()).series[id]).toBe(NOW + 3 * DAYMS);
  expect(live().filter((x: Task) => x.title === "Gym")).toHaveLength(3); // still cut after day 3
});

it("a name on a split task is the task's and every open sitting's", async () => {
  await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 240, deadline: "2026-11-20T23:00:00" }], NOW);
  const p = live().find((x: Task) => x.title === "Essay" && !x.parentId)!;
  await apply([{ op: "edit", target: p.id, title: "Essay v2" }], NOW);
  expect(live().filter((x: Task) => x.id === p.id || x.parentId === p.id).every((x: Task) => x.title === "Essay v2")).toBe(true);
});

it("two topUps at once add each missing day once", async () => {
  await apply([{ op: "create", title: "Run", kind: "other", repeat: "FREQ=DAILY" }], NOW);
  await Promise.all([topUp(NOW + 6 * DAYMS), topUp(NOW + 6 * DAYMS)]);
  const days = live().filter((x: Task) => x.title === "Run").map((x: Task) => x.deadline!);
  expect(new Set(days).size).toBe(days.length);
});

it("topUp adds per-week copies of COUNT=3, stops after a following delete, ignores DLU and finite daily", async () => {
  await apply([{ op: "create", title: "Gym", repeat: "FREQ=WEEKLY;COUNT=3" }, { op: "create", title: "Once", repeat: "FREQ=DAILY;COUNT=2" }], NOW);
  db.tasks.set("d", T({ id: "d", source: "dlu", rrule: "FREQ=WEEKLY", deadline: NOW + DAYMS }));
  await topUp(NOW);
  expect(live().filter((x: Task) => x.title === "Gym" && !x.parentId)).toHaveLength(51); // 3 a week, 17 weeks
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

it("a time set wholly in the past is kept pinned and plans nothing; one reaching past now replans", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
  const id = live()[0].id, planned = db.kv.get("plannedAt");
  const gone = NOW - 3 * 3600_000;
  await apply([{ op: "edit", target: id, when: new Date(gone).toISOString() }], NOW + 1000);
  expect(db.tasks.get(id)).toMatchObject({ holdUntil: expect.any(Number), start: gone, end: gone + 30 * 60_000 }); // a set time holds to its day's end; only "Đừng dời" pins
  expect(db.kv.get("plannedAt")).toBe(planned); // no plan ran
  await apply([{ op: "edit", target: id, when: new Date(NOW - 15 * 60_000).toISOString() }], NOW + 2000); // ends 15 min after now
  expect(db.kv.get("plannedAt")).toBe(String(NOW + 2000));
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
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60, when: new Date(NOW + DAYMS).toISOString() }], NOW); // not today: a task in progress is never moved
  const read = live()[0], s0 = read.start!;
  const lec: Task = { id: "lec", title: "Tiết bù", kind: "study", source: "dlu", fixed: "lecture", effort: 90, start: s0 - 1800_000, end: s0 + 3600_000, createdAt: NOW };
  await ingest([lec], [], NOW + 1000);
  const m = (await loadMoves()).find((x) => x.id === read.id)!;
  expect(m.from).toBe(s0);
  expect(plain(m.cause!)).toMatch(/^Vì trường thêm Tiết bù /);
});

it("a repeat with no said clock keeps no 09:00 start: its occurrences open at the day's start", async () => {
  const d0 = new Date(NOW); d0.setHours(0, 0, 0, 0);
  await apply([{ op: "create", title: "Đọc sách", repeat: "FREQ=DAILY", when: new Date(d0.getTime() + 9 * 3600_000).toISOString(), notBefore: d0.toISOString() }], NOW);
  const reads = live().filter((x: Task) => x.title === "Đọc sách");
  expect(reads.length).toBeGreaterThan(30);
  expect(reads.every((x: Task) => new Date(x.notBefore!).getHours() === 0 && !x.fixed)).toBe(true);
});

it("a repeat puts each occurrence on its own day, with the said clock and due time, and skips left-out weekdays", async () => {
  const d0 = new Date(NOW); d0.setHours(0, 0, 0, 0);
  const day0 = d0.getTime(), at = (d: number, h: number, m = 0) => day0 + d * DAYMS + (h * 60 + m) * 60_000;
  await apply([{ op: "create", title: "Đọc", repeat: "FREQ=DAILY", when: new Date(at(1, 20)).toISOString() }], NOW);
  const reads = live().filter((x: Task) => x.title === "Đọc").sort((a: Task, b: Task) => a.notBefore! - b.notBefore!);
  expect(reads).toHaveLength(114); // the whole 120 days, not a first week, less 1/1 and Giao thừa + Tết mùng 1-4 2027
  const hols = holidays(day0, at(121, 0));
  expect(reads.some((x: Task) => hols.has(new Date(x.notBefore!).setHours(0, 0, 0, 0)))).toBe(false); // a daily routine skips public holidays
  expect(reads.at(-1).deadline).toBeGreaterThanOrEqual(at(120, 0)); // occurrences exist out to day 120; the planner places only the first 30
  expect(reads.slice(0, 7).map((x: Task) => x.notBefore)).toEqual(Array.from({ length: 7 }, (_, i) => at(1 + i, 20)));
  expect(reads.slice(0, 7).map((x: Task) => x.deadline)).toEqual(Array.from({ length: 7 }, (_, i) => at(2 + i, 0)));
  await apply([{ op: "create", title: "Yoga", repeat: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA", deadline: new Date(at(0, 23, 59)).toISOString() }], NOW);
  const yoga = live().filter((x: Task) => x.title === "Yoga");
  expect(yoga.length).toBeGreaterThan(95); // six days a week, less holidays
  expect(yoga.every((x: Task) => new Date(x.deadline!).getDay() !== 0 && new Date(x.deadline!).getHours() === 23)).toBe(true);
  expect(new Set(yoga.map((x: Task) => new Date(x.deadline!).toDateString())).size).toBe(yoga.length);
});

// Plan 1.12: every repeat shape is expanded or flagged, never dropped to one silent task.
describe("repeat shapes", () => {
  const day = (ms?: number) => (ms === undefined ? "" : new Date(ms).toLocaleDateString("sv")); // YYYY-MM-DD, local; notBefore is the occurrence's own start
  const make = async (repeat: string, extra: Partial<Parameters<typeof apply>[0][number]> = {}) => {
    const r = await apply([{ op: "create", title: "Việc", repeat, ...extra }], NOW);
    const own = live().filter((x) => x.rrule === repeat && !x.parentId).sort((a, b) => (a.notBefore ?? 0) - (b.notBefore ?? 0));
    return { r, own, days: own.map((x) => day(x.notBefore)) };
  };
  it("INTERVAL: every other week lands two weeks apart", async () => {
    const { days } = await make("FREQ=WEEKLY;INTERVAL=2", { when: "2026-11-14T08:00:00" });
    expect(days.slice(0, 3)).toEqual(["2026-11-14", "2026-11-28", "2026-12-12"]);
  });
  it("INTERVAL: every other day", async () => {
    const { days } = await make("FREQ=DAILY;INTERVAL=2");
    expect(days.slice(0, 4)).toEqual(["2026-11-13", "2026-11-15", "2026-11-17", "2026-11-19"]);
    expect(days).toHaveLength(57); // 60, less the three holidays it lands on
  });
  it("UNTIL stops the series on that day", async () => {
    const { days, r } = await make("FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261120T235959");
    expect(days).toEqual(["2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20"]);
    expect(r.sub ?? "").not.toMatch(/gần nhất/); // complete, so nothing to flag
  });
  it("MONTHLY with BYMONTHDAY: the 15th of each month, flagged as the next stretch only", async () => {
    const { days, r } = await make("FREQ=MONTHLY;BYMONTHDAY=15", { deadline: "2026-11-15T23:59:00" });
    expect(days.slice(0, 3)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(r.sub).toMatch(/gần nhất/);
  });
  it("BYSETPOS: the first Monday of each month", async () => {
    const { own } = await make("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1", { when: "2026-12-07T08:00:00" });
    expect(own.map((x) => day(x.notBefore)).slice(0, 2)).toEqual(["2026-12-07", "2027-01-04"]);
  });
  it("YEARLY: the next birthday, flagged, not a year of copies", async () => {
    const { days, r } = await make("FREQ=YEARLY;BYMONTH=8;BYMONTHDAY=15", { deadline: "2026-08-15T23:59:00" });
    expect(days).toEqual(["2027-08-15"]);
    expect(r.sub).toMatch(/gần nhất/);
  });
  it("HOURLY: one task per step for the rest of today, flagged", async () => {
    const { own, r } = await make("FREQ=HOURLY;INTERVAL=3;BYHOUR=7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22", { deadline: "2026-11-13T23:59:00" });
    expect(own.map((x) => new Date(x.notBefore!).getHours())).toEqual([10, 13, 16, 19, 22]);
    expect(r.sub).toMatch(/gần nhất/);
  });
  it("an unknown FREQ keeps one task and says so", async () => {
    const { own, r } = await make("FREQ=SECONDLY");
    expect(own).toHaveLength(1);
    expect(r.sub).toMatch(/gần nhất/);
  });
});

describe("said times, edits, replans, causes", () => {
  const day0 = new Date(NOW).setHours(0, 0, 0, 0), clock = (d: number, h: number) => day0 + d * DAYMS + h * H1;
  const iso = (ms: number) => new Date(ms).toISOString();
  const mine = (title: string) => live().filter((x: Task) => x.title === title);

  it("a fixed create stores a busy block and a later create does not move it", async () => {
    await apply([{ op: "create", title: "Gym", kind: "exercise", fixed: "busy", when: iso(clock(2, 18)), effortMinutes: 60 }], NOW);
    const [g] = mine("Gym");
    expect(g).toMatchObject({ fixed: "busy", start: clock(2, 18), end: clock(2, 19), notBefore: undefined, deadline: undefined });
    await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60 }], NOW + 1000);
    expect(db.tasks.get(g.id)).toMatchObject({ start: clock(2, 18), end: clock(2, 19) });
  });

  it("previewCreates places a list's creates and writes nothing", async () => {
    const m = await previewCreates([{ op: "create", ref: "l1", title: "Gym", fixed: "busy", when: iso(clock(2, 18)), effortMinutes: 60 }, { op: "create", ref: "l2", title: "Read", kind: "study", effortMinutes: 60 }], NOW);
    expect(m.get("l1")).toMatchObject({ start: clock(2, 18), end: clock(2, 19) });
    expect(m.get("l2")?.start).toBeGreaterThanOrEqual(NOW);
    expect(live()).toHaveLength(0);
  });

  it("a fixed block without a length takes the model's", async () => {
    await apply([{ op: "create", title: "Gym", kind: "exercise", fixed: "busy", when: iso(clock(2, 18)) }], NOW);
    const [g] = mine("Gym");
    expect(g.end! - g.start!).toBeGreaterThan(0);
  });

  it("a repeating fixed create and its top-up keep the clock", async () => {
    await apply([{ op: "create", title: "Gym", fixed: "busy", repeat: "FREQ=DAILY", when: iso(clock(1, 18)), effortMinutes: 45 }], NOW);
    expect(mine("Gym").every((x: Task) => x.fixed === "busy" && x.start! % DAYMS === mine("Gym")[0].start! % DAYMS)).toBe(true);
    await topUp(NOW + 6 * DAYMS);
    const gym = mine("Gym");
    expect(gym.length).toBeGreaterThan(7);
    expect(new Set(gym.map((x: Task) => dayStartOf(x.start!))).size).toBe(gym.length);
    for (const x of gym) { expect(x.fixed).toBe("busy"); expect(x.start! - dayStartOf(x.start!)).toBe(18 * H1); expect(x.end! - x.start!).toBe(45 * 60_000); }
  });

  it("a repeat keeps its said parts of the day on every occurrence, and a set time clears them", async () => {
    const tods: [number, number][] = [[1020, 1320]];
    await apply([{ op: "create", title: "Giải code", kind: "study", effortMinutes: 60, notBefore: iso(clock(0, 0)), deadline: iso(clock(0, 22)), repeat: "FREQ=DAILY", tods }], NOW);
    const all = mine("Giải code");
    expect(all.length).toBeGreaterThan(1);
    for (const x of all) expect(x.tods).toEqual(tods);
    await apply([{ op: "edit", target: all[0].id, when: iso(clock(1, 9)) }], NOW + 1000);
    expect(db.tasks.get(all[0].id).tods).toBeUndefined();
  });

  it("notAfter is stored on a single create", async () => {
    await apply([{ op: "create", title: "Toán", kind: "study", effortMinutes: 60, notBefore: iso(clock(1, 18)), notAfter: iso(clock(1, 22)) }], NOW);
    expect(mine("Toán")[0].notAfter).toBe(clock(1, 22));
  });

  it("a kind the user corrected is remembered for a title that reads alike", async () => {
    await apply([{ op: "create", title: "Ôn Giải tích", kind: "other", effortMinutes: 60 }], NOW);
    await apply([{ op: "edit", target: mine("Ôn Giải tích")[0].id, kind: "study" }], NOW + 1000);
    expect(mine("Ôn Giải tích")[0].userEdited).toContain("kind");
    await apply([{ op: "create", title: "Ôn Giải tích 2", kind: "other", effortMinutes: 60 }], NOW + 2000);
    expect(mine("Ôn Giải tích 2")[0].kind).toBe("study");
  });

  it("edit fields: location, kind, clearing the deadline", async () => {
    await apply([{ op: "create", title: "Nộp bài", kind: "study", effortMinutes: 30, deadline: iso(clock(3, 12)) }], NOW);
    const id = mine("Nộp bài")[0].id;
    await apply([{ op: "edit", target: id, location: "A1.2", kind: "chores", notAfter: iso(clock(1, 9)) }], NOW + 1000);
    expect(db.tasks.get(id)).toMatchObject({ location: "A1.2", kind: "chores" });
    expect(db.tasks.get(id).notAfter).toBeUndefined();
    expect(db.tasks.get(id).userEdited).toEqual(expect.arrayContaining(["location", "kind"]));
    await apply([{ op: "edit", target: id, deadline: "" }], NOW + 2000);
    expect(db.tasks.get(id).deadline).toBeUndefined();
    expect(db.tasks.get(id).userEdited).toContain("deadline");
  });

  it("only a create, a time, due or length edit, and the explicit asks replan", async () => {
    const r0 = await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
    expect(r0.steps).toBeDefined();
    const id = mine("Read")[0].id;
    for (const a of [{ op: "edit", target: id, title: "Read 2" }, { op: "edit", target: id, note: "n" }, { op: "edit", target: id, location: "x" }, { op: "done", target: id }] as const) {
      db.kv.delete("plannedAt");
      expect((await apply([a], NOW + 5000)).steps).toBeUndefined();
      expect(db.kv.has("plannedAt")).toBe(false);
    }
    await pin(id, true, NOW + 6000);
    expect(db.kv.has("plannedAt")).toBe(false);
    for (const a of [{ op: "edit", target: id, kind: "social" }, { op: "edit", target: id, effortMinutes: 45 }, { op: "edit", target: id, deadline: iso(clock(4, 12)) }, { op: "edit", target: id, deadline: "" }, { op: "edit", target: id, when: iso(clock(2, 9)) }] as const) {
      db.kv.delete("plannedAt");
      expect((await apply([a], NOW + 7000)).steps).toBeDefined();
      expect(db.kv.get("plannedAt")).toBe(String(NOW + 7000));
    }
  });

  it("a done ahead of its block frees time that a waiting task takes; a done after its block frees nothing and plans nothing", async () => {
    db.tasks.set("a", T({ id: "a", title: "A", start: NOW + 2 * H1, end: NOW + 3 * H1, notBefore: NOW + 2 * H1 }));
    db.tasks.set("w", T({ id: "w", title: "W", effort: 60 })); // waiting for a time
    await swipeDone("a", NOW);
    expect(db.tasks.get("w").start).toBeDefined();
    expect(db.kv.get("plannedAt")).toBe(String(NOW));
    db.kv.delete("plannedAt");
    db.tasks.set("b", T({ id: "b", title: "B", start: NOW - 2 * H1, end: NOW - H1 }));
    db.tasks.set("c", T({ id: "c", title: "C", start: NOW + 5 * H1, end: NOW + 6 * H1, notBefore: NOW + 5 * H1 }));
    db.tasks.set("w2", T({ id: "w2", title: "W2", effort: 60 }));
    await swipeDone("b", NOW);
    expect(db.tasks.get("w2").start).toBeUndefined(); // a done after its block frees nothing: no replan at all
    expect(db.kv.get("plannedAt")).toBeUndefined();
    expect(db.tasks.get("c").start).toBe(NOW + 5 * H1); // nothing placed moved
  });

  it("makeRoom plans; a rule and an ingest with nothing new plan nothing", async () => {
    db.tasks.set("f", T({ id: "f", title: "F", fixed: "busy", start: NOW + 2 * H1, end: NOW + 3 * H1 }));
    await addRule({ text: "không tối", days: [], from: 18 * 60, to: 24 * 60, kinds: [] }, NOW);
    expect(db.kv.has("plannedAt")).toBe(false);
    await ingest([], [], NOW);
    expect(db.kv.has("plannedAt")).toBe(false);
    await makeRoom("f", NOW + DAYMS, NOW);
    expect(db.kv.get("plannedAt")).toBe(String(NOW));
  });

  it("causes read from a simulated campus ingest: new, moved, due", async () => {
    await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60, when: iso(NOW + DAYMS) }], NOW);
    const read = mine("Read")[0], s0 = read.start!;
    const lec = (start: number): Task => ({ id: "lec", title: "Tiết bù", kind: "study", source: "dlu", fixed: "lecture", effort: 90, start, end: start + 90 * 60_000, createdAt: NOW });
    await ingest([lec(s0 - 1800_000)], [], NOW + 1000);
    expect(plain((await loadMoves()).find((x) => x.id === read.id)!.cause!)).toMatch(/^Vì trường thêm Tiết bù /);
    const at1 = db.tasks.get(read.id).start!;
    await ingest([lec(at1 - 1800_000)], [], NOW + 2000);
    const m2 = (await loadMoves()).filter((x) => x.id === read.id).at(-1)!;
    expect(m2.from).toBe(at1);
    expect(plain(m2.cause!)).toMatch(/^Vì trường dời Tiết bù sang /);
    // a due-date change by the user (an LMS upsert would look the same to the transaction)
    await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 60, deadline: iso(clock(9, 12)) }], NOW + 3000);
    const es = mine("Essay")[0];
    await apply([{ op: "edit", target: es.id, deadline: iso(es.start! - H1) }], NOW + 4000); // due before its slot: the slot is no longer good
    const m3 = (await loadMoves()).filter((x) => x.id === es.id).at(-1)!;
    expect(plain(m3.cause!)).toMatch(/^Vì hạn Essay đổi sang /);
  });

  it("self marks the user's own moves, not ingest, replan or top-up ones", async () => {
    await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60, when: iso(NOW + DAYMS) }], NOW);
    const read = mine("Read")[0];
    await apply([{ op: "create", title: "Gym", fixed: "busy", when: iso(read.start!), effortMinutes: 60 }], NOW + 1000); // the user's own block lands on it
    const ms = await loadMoves();
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.self === true)).toBe(true);
    db.kv.set("moves", "[]");
    await ingest([T({ id: "lec2", source: "dlu", fixed: "lecture", start: db.tasks.get(read.id).start!, end: db.tasks.get(read.id).start! + H1 })], [], NOW + 2000);
    const m2 = await loadMoves();
    expect(m2.length).toBeGreaterThan(0);
    expect(m2.every((m) => m.self === undefined)).toBe(true);
  });

  it("a user's busy block over a lecture is an overlap; move mine makes it flexible", async () => {
    const lec = T({ id: "l", source: "dlu", fixed: "lecture", start: NOW + 2 * H1, end: NOW + 4 * H1 });
    const busy = T({ id: "b", fixed: "busy", start: NOW + 3 * H1, end: NOW + 4 * H1 });
    expect(overlaps([lec, busy], NOW).map((o) => o.mine.id)).toEqual(["b"]);
    expect(overlaps([lec, T({ id: "p", fixed: "busy", source: "dlu", start: NOW + 3 * H1, end: NOW + 4 * H1 })], NOW)).toEqual([]);
    db.tasks.set("l", lec); db.tasks.set("b", busy);
    await moveMine("b", NOW);
    expect(db.tasks.get("b").fixed).toBeUndefined();
    expect(db.tasks.get("b").start).not.toBe(NOW + 3 * H1);
  });
});
const dayStartOf = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);

it.each([6, 25, 60])("a campus exam %i days out gets its prep split into placed sittings before it", async (days) => {
  const at = NOW + days * DAYMS;
  const exam: Task = { id: "dlu:portal:exam:1", title: "Giải tích 2", kind: "study", source: "dlu", fixed: "exam", effort: 90, start: at, end: at + 90 * 60_000, deadline: at, createdAt: NOW };
  const prep = preps(exam, 0.5)[0];
  await ingest([exam, prep], [], NOW);
  const sits = live().filter((x: Task) => x.parentId === prep.id);
  expect(sits.length).toBeGreaterThan(0);
  expect(sits.every((x: Task) => x.start !== undefined && x.end! <= at)).toBe(true);
});

it("a time set by hand stays put, even one already past, and its length counts", async () => {
  await apply([{ op: "create", title: "Đọc", kind: "study", effortMinutes: 60 }], NOW);
  const id = live()[0].id;
  const past = NOW - 3 * 3600_000;
  await apply([{ op: "edit", target: id, when: new Date(past).toISOString(), effortMinutes: 120 }], NOW);
  expect(db.tasks.get(id)).toMatchObject({ start: past, end: past + 120 * 60_000, holdUntil: expect.any(Number) });
});

const plan = (id: string, start: number, min: number): Task => ({ id, title: id, kind: "study", source: "user", effort: min, createdAt: NOW, start, end: start + min * 60_000 } as Task);
const H = 3600_000;

it("concurrent edits to one task all land", async () => {
  db.tasks.set("a", plan("a", NOW + H, 60));
  await Promise.all([apply([{ op: "edit", target: "a", title: "New" }], NOW), apply([{ op: "edit", target: "a", location: "A2" }], NOW), apply([{ op: "edit", target: "a", note: "n" }], NOW)]);
  expect(db.tasks.get("a")).toMatchObject({ title: "New", location: "A2", note: "n" });
});

it("clearing a place removes it; a short length stays short", async () => {
  db.tasks.set("a", { ...plan("a", NOW + H, 60), location: "A2" });
  await apply([{ op: "edit", target: "a", location: "" }], NOW);
  expect(db.tasks.get("a").location).toBeUndefined();
  await apply([{ op: "edit", target: "a", when: new Date(NOW + 2 * H).toISOString(), effortMinutes: 15 }], NOW);
  expect(db.tasks.get("a").end - db.tasks.get("a").start).toBe(15 * 60_000);
});

it("retime: wheel picks in one session leave only the last one's knock-on moves", async () => {
  db.tasks.set("a", plan("a", NOW + 6 * H, 60));
  db.tasks.set("b", plan("b", NOW + 2 * H, 60));
  void retime("a", NOW + 2 * H, 60, NOW); // passes over b on the way
  await retime("a", NOW + 4 * H, 60, NOW + 1000);
  expect(db.tasks.get("a").start).toBe(NOW + 4 * H);
  expect(db.tasks.get("b").start).toBe(NOW + 2 * H); // b was knocked by the first pick, then put back
});

it("retime: a rename between two picks survives the second pick", async () => {
  db.tasks.set("a", plan("a", NOW + 6 * H, 60));
  await retime("a", NOW + 2 * H, 60, NOW);
  await apply([{ op: "edit", target: "a", title: "Renamed", note: "n" }], NOW + 500);
  await retime("a", NOW + 4 * H, 60, NOW + 1000);
  expect(db.tasks.get("a")).toMatchObject({ title: "Renamed", note: "n", start: NOW + 4 * H });
});

it("a late undo leaves edits made after it alone", async () => {
  db.tasks.set("a", plan("a", NOW + 6 * H, 60));
  const r = await apply([{ op: "edit", target: "a", title: "One" }], NOW);
  await apply([{ op: "edit", target: "a", note: "later" }], NOW + 500);
  await r.undo();
  expect(db.tasks.get("a")).toMatchObject({ title: "One", note: "later" });
});

describe("repeats, splits and deletes (review fixes)", () => {
  const day = (ms?: number) => (ms === undefined ? "" : new Date(ms).toLocaleDateString("sv"));
  const WED = new Date("2026-11-18T08:00:00").getTime();
  const own = (rr: string) => live().filter((x) => x.rrule === rr && !x.parentId).sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0));
  it("every other week Mon and Fri counts calendar weeks, not 7 days from the creation day", async () => {
    await apply([{ op: "create", title: "Việc", repeat: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR" }], WED);
    expect(own("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR").map((x) => day(x.notBefore)).slice(0, 3)).toEqual(["2026-11-20", "2026-11-30", "2026-12-04"]);
  });
  it("saying the same repeat twice makes one series, not two", async () => {
    await apply([{ op: "create", title: "Giải code", repeat: "FREQ=DAILY" }], WED);
    const n = live().length;
    await apply([{ op: "create", title: "giải code", repeat: "FREQ=DAILY" }], WED);
    expect(live().length).toBe(n);
  });
  it("top-up keeps COUNT as a total, on the rule's weekday, due that day", async () => {
    const rr = "FREQ=WEEKLY;BYDAY=MO;COUNT=4";
    await apply([{ op: "create", title: "Việc", repeat: rr }], WED);
    await topUp(WED + 20 * DAYMS);
    await topUp(WED + 40 * DAYMS);
    const xs = own(rr);
    expect(xs.map((x) => day(x.notBefore))).toEqual(["2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"]);
    expect(xs.every((x) => day(x.deadline! - 1) === day(x.notBefore))).toBe(true);
  });
  it("top-up of every other week keeps the two-week step", async () => {
    const rr = "FREQ=WEEKLY;INTERVAL=2";
    await apply([{ op: "create", title: "Việc", repeat: rr }], WED);
    await topUp(WED + 50 * DAYMS);
    const ds = own(rr).map((x) => dayStartOf(x.deadline! - 1));
    expect(ds.length).toBeGreaterThan(3);
    for (let i = 1; i < ds.length; i++) expect(Math.round((ds[i] - ds[i - 1]) / DAYMS)).toBe(14);
  });
  it("deleting a split parent deletes it too, so a replan does not split it again", async () => {
    await apply([{ op: "create", title: "Essay", effortMinutes: 300, deadline: "2026-11-18T23:00:00" }], NOW);
    const parent = [...db.tasks.values()].find((x) => !x.parentId)!;
    expect([...db.tasks.values()].filter((x) => x.parentId === parent.id).length).toBeGreaterThan(1);
    await apply([{ op: "delete", target: parent.id }], NOW + 1000);
    expect(db.tasks.get(parent.id).deletedAt).toBeDefined();
    await apply([{ op: "create", title: "Khác" }], NOW + 2000); // a replan
    expect(live().filter((x) => x.parentId === parent.id)).toEqual([]);
  });
  it("a parent whose sittings are all done or pinned is never re-split over them", async () => {
    await apply([{ op: "create", title: "Essay", effortMinutes: 300, deadline: "2026-11-18T23:00:00" }], NOW);
    const pid = [...db.tasks.values()].find((x) => !x.parentId)!.id, kids = () => [...db.tasks.values()].filter((x) => x.parentId === pid);
    const before = kids().length;
    await swipeDone(`${pid}#1`, NOW + 1); await swipeDone(`${pid}#2`, NOW + 2);
    const done = kids().filter((x) => x.doneAt).map((x) => ({ ...x }));
    const at = new Date("2026-11-18T15:00:00").getTime();
    await apply([{ op: "edit", target: `${pid}#${before}`, when: new Date(at).toISOString() }], NOW + 3);
    const last = db.tasks.get(`${pid}#${before}`);
    expect([last.start, last.end, last.holdUntil !== undefined]).toEqual([at, at + last.effort * 60_000, true]);
    expect(kids()).toHaveLength(before);
    for (const d of done) expect(db.tasks.get(d.id)).toEqual(d); // done sittings untouched
  });
});

it("moving a split task puts its first sitting at the time and plans the rest after, never stacked", async () => {
  await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 240, deadline: "2026-11-20T23:00:00" }], NOW);
  const parent = live().find((x) => x.title === "Essay" && !x.parentId)!;
  const at = new Date("2026-11-16T15:00:00").getTime();
  await apply([{ op: "edit", target: parent.id, when: new Date(at).toISOString() }], NOW);
  const kids = live().filter((x) => x.parentId === parent.id).sort((a, b) => a.start - b.start);
  expect(kids.length).toBeGreaterThan(1);
  expect(kids[0].start).toBe(at);
  for (let i = 1; i < kids.length; i++) expect(kids[i].start).toBeGreaterThanOrEqual(kids[i - 1].end);
});

it("liveEdit saves the value at once with nothing else moved, and replans once it rests", async () => {
  db.tasks.set("a", plan("a", NOW + 6 * H, 60));
  db.tasks.set("b", plan("b", NOW + 2 * H, 60));
  const first = liveEdit("a", { when: NOW + 2 * H }, NOW, 50);
  await new Promise((r) => setTimeout(r, 10));
  expect(db.tasks.get("a").start).toBe(NOW + 2 * H); // a force quit now keeps it
  expect(db.tasks.get("b").start).toBe(NOW + 2 * H); // not moved yet: still mid-edit
  const last = liveEdit("a", { when: NOW + 4 * H }, NOW + 20, 50);
  expect(await first).toBeUndefined(); // taken over
  expect((await last)?.changed).toBe(true);
  expect(db.tasks.get("a").start).toBe(NOW + 4 * H);
  expect(db.tasks.get("b").start).toBe(NOW + 2 * H);
});

it("liveEdit teaches from where the task was before the wheel, and the toast says what it learned", async () => {
  db.tasks.set("z", plan("z", NOW + 6 * H, 60));
  void liveEdit("z", { when: NOW + 7 * H }, NOW, 50); // passes over 7h on the way
  const r = await liveEdit("z", { when: NOW + 8 * H }, NOW + 20, 50);
  const left = (db.model?.left ?? []).map((x: { hour: number }) => x.hour);
  expect(left).toEqual([new Date(NOW + 6 * H).getHours() + new Date(NOW + 6 * H).getMinutes() / 60]); // one drag, from the start, not the held 7h
  expect(r?.sub).toContain(t("learnedAvoid", { time: partAt(new Date(NOW + 6 * H).getHours()) })); // the part, not the clock
});

it("liveEdit holds a due date at once and clears it with ''", async () => {
  db.tasks.set("a", plan("a", NOW + 6 * H, 60));
  const d = new Date("2026-11-20T23:00:00").getTime();
  const r = liveEdit("a", { deadline: d }, NOW, 20);
  await new Promise((x) => setTimeout(x, 5));
  expect(db.tasks.get("a").deadline).toBe(d);
  await r;
  await liveEdit("a", { deadline: "" }, NOW + 10, 20);
  expect(db.tasks.get("a").deadline).toBeUndefined();
});

// "Tập thể dục mỗi sáng" said at 10:30: today's morning has no hour left, so the series starts tomorrow; it runs the whole 120 days,
// and every occurrence is planned on its own day inside the morning (5:00-11:00), never spilled onto the next day.
it("a part-of-day repeat skips a gone today, spans 120 days, and keeps each occurrence on its own day and part", async () => {
  const d0 = new Date(NOW); d0.setHours(0, 0, 0, 0);
  const now = d0.getTime() + 10.5 * 3600_000;
  const day = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  await apply([{ op: "create", title: "Tập", kind: "exercise", effortMinutes: 60, repeat: "FREQ=DAILY", notBefore: new Date(d0.getTime()).toISOString(), tods: [[300, 660]] }], now);
  const xs = live().filter((x: Task) => x.title === "Tập");
  expect(xs.length).toBeGreaterThanOrEqual(113); // 119, less six holidays
  expect(xs.some((x: Task) => day(x.deadline! - 1) === d0.getTime())).toBe(false);
  expect(new Set(xs.map((x: Task) => day(x.deadline! - 1))).size).toBe(xs.length);
  for (const x of xs.filter((x: Task) => x.start !== undefined)) {
    expect(day(x.start!)).toBe(day(x.deadline! - 1));
    const m = (x.start! - day(x.start!)) / 60_000;
    expect(m >= 300 && m + 60 <= 660).toBe(true);
  }
  expect(xs.filter((x: Task) => x.start !== undefined).length).toBeGreaterThanOrEqual(6); // the 7-day horizon: one a day, the rest wait unplaced
});

describe("a guess learns per frame class", () => {
  const code = (o: Partial<Task>) => ({ id: "c1", title: "Code x", kind: "study", source: "user", effort: 180, effortGuessed: true, cls: "code", guessMin: 180, start: NOW, end: NOW + 180 * 60_000, createdAt: NOW, ...o });

  it("a guessed task done at half its guess lowers its class; a said one teaches nothing", async () => {
    db.tasks.set("c1", code({}) as any);
    await apply([{ op: "done", target: "c1" }], NOW + 90 * 60_000);
    expect((await loadClassMult()).code).toBeCloseTo(Math.exp((1 / 4) * Math.log(0.5)), 10); // one sample: n/(n+3) = 1/4 of its log
  });

  it("needing one more sitting raises the class multiplier", async () => {
    await needMore(code({ maxSitting: 90 }) as Task);
    expect((await loadClassMult()).code).toBeGreaterThan(1);
  });

  it("a said length is not a class signal", async () => {
    db.tasks.set("c2", code({ id: "c2", effortGuessed: undefined, guessMin: undefined }) as any);
    await apply([{ op: "done", target: "c2" }], NOW + 90 * 60_000);
    expect(await loadClassMult()).toEqual({});
  });
});

describe("adding and dropping a sitting", () => {
  it("drop gives n-1 open sittings, add gives n of the same length after the last", async () => {
    await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 300, deadline: "2026-11-20T23:00:00" }], NOW);
    const pid = live().find((x: Task) => !x.parentId)!.id;
    const open = () => live().filter((x: Task) => x.parentId === pid).sort((a: Task, b: Task) => Number(a.id.split("#")[1]) - Number(b.id.split("#")[1]));
    const n = open().length, len = open()[n - 1].effort;
    const dropped = await dropSitting(pid, NOW + 1000);
    expect(open()).toHaveLength(n - 1);
    expect(plain(dropped.toast)).toBe("Đã bớt một buổi Essay");
    const added = await addSitting(pid, NOW + 2000);
    expect(open()).toHaveLength(n);
    const last = open()[n - 1];
    expect(last.id).toBe(`${pid}#${n + 1}`);
    expect(last.effort).toBe(len);
    expect(plain(added.toast)).toBe("Đã thêm một buổi Essay");
    expect(added.sub).toBeDefined();
  });
  it("dropping a chosen sitting or adding one spreads the open ones again: one a day, never two bunched", async () => {
    await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 300, deadline: "2026-11-20T23:00:00" }], NOW);
    const pid = live().find((x: Task) => !x.parentId)!.id;
    const open = () => live().filter((x: Task) => x.parentId === pid && !x.doneAt);
    // squeeze every sitting onto the first day, as a stale plan could leave them
    open().forEach((c: Task, i: number) => db.tasks.set(c.id, { ...c, start: NOW + (2 + i) * 3600_000, end: NOW + (2 + i) * 3600_000 + c.effort * 60_000 }));
    const mid = open()[1];
    const r = await dropSitting(pid, NOW + 1000, mid.id);
    expect(db.tasks.get(mid.id).deletedAt).toBeDefined(); // the tapped one goes, not the last
    const days = (xs: Task[]) => new Set(xs.map((x) => new Date(x.start!).toDateString())).size;
    expect(days(open())).toBe(open().length);
    expect(plain(r.sub ?? "")).toMatch(/^Mình chia lại \d+ buổi cho đều$/);
    await addSitting(pid, NOW + 2000);
    expect(days(open())).toBe(open().length);
  });
  it("a series with no due spreads over the 30 days: every added sitting on a day of its own", async () => {
    await apply([{ op: "create", title: "Guitar", kind: "study", effortMinutes: 60 }], NOW);
    const pid = live().find((x: Task) => !x.parentId)!.id;
    await addSitting(pid, NOW + 1000);
    await addSitting(pid, NOW + 2000);
    const sits = live().filter((x: Task) => x.parentId === pid && !x.doneAt && x.start !== undefined);
    expect(sits).toHaveLength(3);
    expect(new Set(sits.map((x: Task) => new Date(x.start!).toDateString())).size).toBe(3);
    const last = Math.max(...sits.map((x: Task) => x.start!));
    expect(last).toBeLessThan(NOW + 30 * 86400_000);
    expect(last).toBeGreaterThan(NOW + 5 * 86400_000); // reaching out into the window, not three days in a row
  });
  it("drop does nothing with one open sitting", async () => {
    await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 60, deadline: "2026-11-20T23:00:00" }], NOW);
    const pid = live().find((x: Task) => !x.parentId)!.id;
    const kids = () => live().filter((x: Task) => x.parentId === pid);
    const n = kids().length;
    await dropSitting(pid, NOW + 1000);
    expect(kids()).toHaveLength(n);
  });
});

describe("Còn nữa on a guessed split task's last sitting", () => {
  const sit = (o: Partial<Task>) => ({ id: "p#1", title: "Code x", kind: "study", source: "user", effort: 60, effortGuessed: true, cls: "code", guessMin: 120, maxSitting: 60, parentId: "p", start: NOW - 3 * H, end: NOW - 2 * H, createdAt: NOW, ...o }) as Task;

  it("shows only on the last sitting once it is done or under way; a said length never", () => {
    const done = sit({ doneAt: NOW - 2 * H });
    const running = sit({ id: "p#2", start: NOW, end: NOW + H });
    const later = sit({ id: "p#3", start: NOW + 5 * H, end: NOW + 6 * H });
    expect(lastMore([done], NOW)).toBe(done);
    expect(lastMore([done, running], NOW + 1000)).toBe(running);
    expect(lastMore([done, running], NOW + 2 * H)).toBeUndefined(); // ended, not ticked
    expect(lastMore([done, later], NOW + 1000)).toBeUndefined(); // the last is still to come
    expect(lastMore([done, running, later], NOW + 1000)).toBeUndefined();
    expect(lastMore([{ ...done, effortGuessed: undefined }], NOW)).toBeUndefined();
    expect(lastMore([{ ...done, cls: undefined }], NOW)).toBeUndefined();
  });

  it("a tap adds one sitting of the same length and raises the class multiplier above 1; undo takes it back", async () => {
    const last = sit({ doneAt: NOW - 2 * H });
    db.tasks.set("p", { id: "p", title: "Code x", kind: "study", source: "user", effort: 120, effortGuessed: true, cls: "code", guessMin: 120, maxSitting: 60, createdAt: NOW } as any);
    db.tasks.set(last.id, last as any);
    const kids = () => live().filter((x: Task) => x.parentId === "p");
    const r = await stillMore(last, NOW);
    expect(kids()).toHaveLength(2);
    const added = kids().find((x: Task) => x.id === "p#2")!;
    expect(added.effort).toBe(60);
    expect(added.doneAt).toBeUndefined();
    expect(plain(r.toast)).toBe("Đã thêm một buổi Code x");
    expect((await loadClassMult()).code).toBeGreaterThan(1);
    await r.undo();
    expect(kids()).toHaveLength(1);
  });

  it("an unsplit guessed task, done: shows, and a tap splits it into the done sitting plus one more", async () => {
    const task = { id: "w", title: "Viết báo cáo", kind: "study", source: "user", effort: 60, effortGuessed: true, cls: "write", guessMin: 60, maxSitting: 60, start: NOW - 3 * H, end: NOW - 2 * H, doneAt: NOW - 2 * H, createdAt: NOW } as Task;
    expect(lastMore([task], NOW)).toBe(task);
    expect(lastMore([{ ...task, effortGuessed: undefined }], NOW)).toBeUndefined(); // said length
    db.tasks.set("w", task as any);
    const kids = () => live().filter((x: Task) => x.parentId === "w");
    const r = await stillMore(task, NOW);
    expect(kids()).toHaveLength(2);
    expect(kids().find((x: Task) => x.id === "w#1")!.doneAt).toBe(NOW - 2 * H);
    expect(kids().find((x: Task) => x.id === "w#2")!).toMatchObject({ effort: 60, doneAt: undefined });
    expect(db.tasks.get("w").doneAt).toBeUndefined(); // the parent is the container now
    expect(plain(r.toast)).toBe("Đã thêm một buổi Viết báo cáo");
    expect((await loadClassMult()).write).toBeGreaterThan(1);
    await r.undo();
    expect(kids()).toHaveLength(0);
  });
});

it("a name, place or note set on one of a repeat reaches every one that still shared it; one renamed alone keeps its own", async () => {
  await apply([{ op: "create", title: "Gym", kind: "exercise", repeat: "FREQ=WEEKLY;COUNT=3", location: "Phòng A" }], NOW);
  const [a, b, c] = live().sort((x, y) => x.start! - y.start!);
  await apply([{ op: "edit", target: a.id, title: "Gym tay", location: "Phòng B", note: "mang nước" }], NOW + 1);
  expect(live().map((x) => [x.title, x.location, x.note])).toEqual(Array(3).fill(["Gym tay", "Phòng B", "mang nước"]));
  const by = (id: string) => db.tasks.get(id) as Task;
  db.tasks.set(a.id, { ...by(a.id), title: "Chạy" }); // one already named apart (an older build, or synced)
  await apply([{ op: "edit", target: b.id, title: "Gym lưng", location: "Phòng C" }], NOW + 5);
  expect([by(a.id).title, by(b.id).title, by(c.id).title]).toEqual(["Chạy", "Gym lưng", "Gym tay"]);
  expect([by(a.id).location, by(b.id).location, by(c.id).location]).toEqual(["Phòng C", "Phòng C", "Phòng C"]);
});

it("a sitting of a split deadline task takes its own name; the others and the whole keep theirs", async () => {
  await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 240, deadline: "2026-11-17T23:00:00" }], NOW);
  const sits = live().filter((x: Task) => x.parentId).sort((x: Task, y: Task) => x.start! - y.start!);
  expect(sits.length).toBeGreaterThan(1);
  await apply([{ op: "edit", target: sits[0].id, title: "Essay: mở bài" }], NOW + 1);
  expect(db.tasks.get(sits[0].id).title).toBe("Essay: mở bài");
  for (const x of sits.slice(1)) expect(db.tasks.get(x.id).title).toBe("Essay");
});

it("a time dragged to start in the past, end ahead, still moves what it clashes with", async () => {
  // flexible planned task across [NOW+10m, NOW+40m); a hand-set one reaching [NOW-30m, NOW+30m)
  db.tasks.set("f", { id: "f", title: "Flex", kind: "study", effortMinutes: 30, start: NOW + 10 * 60_000, end: NOW + 40 * 60_000 });
  await apply([{ op: "create", title: "Mine", kind: "study", effortMinutes: 60 }], NOW);
  const id = live().find((x: Task) => x.title === "Mine")!.id;
  await apply([{ op: "edit", target: id, when: new Date(NOW - 30 * 60_000).toISOString() }], NOW + 1000);
  const mine = db.tasks.get(id), f = db.tasks.get("f");
  expect(mine.start).toBe(NOW - 30 * 60_000);
  expect(f.start >= mine.end || f.end <= mine.start).toBe(true);
});

it("a time dragged to start in the past, end ahead, also moves flexible blocks already running or pinned under it", async () => {
  const M = 60_000;
  db.tasks.set("r", { id: "r", title: "Run", kind: "study", effortMinutes: 30, start: NOW - 10 * M, end: NOW + 20 * M });
  db.tasks.set("p", { id: "p", title: "Pin", kind: "study", effortMinutes: 30, start: NOW + 25 * M, end: NOW + 55 * M, pinned: true, userEdited: ["start"] });
  await apply([{ op: "create", title: "Mine", kind: "study", effortMinutes: 60 }], NOW);
  const id = live().find((x: Task) => x.title === "Mine")!.id;
  await apply([{ op: "edit", target: id, when: new Date(NOW - 30 * M).toISOString() }], NOW + 1000);
  const mine = db.tasks.get(id);
  for (const k of ["r", "p"]) { const f = db.tasks.get(k); expect(f.start >= mine.end || f.end <= mine.start, k).toBe(true); }
});

it("a task waiting for a time takes it when a delete frees none ahead (a past block deleted)", async () => {
  db.tasks.set("w", { id: "w", title: "Gọi điện cho mẹ", kind: "other", source: "user", effort: 60, effortGuessed: true, createdAt: NOW } as Task);
  db.tasks.set("old", { id: "old", title: "Họp", kind: "other", source: "user", effort: 60, start: NOW - 3 * 3600_000, end: NOW - 2 * 3600_000, createdAt: NOW } as Task);
  await removeScope("old", "this", NOW);
  expect(db.tasks.get("w").start).toBeGreaterThanOrEqual(NOW);
});

it("an exam prep's sitting done longer than planned teaches its class, measured against the sitting", async () => {
  const s = (i: number) => ({ id: `prep:e#${i}`, parentId: "prep:e", title: "Ôn thi", kind: "study", source: "user", forId: "e", cls: "exam_review", guessMin: 600,
    effort: 60, start: NOW - (100 + i * 1440) * 60_000, end: NOW - (40 + i * 1440) * 60_000, createdAt: NOW }) as Task;
  for (let i = 0; i < 4; i++) { db.tasks.set(s(i).id, s(i)); await swipeDone(s(i).id, s(i).start! + 90 * 60_000); }
  const m = (await loadClassMult()).exam_review;
  expect(m).toBeGreaterThan(1); // 90 of 60 planned, not 90 of the whole 600
});

it("a drag then undo restores the learned model to what it was before the drag", async () => {
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
  const id = live()[0].id;
  const before = structuredClone(db.model);
  const r = await putBack(id, NOW + 3600_000, NOW + 2000);
  expect(db.model.arms.map((a: { b: number[] }) => a.b)).not.toEqual(before.arms.map((a: { b: number[] }) => a.b)); // the drag taught something
  await r.undo();
  expect(db.model.arms.map((a: { b: number[] }) => a.b)).toEqual(before.arms.map((a: { b: number[] }) => a.b));
  expect(db.model.hist.length).toBe(before.hist.length);
});

it("an order maps refs to the new ids, whatever the order of the batch", async () => {
  await apply([
    { op: "create", title: "Làm bài tập", ref: "l2", after: "l1", effortMinutes: 60 },
    { op: "create", title: "Học toán", ref: "l1", effortMinutes: 60 },
  ], NOW);
  const [a, b] = ["Học toán", "Làm bài tập"].map((x) => live().find((t: Task) => t.title === x)!);
  expect(b.after).toEqual([a.id]);
  expect(a.after).toBeUndefined();
});

it("an order takes an existing task id, and an exam id as forId", async () => {
  await apply([{ op: "create", title: "Thi CSDL", effortMinutes: 60, fixed: "exam", notBefore: "2026-11-20T09:00:00" }], NOW);
  const exam = live().find((t: Task) => t.title === "Thi CSDL")!;
  db.tasks.set(exam.id, { ...exam, fixed: "exam" });
  await apply([{ op: "create", title: "Ôn bài", effortMinutes: 60, after: exam.id, anchor: exam.id }], NOW);
  const ôn = live().find((t: Task) => t.title === "Ôn bài")!;
  expect(ôn.after).toEqual([exam.id]);
  expect(ôn.forId).toBe(exam.id);
});

it("reshapeSeries ends the old days at `from`, goes on on the new ones, keeps them through topUp, and one undo restores it", async () => {
  const { reshapeSeries } = await import("./apply");
  await apply([{ op: "create", title: "Gym", kind: "exercise", effortMinutes: 60, repeat: "FREQ=WEEKLY;BYDAY=MO,WE,FR" }], NOW); // Fri 13
  const gyms = () => live().filter((x: Task) => x.title === "Gym" && !x.parentId);
  const old = gyms()[0], before = gyms().length, from = new Date("2026-11-23T00:00:00").getTime(); // the Monday after next
  const r = await reshapeSeries(old.id, from, "FREQ=WEEKLY;BYDAY=TU,TH", NOW);
  const dow = (x: Task) => new Date(x.deadline! - 1).getDay();
  expect(gyms().filter((x: Task) => x.deadline! <= from).every((x: Task) => [1, 3, 5].includes(dow(x)))).toBe(true);
  const after = gyms().filter((x: Task) => x.deadline! > from);
  expect(after.length).toBeGreaterThan(0);
  expect(after.every((x: Task) => [2, 4].includes(dow(x)) && x.rrule === "FREQ=WEEKLY;BYDAY=TU,TH" && x.effort === 60)).toBe(true);
  await topUp(NOW + 7 * DAYMS);
  expect(gyms().filter((x: Task) => x.rrule === old.rrule && x.deadline! > from)).toHaveLength(0); // the old rule never comes back past `from`
  await r.undo();
  expect(gyms().filter((x: Task) => x.rrule === "FREQ=WEEKLY;BYDAY=TU,TH")).toHaveLength(0);
  expect(gyms().length).toBeGreaterThanOrEqual(before);
});

describe("keep sweep: kept only for a finished, passed slot", () => {
  const H = 3600_000, D = 86400_000;
  const seed = (id: string, o: Partial<Task>, placedAt: number) => {
    db.tasks.set(id, { id, title: id, kind: "study", source: "user", effort: 60, createdAt: NOW - 7 * D, ...o });
    db.events.set(`p-${id}`, { id: `p-${id}`, taskId: id, type: "placed", at: placedAt });
  };
  const keptIds = () => [...db.events.values()].filter((e: TaskEvent) => e.type === "kept").map((e: TaskEvent) => e.taskId);

  it("a future block nobody touched emits no kept event", async () => {
    seed("future", { start: NOW + 3 * H, end: NOW + 4 * H }, NOW - 2 * D);
    await keepSweep(NOW);
    expect(keptIds()).toEqual([]);
  });

  it("an unfinished block whose slot passed emits no kept event", async () => {
    seed("missed", { start: NOW - 5 * H, end: NOW - 4 * H }, NOW - 2 * D);
    await keepSweep(NOW);
    expect(keptIds()).toEqual([]);
  });

  it("a finished block (done near its slot) whose slot passed is kept once", async () => {
    seed("done", { start: NOW - 5 * H, end: NOW - 4 * H, doneAt: NOW - 5 * H + 10 * 60_000 }, NOW - 2 * D);
    await keepSweep(NOW);
    await keepSweep(NOW);
    expect(keptIds()).toEqual(["done"]);
  });

  it("a finished block dragged after placement is not kept", async () => {
    seed("dragged", { start: NOW - 5 * H, end: NOW - 4 * H, doneAt: NOW - 5 * H }, NOW - 2 * D);
    db.events.set("drag-1", { id: "drag-1", taskId: "dragged", type: "drag", at: NOW - 2 * D + H });
    await keepSweep(NOW);
    expect(keptIds()).toEqual([]);
  });
});

import { clearRepeat, dropPrep, splitInto } from "./apply";
describe("move toast chip, quick say and the prep skip", () => {
  const at = (h: number) => new Date(NOW).setHours(h, 0, 0, 0);

  it("Chỉ lần này on a drag across parts keeps the time and takes its learning back", async () => {
    await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
    const id = live()[0].id;
    db.tasks.set(id, { ...db.tasks.get(id), start: at(9), end: at(9) + 30 * 60_000, notBefore: at(9) });
    const before = structuredClone(db.model);
    const r = await putBack(id, at(15), NOW + 2000);
    expect(r.once).toBeDefined();
    expect(db.model.hyps).toEqual([expect.objectContaining({ kind: "study", state: "new" })]);
    await r.once!();
    expect(db.tasks.get(id).start).toBe(at(15)); // the time stays
    expect(db.model.arms.map((a: { b: number[] }) => a.b)).toEqual(before.arms.map((a: { b: number[] }) => a.b));
    expect(db.model.hyps).toEqual([expect.objectContaining({ kind: "study", state: "off" })]);
  });

  it("a drag inside one part offers no Chỉ lần này", async () => {
    await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 30 }], NOW);
    const id = live()[0].id;
    db.tasks.set(id, { ...db.tasks.get(id), start: at(9), end: at(9) + 30 * 60_000, notBefore: at(9) });
    expect((await putBack(id, at(10), NOW + 2000)).once).toBeUndefined();
  });

  it("chia n buổi makes n open sittings in one change; a second call with the same n adds none", async () => {
    await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 120 }], NOW);
    const pid = live().find((x: Task) => !x.parentId)!.id;
    const open = () => live().filter((x: Task) => x.parentId === pid && !x.doneAt);
    const r = await splitInto(pid, 3, NOW + 1000);
    expect(open()).toHaveLength(3);
    expect(plain(r.toast)).toBe("Mình chia Essay thành 3 buổi");
    await splitInto(pid, 3, NOW + 2000);
    expect(open()).toHaveLength(3);
    await splitInto(pid, 2, NOW + 3000);
    expect(open()).toHaveLength(2);
  });

  it("bỏ lặp deletes the open occurrences from this one on, clears the rule on all, keeps this one and the past", async () => {
    await apply([{ op: "create", title: "Gym", kind: "exercise", repeat: "FREQ=WEEKLY;COUNT=3" }], NOW);
    const gyms = () => live().filter((x: Task) => x.title === "Gym").sort((a: Task, b: Task) => a.start! - b.start!);
    const [g0, g1, g2] = gyms();
    expect(g0.rrule).toBeDefined();
    await clearRepeat(g1.id, NOW + 1000);
    expect(gyms().map((x: Task) => x.id)).toEqual([g0.id, g1.id]);
    expect(gyms().every((x: Task) => x.rrule === undefined)).toBe(true);
    expect(db.tasks.get(g2.id).deletedAt).toBeDefined();
  });

  it("Không cần ôn drops the prep and its open sittings for good; one undo brings them back", async () => {
    db.tasks.set("prep:e1", { id: "prep:e1", title: "Ôn Toán", kind: "study", source: "user", effort: 120, forId: "e1", deadline: NOW + 5 * DAYMS, createdAt: NOW } as Task);
    const pid = "prep:e1";
    const r0 = await splitInto(pid, 2, NOW + 1000);
    const open = () => live().filter((x: Task) => x.parentId === pid && !x.doneAt);
    expect(open()).toHaveLength(2);
    const r = await dropPrep(pid, NOW + 2000);
    expect(db.tasks.get(pid).deletedAt).toBeDefined();
    expect(db.tasks.get(pid).userEdited).toContain("deleted");
    expect(open()).toHaveLength(0);
    await r.undo();
    expect(db.tasks.get(pid).deletedAt).toBeUndefined();
    expect(open()).toHaveLength(2);
    expect(r0.toast).toBeDefined();
  });
});

it("a task made longer never overlaps the one placed right after it", async () => {
  const M = 60_000;
  db.tasks.set("a", { id: "a", title: "A", kind: "study", source: "user", effort: 30, start: NOW + 60 * M, end: NOW + 90 * M, createdAt: NOW, userEdited: ["start"], pinned: false, holdUntil: NOW + 24 * 60 * M } as Task);
  db.tasks.set("b", { id: "b", title: "B", kind: "study", source: "user", effort: 30, start: NOW + 90 * M, end: NOW + 120 * M, createdAt: NOW } as Task);
  await apply([{ op: "edit", target: "a", effortMinutes: 90 }], NOW + 1);
  const [a, b] = ["a", "b"].map((id) => db.tasks.get(id) as Task);
  expect(a.end! - a.start!).toBe(90 * M);
  expect(a.end! <= b.start! || b.end! <= a.start!).toBe(true);
});
