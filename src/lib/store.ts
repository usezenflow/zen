import * as SQLite from "expo-sqlite";
import { newModel, type Model } from "../planner";
import type { Note, Task, TaskEvent } from "./types";

let db: Promise<SQLite.SQLiteDatabase> | undefined;

const open = () =>
  (db ??= (async () => {
    const d = await SQLite.openDatabaseAsync("zen.db");
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, title TEXT, vec BLOB, kind TEXT, effort REAL,
        deadline REAL, notBefore REAL, rrule TEXT, start REAL, "end" REAL, doneAt REAL, meta TEXT); -- older installs also have an unused calendarEventId column
      CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY, text TEXT, at REAL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, taskId TEXT, type TEXT, at REAL, data TEXT);
      CREATE TABLE IF NOT EXISTS model(key TEXT PRIMARY KEY, json TEXT);
      CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);`);
    return d;
  })());

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

export async function allTasks(): Promise<Task[]> {
  return (await (await open()).getAllAsync<Row>("SELECT * FROM tasks")).map(fromRow);
}

export async function putTasks(ts: Task[]) {
  const d = await open();
  await d.withTransactionAsync(async () => {
    for (const t of ts) {
      await d.runAsync(
        `INSERT OR REPLACE INTO tasks(id,title,vec,kind,effort,deadline,notBefore,rrule,start,"end",doneAt,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        toRow(t) as SQLite.SQLiteBindValue[],
      );
    }
  });
  widgets();
}

export async function removeTasks(ids: string[]) {
  const d = await open();
  for (const id of ids) await d.runAsync("DELETE FROM tasks WHERE id=?", [id]);
  widgets();
}

export async function allNotes(): Promise<Note[]> {
  return (await open()).getAllAsync<Note>("SELECT id,text,at FROM notes ORDER BY at DESC");
}
export async function putNote(n: Note) {
  await (await open()).runAsync("INSERT OR REPLACE INTO notes(id,text,at) VALUES(?,?,?)", [n.id, n.text, n.at]);
}
export async function removeNotes(ids: string[]) {
  const d = await open();
  for (const id of ids) await d.runAsync("DELETE FROM notes WHERE id=?", [id]);
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

export async function loadModel(now: number): Promise<Model> {
  const r = await (await open()).getFirstAsync<Row>("SELECT json FROM model WHERE key='planner'");
  return r ? JSON.parse(r.json) : newModel(now);
}
export async function saveModel(m: Model) {
  await (await open()).runAsync("INSERT OR REPLACE INTO model(key,json) VALUES('planner',?)", [JSON.stringify(m)]);
}

export async function kvGet(key: string): Promise<string | null> {
  return (await (await open()).getFirstAsync<Row>("SELECT value FROM kv WHERE key=?", [key]))?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  await (await open()).runAsync("INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)", [key, value]);
}
