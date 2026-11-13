import { learn, outcome, plan, type Opts } from "../planner";
import type { Model } from "../planner";
import { readBusy, syncCalendar } from "./calendar";
import { embed } from "./embed";
import { insight, t } from "./i18n";
import * as stats from "./stats";
import * as store from "./store";
import type { Action, Diff, EventType, Kind, Note, Task, TaskEvent } from "./types";

const DAY = 86400_000;
const HORIZON = 60 * DAY;
const kv: stats.Storage = { get: store.kvGet, set: store.kvSet };
let seq = 0;

/** Queues the anonymous stat row for an outcome the model learns from. */
function stat(m: Model, ev: TaskEvent, task: Task) {
  const o = outcome(m, ev, task);
  if (o) void stats.record(kv, { ...o, kind: task.kind, zeroEdit: ev.type === "kept" || ev.type === "done", at: Math.floor(ev.at / 1000) }).catch(() => {});
}
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dayStart = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
const ms = (iso?: string) => {
  const v = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(v) ? v : undefined;
};

export interface Result { toast: string; changed: boolean; undo: () => Promise<void> }

interface Work {
  tasks: Map<string, Task>;
  model: Model;
  events: TaskEvent[];
  notes: Note[];
  now: number;
  toast?: string;
  log(type: EventType, task: Task, data?: TaskEvent["data"]): void;
}

/** Expands a simple rrule into occurrences; the planner places each one. */
function occurrences(rrule: string | undefined, now: number): { notBefore?: number; deadline?: number }[] {
  if (!rrule) return [{}];
  const p = Object.fromEntries(rrule.split(";").map((kv) => kv.split("=")));
  const count = Number(p.COUNT);
  if (p.FREQ === "DAILY") {
    const n = Math.min(Number.isFinite(count) && count > 0 ? count : 7, 30);
    return Array.from({ length: n }, (_, i) => ({ notBefore: Math.max(now, dayStart(now) + i * DAY), deadline: dayStart(now) + (i + 1) * DAY }));
  }
  if (p.FREQ === "WEEKLY") {
    const n = Math.min(Number.isFinite(count) && count > 0 ? count : 1, 7);
    return Array.from({ length: n }, () => ({ deadline: dayStart(now) + 7 * DAY }));
  }
  return [{}];
}

/** Resolves an id the model gave; a split parent resolves to its sittings. */
function targets(w: Work, id?: string): Task[] {
  const task = id ? w.tasks.get(id) : undefined;
  if (!task) return [];
  const kids = [...w.tasks.values()].filter((c) => c.parentId === task.id && !c.doneAt && !c.deletedAt);
  return kids.length ? kids : [task];
}

async function act(w: Work, a: Action) {
  const { now } = w;
  if (a.op === "note") {
    const text = (a.title ?? "").trim();
    if (text) { w.notes.push({ id: uid(), text, at: now }); w.toast = t("noted"); }
    return;
  }
  if (a.op === "create") {
    const title = a.title?.trim();
    if (!title) return;
    const vec = await embed(title).catch(() => undefined);
    const when = ms(a.when);
    for (const o of occurrences(a.repeat, now)) {
      const task: Task = {
        id: uid(), title, vec, kind: a.kind ?? "other", source: "user", effort: a.effortMinutes ?? 0, createdAt: now,
        deadline: ms(a.deadline) ?? o.deadline, notBefore: when ?? o.notBefore,
      };
      w.tasks.set(task.id, task);
    }
    w.toast = t("added", { title });
    return;
  }
  for (const tk of targets(w, a.target)) {
    if (a.op === "done") {
      const next = { ...tk, doneAt: now };
      w.tasks.set(tk.id, next);
      w.log("done", next);
      const p = tk.parentId && w.tasks.get(tk.parentId);
      if (p && ![...w.tasks.values()].some((c) => c.parentId === p.id && !c.doneAt && !c.deletedAt)) w.tasks.set(p.id, { ...p, doneAt: now });
      w.toast = t("done");
    } else if (a.op === "delete") {
      w.tasks.set(tk.id, { ...tk, deletedAt: now });
      w.log("delete", tk);
      w.toast = t("deleted", { title: tk.title });
    } else if (a.op === "edit") {
      const when = ms(a.when);
      const edited = new Set(tk.userEdited);
      const next: Task = { ...tk };
      if (a.title) { next.title = a.title; edited.add("title"); }
      if (a.effortMinutes) { next.effort = a.effortMinutes; edited.add("effort"); }
      if (a.kind) next.kind = a.kind as Kind;
      const dl = ms(a.deadline);
      if (dl) { next.deadline = dl; edited.add("deadline"); }
      if (when !== undefined) {
        next.notBefore = when;
        next.start = when;
        next.end = when + Math.max(30, tk.effort || 30) * 60_000;
        w.log("drag", tk, { fromStart: tk.start, toStart: when });
        w.toast = t("moved", { title: next.title, time: hhmm(when) });
      }
      next.userEdited = [...edited];
      w.tasks.set(tk.id, next);
      w.log("edit", next);
    }
  }
}

/** Runs one mutation, optionally replans, mirrors to the calendar and persists. One call is one undo group. */
async function transact(now: number, mutate: (w: Work) => Promise<void> | void, o: { replan?: boolean; plan?: Opts; text?: (d: Diff | undefined, w: Work) => string | undefined } = {}): Promise<Result> {
  const model0 = await store.loadModel(now);
  const before = new Map((await store.allTasks()).map((x) => [x.id, x]));
  const w: Work = {
    tasks: new Map(before), model: model0, events: [], notes: [], now,
    log(type, task, data) {
      const ev: TaskEvent = { id: uid(), taskId: task.id, type, at: now, data };
      w.events.push(ev);
      stat(w.model, ev, task);
      w.model = learn(w.model, ev, task);
    },
  };
  await mutate(w);

  let diff: Diff | undefined;
  if (o.replan !== false) {
    const busy = await readBusy(now, now + HORIZON);
    const r = plan([...w.tasks.values()], busy, w.model, now, o.plan);
    diff = r.diff;
    w.model = r.model;
    for (const pl of diff.placed) {
      let task = w.tasks.get(pl.id);
      if (!task) {
        const parent = w.tasks.get(diff.split.find((s) => s.ids.includes(pl.id))?.parentId ?? "");
        if (!parent) continue;
        task = { ...parent, id: pl.id, parentId: parent.id, calendarEventId: undefined, userEdited: undefined, doneAt: undefined };
        w.tasks.set(parent.id, { ...parent, start: undefined, end: undefined });
      }
      w.tasks.set(pl.id, { ...task, start: pl.start, end: pl.end, effort: Math.round((pl.end - pl.start) / 60_000) });
      w.events.push({ id: uid(), taskId: pl.id, type: "placed", at: now, data: { policy: pl.policy, arm: pl.arm, x: pl.x, otherStart: pl.otherStart } });
    }
  }

  const cal = await syncCalendar([...w.tasks.values()]);
  for (const [id, ev] of Object.entries(cal)) {
    const tk = w.tasks.get(id);
    if (tk) w.tasks.set(id, { ...tk, calendarEventId: ev ?? undefined });
  }

  const changed = [...w.tasks.values()].filter((x) => before.get(x.id) !== x);
  await store.putTasks(changed);
  for (const n of w.notes) await store.putNote(n);
  for (const e of w.events) await store.putEvent(e);
  await store.saveModel(w.model);

  const toast = o.text?.(diff, w) ?? (diff?.insight ? insight(diff.insight.template, diff.insight.vars) : w.toast) ?? t("nothing");
  return {
    toast,
    changed: changed.length > 0,
    async undo() {
      const gone = changed.filter((x) => !before.has(x.id));
      const restored = changed.filter((x) => before.has(x.id)).map((x) => before.get(x.id)!);
      await store.removeTasks(gone.map((x) => x.id));
      await store.putTasks(restored);
      await store.removeNotes(w.notes.map((n) => n.id));
      await store.removeEvents(w.events.map((e) => e.id));
      await store.saveModel(model0);
      const fix = await syncCalendar([...gone.map((x) => ({ ...x, deletedAt: now })), ...restored]);
      const patched = restored.filter((x) => x.id in fix).map((x) => ({ ...x, calendarEventId: fix[x.id] ?? undefined }));
      await store.putTasks(patched);
    },
  };
}

/** One spoken line: all actions, one plan, one undo. */
export function apply(actions: Action[], now = Date.now()): Promise<Result> {
  return transact(now, async (w) => { for (const a of actions) await act(w, a); }, {
    text: (d, w) => {
      const created = d?.placed.length && actions.some((a) => a.op === "create");
      if (created && d.placed.length > 1) return t("planned", { n: d.placed.length, d: new Set(d.placed.map((p) => dayStart(p.start))).size });
      return d?.insight ? insight(d.insight.template, d.insight.vars) : w.toast;
    },
  });
}

export const swipeDone = (id: string, now = Date.now()) => transact(now, (w) => act(w, { op: "done", target: id }), { replan: false });
export const swipeLater = (id: string, now = Date.now()) =>
  transact(now, (w) => { const tk = w.tasks.get(id); if (tk) w.log("later", tk); w.toast = t("later"); }, { plan: { later: id } });

/** Starts the suggested gap task now. */
export const take = (id: string, start: number, end: number, now = Date.now()) =>
  transact(now, (w) => { const tk = w.tasks.get(id); if (tk) w.tasks.set(id, { ...tk, start, end, notBefore: start, userEdited: [...(tk.userEdited ?? []), "start"] }); w.toast = t("moved", { title: tk?.title ?? "", time: hhmm(start) }); }, { replan: false });

/** Replan with no edits (morning, sync). */
export function replan(now = Date.now(), toast?: (d: Diff) => string | undefined) {
  return transact(now, () => {}, { text: (d) => (d && toast ? toast(d) : undefined) });
}

/** Applies upstream upserts and soft deletes, replans, and reports moved tasks. */
export function ingest(upserts: Task[], deletes: string[], now = Date.now()) {
  return transact(now, (w) => {
    for (const u of upserts) w.tasks.set(u.id, u);
    for (const id of deletes) { const x = w.tasks.get(id); if (x) w.tasks.set(id, { ...x, deletedAt: now }); }
  }, { text: (d) => (d?.displaced.length ? t("synced", { n: d.displaced.length }) : t("syncedNew")) });
}

/** Marks tasks placed over a day ago and still in place as kept. */
export async function keepSweep(now = Date.now()) {
  const [tasks, events] = [await store.allTasks(), await store.allEvents()];
  const kept = new Set(events.filter((e) => e.type === "kept").map((e) => e.taskId));
  const placed = new Map(events.filter((e) => e.type === "placed").map((e) => [e.taskId, e.at]));
  const due = tasks.filter((x) => !x.doneAt && !x.deletedAt && x.start !== undefined && x.start > now && !kept.has(x.id) && (placed.get(x.id) ?? now) <= now - DAY);
  if (!due.length) return;
  const model = await store.loadModel(now);
  let m = model;
  for (const x of due) {
    const ev: TaskEvent = { id: uid(), taskId: x.id, type: "kept", at: now };
    stat(m, ev, x);
    m = learn(m, ev, x);
    await store.putEvent(ev);
  }
  await store.saveModel(m);
}

/** The task to show now: in progress, else next upcoming sitting. */
export function pickNow(tasks: Task[], now: number): Task | undefined {
  const live = tasks.filter((x) => !x.doneAt && !x.deletedAt && x.start !== undefined && x.end !== undefined && !tasks.some((c) => c.parentId === x.id));
  return live.find((x) => x.start! <= now && now < x.end!) ?? live.filter((x) => x.start! > now).sort((a, b) => a.start! - b.start!)[0];
}
