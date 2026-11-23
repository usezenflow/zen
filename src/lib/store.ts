import * as SQLite from "expo-sqlite";
import { migrateModel, newModel, type Model } from "../planner";
import { upgradePrior } from "../planner/linucb";
import type { Task, TaskEvent } from "./types";
import { DIM, embed } from "./nlu/embed";

let db: Promise<SQLite.SQLiteDatabase> | undefined;

// Stored vectors (tasks, model history and efforts) are embed() of this version. Older ones (the hashed 256-dim bag) are
// recomputed or dropped once, at open, so no cosine compares two embeddings.
const VEC_VERSION = `embed${DIM}`;
async function migrateVecs(d: SQLite.SQLiteDatabase) {
  const v = await d.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key='vec.version'");
  if (v?.value === VEC_VERSION) return;
  await d.withTransactionAsync(async () => {
    const rows = await d.getAllAsync<{ id: string; title: string }>("SELECT id, title FROM tasks");
    for (const r of rows) {
      const vec = embed(r.title);
      await d.runAsync("UPDATE tasks SET vec=? WHERE id=?", [new Uint8Array(vec.buffer), r.id]);
    }
    const m = await d.getFirstAsync<{ json: string }>("SELECT json FROM model WHERE key='planner'");
    if (m) {
      const j = JSON.parse(m.json);
      const alike = (e: { vec?: number[] }) => e.vec?.length === DIM;
      j.hist = (j.hist ?? []).filter(alike);
      j.efforts = (j.efforts ?? []).filter(alike);
      await d.runAsync("UPDATE model SET json=? WHERE key='planner'", [JSON.stringify(j)]);
    }
    await d.runAsync("INSERT OR REPLACE INTO kv(key,value) VALUES('vec.version',?)", [VEC_VERSION]);
  });
}

const open = () =>
  (db ??= (async () => {
    const d = await SQLite.openDatabaseAsync("zen.db");
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT, vec BLOB, kind TEXT, effort REAL,
        deadline REAL, notBefore REAL, rrule TEXT, start REAL, "end" REAL, doneAt REAL, meta TEXT); -- older installs also have an unused calendarEventId column
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, taskId TEXT, type TEXT, at REAL, data TEXT);
      CREATE TABLE IF NOT EXISTS model(key TEXT PRIMARY KEY, json TEXT);
      CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);`);
    await migrateVecs(d);
    return d;
  })().catch((e) => { db = undefined; throw e; })); // a failed open must not be cached for good

type Row = Record<string, any>;
// Every task write refreshes the widgets and reminders, including background sync. Lazy: widgets imports apply, which imports this file.
const widgets = () => {
  void import("./widgets").then((m) => m.pushWidgets()).catch(() => {});
  void import("./reminders").then((m) => m.pushReminders()).catch(() => {});
};
const nul = <T,>(v: T | null): T | undefined => (v === null ? undefined : v);

const toRow = (t: Task) => {
  const { id, title, vec, kind, effort, deadline, notBefore, rrule, start, end, doneAt, ...meta } = t;
  return [
    id, title, vec ? new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength) : null, kind, effort,
    deadline ?? null, notBefore ?? null, rrule ?? null, start ?? null, end ?? null, doneAt ?? null,
    JSON.stringify(meta),
  ];
};

const fromRow = (r: Row): Task => ({
  ...JSON.parse(r.meta),
  id: r.id, title: r.title, kind: r.kind, effort: r.effort,
  vec: r.vec ? new Float32Array(new Uint8Array(r.vec).buffer) : undefined,
  deadline: nul(r.deadline), notBefore: nul(r.notBefore), rrule: nul(r.rrule), start: nul(r.start), end: nul(r.end),
  doneAt: nul(r.doneAt),
});

// Read and parsed once until the next write (a cold start reads it ~15 times). Each caller gets its own copies, as from a fresh read.
let tasksCache: Task[] | undefined, tasksGen = 0;
const dropTasks = () => { tasksGen++; tasksCache = undefined; };
export async function allTasks(): Promise<Task[]> {
  if (!tasksCache) {
    const g = tasksGen, rows = (await (await open()).getAllAsync<Row>("SELECT * FROM tasks")).map(fromRow);
    if (g !== tasksGen) return rows; // a write landed mid-read: don't keep what may predate it
    tasksCache = rows;
  }
  return tasksCache.map((x) => ({ ...x }));
}

// withTransactionAsync is not exclusive: two writes at once (a sync and an edit) nest BEGINs on the one connection. Queue them.
let writing: Promise<unknown> = Promise.resolve();
export async function putTasks(ts: Task[]) {
  const d = await open();
  dropTasks();
  const run = writing.catch(() => {}).then(() => d.withTransactionAsync(async () => {
    for (const t of ts) {
      await d.runAsync(
        `INSERT OR REPLACE INTO tasks(id,title,vec,kind,effort,deadline,notBefore,rrule,start,"end",doneAt,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        toRow(t) as SQLite.SQLiteBindValue[],
      );
    }
  }));
  writing = run;
  try { await run; } finally { dropTasks(); }
  widgets();
}

export async function removeTasks(ids: string[]) {
  const d = await open();
  dropTasks();
  try { for (const id of ids) await d.runAsync("DELETE FROM tasks WHERE id=?", [id]); } finally { dropTasks(); }
  widgets();
}

/** The last `at` of each task's "kept" and "placed" events: the keep sweep's whole need, without parsing every event's data. */
export async function keptPlaced(): Promise<{ kept: Set<string>; placed: Map<string, number> }> {
  const rows = await (await open()).getAllAsync<Row>("SELECT taskId, type, MAX(at) at FROM events WHERE type IN ('kept','placed') GROUP BY taskId, type");
  return { kept: new Set(rows.filter((r) => r.type === "kept").map((r) => r.taskId)), placed: new Map(rows.filter((r) => r.type === "placed").map((r) => [r.taskId, r.at])) };
}
export async function allEvents(taskId?: string): Promise<TaskEvent[]> {
  const d = await open();
  const rows = taskId
    ? await d.getAllAsync<Row>("SELECT * FROM events WHERE taskId=? ORDER BY at", [taskId])
    : await d.getAllAsync<Row>("SELECT * FROM events ORDER BY at");
  return rows.map((r) => ({ id: r.id, taskId: r.taskId, type: r.type, at: r.at, data: r.data ? JSON.parse(r.data) : undefined }));
}
export async function putEvent(e: TaskEvent) {
  await (await open()).runAsync("INSERT OR REPLACE INTO events(id,taskId,type,at,data) VALUES(?,?,?,?,?)", [e.id, e.taskId, e.type, e.at, e.data ? JSON.stringify(e.data) : null]);
}
export async function removeEvents(ids: string[]) {
  const d = await open();
  for (const id of ids) await d.runAsync("DELETE FROM events WHERE id=?", [id]);
}

// The model is ~500 KB of JSON: parse once. Callers must treat it as immutable (plan and learn clone).
let cached: Model | undefined;
export async function loadModel(now: number): Promise<Model> {
  if (cached) return cached;
  const r = await (await open()).getFirstAsync<Row>("SELECT json FROM model WHERE key='planner'");
  if (!r) return newModel(now);
  const m: Model = migrateModel(JSON.parse(r.json));
  upgradePrior(m);
  return (cached = m);
}
export async function saveModel(m: Model) {
  await (await open()).runAsync("INSERT OR REPLACE INTO model(key,json) VALUES('planner',?)", [JSON.stringify(m)]);
  cached = m;
}

export async function kvGet(key: string): Promise<string | null> {
  return (await (await open()).getFirstAsync<Row>("SELECT value FROM kv WHERE key=?", [key]))?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  await (await open()).runAsync("INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)", [key, value]);
}
