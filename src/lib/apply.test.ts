import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { preps } from "../planner/prep";

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
  await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60, when: new Date(NOW + DAYMS).toISOString() }], NOW); // not today: a task in progress is never moved
  const read = live()[0], s0 = read.start!;
  const lec: Task = { id: "lec", title: "Tiết bù", kind: "study", source: "dlu", fixed: "lecture", effort: 90, start: s0 - 1800_000, end: s0 + 3600_000, createdAt: NOW };
  await ingest([lec], [], NOW + 1000);
  const m = (await loadMoves()).find((x) => x.id === read.id)!;
  expect(m.from).toBe(s0);
  expect(m.cause).toMatch(/^Vì trường thêm Tiết bù /);
});

it("a repeat puts each occurrence on its own day, with the said clock and due time, and skips left-out weekdays", async () => {
  const d0 = new Date(NOW); d0.setHours(0, 0, 0, 0);
  const day0 = d0.getTime(), at = (d: number, h: number, m = 0) => day0 + d * DAYMS + (h * 60 + m) * 60_000;
  await apply([{ op: "create", title: "Đọc", repeat: "FREQ=DAILY", when: new Date(at(1, 20)).toISOString() }], NOW);
  const reads = live().filter((x: Task) => x.title === "Đọc").sort((a: Task, b: Task) => a.notBefore! - b.notBefore!);
  expect(reads.map((x: Task) => x.notBefore)).toEqual(Array.from({ length: 7 }, (_, i) => at(1 + i, 20)));
  expect(reads.map((x: Task) => x.deadline)).toEqual(Array.from({ length: 7 }, (_, i) => at(2 + i, 0)));
  await apply([{ op: "create", title: "Yoga", repeat: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR,SA", deadline: new Date(at(0, 23, 59)).toISOString() }], NOW);
  const yoga = live().filter((x: Task) => x.title === "Yoga");
  expect(yoga.length).toBe(6);
  expect(yoga.every((x: Task) => new Date(x.deadline!).getDay() !== 0 && new Date(x.deadline!).getHours() === 23)).toBe(true);
  expect(new Set(yoga.map((x: Task) => new Date(x.deadline!).toDateString())).size).toBe(6);
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
    expect(days).toEqual(["2026-11-13", "2026-11-15", "2026-11-17", "2026-11-19"]);
  });
  it("UNTIL stops the series on that day", async () => {
    const { days, r } = await make("FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261120T235959");
    expect(days).toEqual(["2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20"]);
    expect(r.sub ?? "").not.toMatch(/gần nhất/); // complete, so nothing to flag
  });
  it("MONTHLY with BYMONTHDAY: the 15th of each month, flagged as the next stretch only", async () => {
    const { days, r } = await make("FREQ=MONTHLY;BYMONTHDAY=15", { deadline: "2026-11-15T23:59:00" });
    expect(days).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
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
    for (const a of [{ op: "edit", target: id, title: "Read 2" }, { op: "edit", target: id, kind: "social" }, { op: "edit", target: id, note: "n" }, { op: "edit", target: id, location: "x" }, { op: "done", target: id }] as const) {
      db.kv.delete("plannedAt");
      expect((await apply([a], NOW + 5000)).steps).toBeUndefined();
      expect(db.kv.has("plannedAt")).toBe(false);
    }
    await pin(id, true, NOW + 6000);
    expect(db.kv.has("plannedAt")).toBe(false);
    for (const a of [{ op: "edit", target: id, effortMinutes: 45 }, { op: "edit", target: id, deadline: iso(clock(4, 12)) }, { op: "edit", target: id, deadline: "" }, { op: "edit", target: id, when: iso(clock(2, 9)) }] as const) {
      db.kv.delete("plannedAt");
      expect((await apply([a], NOW + 7000)).steps).toBeDefined();
      expect(db.kv.get("plannedAt")).toBe(String(NOW + 7000));
    }
  });

  it("causes read from a simulated campus ingest: new, moved, due", async () => {
    await apply([{ op: "create", title: "Read", kind: "study", effortMinutes: 60, when: iso(NOW + DAYMS) }], NOW);
    const read = mine("Read")[0], s0 = read.start!;
    const lec = (start: number): Task => ({ id: "lec", title: "Tiết bù", kind: "study", source: "dlu", fixed: "lecture", effort: 90, start, end: start + 90 * 60_000, createdAt: NOW });
    await ingest([lec(s0 - 1800_000)], [], NOW + 1000);
    expect((await loadMoves()).find((x) => x.id === read.id)!.cause).toMatch(/^Vì trường thêm Tiết bù /);
    const at1 = db.tasks.get(read.id).start!;
    await ingest([lec(at1 - 1800_000)], [], NOW + 2000);
    const m2 = (await loadMoves()).filter((x) => x.id === read.id).at(-1)!;
    expect(m2.from).toBe(at1);
    expect(m2.cause).toMatch(/^Vì trường dời Tiết bù sang /);
    // a due-date change by the user (an LMS upsert would look the same to the transaction)
    await apply([{ op: "create", title: "Essay", kind: "study", effortMinutes: 60, deadline: iso(clock(9, 12)) }], NOW + 3000);
    const es = mine("Essay")[0];
    await apply([{ op: "edit", target: es.id, deadline: iso(es.start! - H1) }], NOW + 4000); // due before its slot: the slot is no longer good
    const m3 = (await loadMoves()).filter((x) => x.id === es.id).at(-1)!;
    expect(m3.cause).toMatch(/^Vì hạn Essay đổi sang /);
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
  expect(db.tasks.get(id)).toMatchObject({ start: past, end: past + 120 * 60_000, pinned: true });
});
