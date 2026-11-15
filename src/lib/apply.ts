import { titleVec } from "./nlu/vec";
import { learn, outcome, plan, type Model, type Opts } from "../planner";
import { cosine, effort } from "../planner/habits";
import { fill, t } from "./i18n";
import { when as at12 } from "./when";
import * as stats from "./stats";
import * as store from "./store";
import { recordMoves, saveWarn, seeMoves } from "./moves";
import type { Action, Diff, EventType, Gone, Kind, Move, Note, Notice, Rule, Step, Task, TaskEvent, Warn } from "./types";

const DAY = 86400_000;
const kv: stats.Storage = { get: store.kvGet, set: store.kvSet };
let seq = 0;

/** Queues the anonymous stat row for an outcome the model learns from. */
function stat(m: Model, ev: TaskEvent, task: Task) {
  const o = outcome(m, ev, task);
  if (o) void stats.record(kv, { ...o, kind: task.kind, zeroEdit: ev.type === "kept" || ev.type === "done", at: Math.floor(ev.at / 1000) }).catch(() => {});
}
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dayStart = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
const ms = (iso?: string) => {
  const v = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(v) ? v : undefined;
};

export interface Result { toast: string; sub?: string; changed: boolean; undo: () => Promise<void>; steps?: Step[]; warn?: Warn[]; moved?: number }

interface Work {
  tasks: Map<string, Task>;
  model: Model;
  events: TaskEvent[];
  notes: Note[];
  now: number;
  toast?: string;
  sub?: string;
  short?: boolean; // a repeat was only partly expanded
  moves: Move[];
  log(type: EventType, task: Task, data?: TaskEvent["data"]): void;
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const rule = (rrule: string) => Object.fromEntries(rrule.split(";").map((kv) => kv.split("="))) as Record<string, string | undefined>;
/** Weekdays a rule keeps (JS getDay), or undefined for every day. */
const daysOf = (p: Record<string, string | undefined>) => p.BYDAY?.split(",").map((d) => BYDAY.indexOf(d.slice(-2))).filter((d) => d >= 0);
/** Day-by-day rules: DAILY, or any rule naming weekdays ("thứ 2 hàng tuần", "ngày thường", "mỗi ngày trừ CN"). */
const byDay = (p: Record<string, string | undefined>) => p.FREQ === "DAILY" || (p.FREQ === "WEEKLY" && !!daysOf(p)?.length);
const tod = (ms: number) => ms - dayStart(ms);
/** Calendar day stepping: `+ k * DAY` drifts an hour across a DST change. */
const addDays = (d: number, k: number) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate() + k).getTime(); };

type Occ = { notBefore?: number; deadline?: number };
const MAX_OCC = 30;

/** Day starts a DAILY, WEEKLY-with-days, MONTHLY or YEARLY rule lands on from `d0`, and whether the list stops short of the rule's own end.
 *  COUNT is the total from `d0`, past days included; only days from today to `upTo` (default: the rule's first stretch) are listed. */
function ruleDays(p: Record<string, string | undefined>, d0: number, now: number, upTo?: number): { days: number[]; short: boolean } {
  const n = Math.max(1, Number(p.INTERVAL) || 1), want = Number(p.COUNT) > 0 ? Number(p.COUNT) : undefined, cap = Math.min(want ?? MAX_OCC, MAX_OCC);
  const u = /^(\d{4})(\d\d)(\d\d)/.exec(p.UNTIL ?? ""), until = u ? new Date(+u[1], +u[2] - 1, +u[3]).getTime() : undefined;
  const monthly = p.FREQ === "MONTHLY", yearly = p.FREQ === "YEARLY";
  const span = want ? (monthly ? 800 : yearly ? 4000 : 90) : monthly ? 92 : yearly ? 400 : (p.FREQ === "WEEKLY" && n > 1) || until !== undefined ? 60 : 7;
  const end = upTo ?? addDays(d0, span - 1), out: number[] = [];
  const lo = Math.max(d0, dayStart(now)), wd = daysOf(p);
  let seen = 0; // occurrences from d0 on, for COUNT
  const push = (d: number) => {
    if (d < d0 || d > end || (until !== undefined && d > until) || (want !== undefined && seen >= want)) return;
    seen++;
    if (d >= lo && out.length < cap) out.push(d);
  };
  if (monthly || yearly) {
    const b = new Date(d0);
    for (let k = 0; k < 60 && out.length < cap; k++) {
      const first = yearly ? new Date(b.getFullYear() + k * n, p.BYMONTH ? Number(p.BYMONTH) - 1 : b.getMonth(), 1) : new Date(b.getFullYear(), b.getMonth() + k * n, 1);
      if (first.getTime() > end) break;
      const len = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate(), set = Number(p.BYSETPOS);
      let day = Number(p.BYMONTHDAY) || b.getDate();
      if (day < 0) day = len + 1 + day;
      if (wd?.length && set) { // "thứ 2 đầu tiên": the nth (or last, -1) weekday of the month
        const same = Array.from({ length: len }, (_, i) => i + 1).filter((x) => new Date(first.getFullYear(), first.getMonth(), x).getDay() === wd[0]);
        day = same.at(set > 0 ? set - 1 : set) ?? 0;
      }
      if (day > 0) push(new Date(first.getFullYear(), first.getMonth(), Math.min(day, len)).getTime());
    }
  } else {
    const mon = (new Date(d0).getDay() + 6) % 7; // every other week counts calendar (Monday) weeks from d0's, not 7-day blocks from d0
    for (let i = 0, d = d0; d <= end && out.length < cap; d = addDays(d0, ++i)) {
      if (p.FREQ === "DAILY" ? i % n === 0 && (!wd?.length || wd.includes(new Date(d).getDay())) : Math.floor((mon + i) / 7) % n === 0 && (!wd?.length ? i % 7 === 0 : wd.includes(new Date(d).getDay()))) push(d);
    }
  }
  const open = n > 1 || monthly || yearly;
  return { days: out, short: (!want && !until && open) || (until !== undefined && until > end) || (want !== undefined && want > MAX_OCC) };
}

/** Expands an rrule into occurrences, each on its own day with the said clock and due time moved onto that day. `short` is set when
 *  only the next stretch of an open-ended rule was made, or the rule is not one we expand, so the toast can say so. */
function occurrences(rrule: string | undefined, now: number, when?: number, due?: number): { list: Occ[]; short?: boolean } {
  if (!rrule) return { list: [{ notBefore: when, deadline: due }] };
  const p = rule(rrule);
  const count = Number(p.COUNT);
  if (p.FREQ === "HOURLY") { // "mỗi 3 tiếng": one task per hour step of the day, from the first hour left
    const n = Math.max(1, Number(p.INTERVAL) || 1), hrs = (p.BYHOUR?.split(",").map(Number) ?? [...Array(24).keys()]).filter(Number.isFinite);
    const d0 = dayStart(when ?? due ?? now), left = (d: number) => hrs.filter((h, i) => i % n === 0 && d + h * 3600_000 >= now).slice(0, MAX_OCC);
    const d = left(d0).length ? d0 : d0 + DAY, at = left(d); // nothing left today: tomorrow's
    return { list: at.map((h) => ({ notBefore: d + h * 3600_000, deadline: d + (h + n) * 3600_000 })), short: true };
  }
  const known = byDay(p) || p.FREQ === "MONTHLY" || p.FREQ === "YEARLY" || (p.FREQ === "WEEKLY" && Number(p.INTERVAL) > 1);
  if (known) {
    const { days, short } = ruleDays(p, dayStart(when ?? (p.FREQ === "MONTHLY" || p.FREQ === "YEARLY" ? due : undefined) ?? now), now);
    return {
      short,
      list: days.map((d) => {
        // A due time before the clock (or at midnight) means "by the end of that day".
        const end = due !== undefined && tod(due) > 0 && (when === undefined || tod(due) > tod(when)) ? d + tod(due) : addDays(d, 1);
        return { notBefore: when !== undefined ? d + tod(when) : Math.max(now, d), deadline: end };
      }),
    };
  }
  if (p.FREQ === "WEEKLY") {
    const n = Math.min(Number.isFinite(count) && count > 0 ? count : 1, 7);
    return { list: Array.from({ length: n }, () => ({ notBefore: when, deadline: due ?? dayStart(now) + 7 * DAY })) };
  }
  return { list: [{ notBefore: when, deadline: due }], short: true };
}

const at = (x: Task) => x.start ?? x.notBefore ?? x.deadline ?? 0;
const seriesKey = (x: Task) => `${x.rrule}|${x.title}`;

/** Ids a scope pick covers. Series = same section (DLU lectures) or same rrule and title (user repeats);
 *  "following" is this one and later ones, "all" the whole series, "this" just itself. */
export function scopeIds(tasks: Task[], id: string, scope: "this" | "following" | "all"): string[] {
  const me = tasks.find((x) => x.id === id);
  const kin = (x: Task) => (me?.section ? x.section === me.section : me?.parentId ? x.parentId === me.parentId : !!me?.rrule && x.rrule === me.rrule && x.title === me.title);
  const ids = !me || scope === "this" ? [id] : tasks.filter((x) => x.id === id || (kin(x) && !x.deletedAt && !x.doneAt && (scope === "all" || at(x) >= at(me)))).map((x) => x.id);
  // Last live sitting gone: the parent goes too (last, after its sittings), or the planner splits it again.
  if (me?.parentId && tasks.every((x) => x.parentId !== me.parentId || x.deletedAt || x.doneAt || ids.includes(x.id))) ids.push(me.parentId);
  return ids;
}

export async function loadGone(): Promise<Gone> {
  try { return { sections: {}, series: {}, ...JSON.parse((await store.kvGet("gone")) ?? "{}") }; } catch { return { sections: {}, series: {} }; }
}

/** Deletes a scope and tombstones the series so sync and top-up do not bring the rest back. One undo covers both. */
export async function removeScope(id: string, scope: "this" | "following" | "all", now = Date.now()): Promise<Result> {
  const tasks = await store.allTasks();
  const me = tasks.find((x) => x.id === id);
  const raw = await store.kvGet("gone");
  if (me && scope !== "this" && (me.section || me.rrule)) {
    const gone = await loadGone();
    const cut = scope === "all" ? 0 : at(me);
    if (me.section) gone.sections[me.section] = cut; else gone.series[seriesKey(me)] = cut;
    await store.kvSet("gone", JSON.stringify(gone));
  }
  // No replan: freed time needs nothing moved, and the rest of the calendar should not reshuffle under the user.
  const r = await transact(now, async (w) => { for (const target of scopeIds(tasks, id, scope)) await act(w, { op: "delete", target }); }, { replan: false });
  return { ...r, undo: async () => { await store.kvSet("gone", raw ?? "{}"); await r.undo(); } };
}

/** Occurrences a live user series is missing so it reaches ~14 days ahead: the rule's own days (BYDAY, INTERVAL, COUNT as a total, UNTIL),
 *  or `COUNT` per week for a plain weekly "n lần mỗi tuần". */
function missing(tasks: Task[], gone: Gone, now: number): Task[] {
  const horizon = now + 14 * DAY;
  const series = new Map<string, Task[]>();
  for (const x of tasks) if (x.source === "user" && x.rrule && !x.parentId) series.set(seriesKey(x), [...(series.get(seriesKey(x)) ?? []), x]);
  const out: Task[] = [];
  for (const [key, xs] of series) {
    const last = xs.reduce((a, b) => (at(b) > at(a) ? b : a));
    const p = rule(last.rrule!);
    const cut = gone.series[key];
    if (!xs.some((x) => !x.deletedAt) || cut === 0) continue;
    const fx = last.fixed === "busy" && last.start !== undefined, len = (last.end ?? 0) - (last.start ?? 0);
    // a fixed block keeps its clock: the new day gets start and end, or the planner drops it
    const copy = (o: { notBefore?: number; deadline?: number }): Task => ({
      ...last, ...o, id: uid(), start: undefined, end: undefined, doneAt: undefined, deletedAt: undefined, userEdited: undefined, note: undefined, createdAt: now,
      ...(fx ? { start: o.notBefore, end: o.notBefore! + len, notBefore: undefined, deadline: undefined } : {}),
    });
    if (byDay(p) || (p.FREQ === "WEEKLY" && Number(p.INTERVAL) > 1)) {
      const dayOf = (x: Task) => dayStart(fx ? x.start ?? 0 : (x.deadline ?? 0) - 1), have = new Set(xs.map(dayOf));
      const clock = fx ? tod(last.start!) : last.notBefore !== undefined && tod(last.notBefore) ? tod(last.notBefore) : undefined;
      const due = last.deadline !== undefined && tod(last.deadline) ? tod(last.deadline) : undefined;
      // The first occurrence anchors INTERVAL and COUNT, as it did when the series was made.
      for (const d of ruleDays(p, Math.min(...xs.map(dayOf)), now, horizon).days) {
        if (!have.has(d) && (cut === undefined || d < cut)) out.push(copy({ notBefore: clock !== undefined ? d + clock : Math.max(now, d), deadline: due !== undefined ? d + due : addDays(d, 1) }));
      }
    } else if (p.FREQ === "WEEKLY") {
      const n = Math.min(Number(p.COUNT) > 0 ? Number(p.COUNT) : 1, 7);
      const newest = Math.max(...xs.map((x) => (fx ? x.start : x.deadline) ?? 0));
      for (let d = newest + 7 * DAY; d <= horizon; d += 7 * DAY) {
        if (d > now && (cut === undefined || d - 7 * DAY < cut)) for (let i = 0; i < n; i++) out.push(copy({ notBefore: fx ? d : d - 7 * DAY, deadline: d }));
      }
    }
  }
  return out;
}

/** Keeps live repeating series ~14 days ahead (a foreground hook); replans only when something was added. */
export async function topUp(now = Date.now()): Promise<Result | undefined> {
  const add = missing(await store.allTasks(), await loadGone(), now);
  return add.length ? transact(now, (w) => { for (const x of add) w.tasks.set(x.id, x); }, { self: false }) : undefined;
}

/** Resolves an id the model gave; a split parent resolves to its sittings. */
function targets(w: Work, id?: string): Task[] {
  const task = id ? w.tasks.get(id) : undefined;
  if (!task) return [];
  const kids = [...w.tasks.values()].filter((c) => c.parentId === task.id && !c.doneAt && !c.deletedAt);
  return kids.length ? kids : [task];
}


function pushRule(w: Work, r: Omit<Rule, "id" | "at">) {
  w.model = { ...w.model, rules: [...(w.model.rules ?? []), { ...r, id: uid(), at: w.now }] };
  w.toast = t("ruleKept", { text: r.text });
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
    const when = ms(a.when) ?? ms(a.notBefore);
    if (a.repeat) {
      const gone = await loadGone();
      if (delete gone.series[`${a.repeat}|${title}`]) await store.kvSet("gone", JSON.stringify(gone)); // a fresh series replaces the deleted one
    }
    const occ = occurrences(a.repeat, now, when, ms(a.deadline));
    if (occ.short) w.short = true;
    const vec = titleVec(title);
    // A kind the user corrected on a title that reads alike wins.
    const near = [...w.tasks.values()].filter((x) => x.vec && x.userEdited?.includes("kind")).map((x) => ({ c: cosine(vec, x.vec!), k: x.kind })).filter((n) => n.c > 0.6).sort((p, q) => q.c - p.c)[0];
    const fixed = a.fixed && when !== undefined ? a.fixed : undefined;
    // a repeat's said window is its parts of the day (tods), which every occurrence keeps; a day's notAfter would hold only the first
    const notAfter = a.repeat ? undefined : ms(a.notAfter);
    for (const o of occ.list) {
      const task: Task = {
        id: uid(), title, vec, kind: near?.k ?? a.kind ?? "other", source: "user", effort: a.effortMinutes ?? 0, createdAt: now,
        deadline: o.deadline, notBefore: o.notBefore, rrule: a.repeat, ...(a.location ? { location: a.location } : {}), ...(a.note ? { note: a.note } : {}), ...(notAfter !== undefined ? { notAfter } : {}), ...(a.tods?.length ? { tods: a.tods } : {}),
      };
      if (fixed && o.notBefore !== undefined) { // an exact said time is a busy block, not a plan
        task.effort = effort(task, w.model);
        Object.assign(task, { fixed, start: o.notBefore, end: o.notBefore + task.effort * 60_000, notBefore: undefined, deadline: undefined, notAfter: undefined, tods: undefined });
      }
      w.tasks.set(task.id, task);
    }
    w.toast = t("added", { title });
    return;
  }
  const all = targets(w, a.target), lead = [...all].sort((x, y) => (x.start ?? Infinity) - (y.start ?? Infinity))[0];
  for (const tk of all) {
    if (a.op === "done") {
      const next = { ...tk, doneAt: now };
      w.tasks.set(tk.id, next);
      w.log("done", next);
      for (const c of [...w.tasks.values()]) if (c.parentId === tk.id && !c.doneAt && !c.deletedAt) w.tasks.set(c.id, { ...c, doneAt: now }); // the whole task done: its sittings too
      const p = tk.parentId && w.tasks.get(tk.parentId);
      if (p && ![...w.tasks.values()].some((c) => c.parentId === p.id && !c.doneAt && !c.deletedAt)) w.tasks.set(p.id, { ...p, doneAt: now });
      w.toast = t("done");
    } else if (a.op === "delete") {
      const gone = (x: Task) => w.tasks.set(x.id, { ...x, deletedAt: now, userEdited: [...new Set([...(x.userEdited ?? []), "deleted"])] });
      if (!tk.deletedAt) { gone(tk); w.log("delete", tk); }
      // The last live sitting gone: its parent goes too, or the next replan splits it again.
      const p = tk.parentId && w.tasks.get(tk.parentId);
      if (p && !p.deletedAt && ![...w.tasks.values()].some((c) => c.parentId === p.id && !c.doneAt && !c.deletedAt)) gone(p);
      w.toast = t("deleted", { title: tk.title });
    } else if (a.op === "edit") {
      const when = ms(a.when);
      const edited = new Set(tk.userEdited);
      const next: Task = { ...tk };
      if (a.title) { next.title = a.title; edited.add("title"); w.toast = t("renamed", { title: a.title }); }
      if (a.effortMinutes) { next.effort = a.effortMinutes; edited.add("effort"); }
      if (a.kind) { next.kind = a.kind as Kind; edited.add("kind"); }
      if (a.location !== undefined) { next.location = a.location || undefined; edited.add("location"); } // "" clears it
      if (a.deadline === "") { next.deadline = undefined; edited.add("deadline"); }
      if (a.note !== undefined) { next.note = a.note; edited.add("note"); }
      const dl = ms(a.deadline);
      if (dl) { next.deadline = dl; edited.add("deadline"); }
      // a time the user sets wins over the parts of the day it was said in
      if (when !== undefined) next.tods = undefined;
      if (when !== undefined && tk !== lead) {
        // A split task moved as a whole: its first open sitting takes the time, the rest are planned after it, not stacked on it.
        Object.assign(next, { start: undefined, end: undefined, pinned: false, notBefore: when + (lead.effort || 30) * 60_000 });
        edited.delete("start");
      } else if (when !== undefined) {
        next.notBefore = when;
        next.start = when;
        next.pinned = true; // a time you set stays: notBefore only bounds the planner, which would pick another slot (and never a past one)
        edited.add("start");
        next.end = when + (next.effort || 30) * 60_000; // next.effort: the length may be edited in the same action
        w.log("drag", tk, { fromStart: tk.start, toStart: when });
        w.toast = t("moved", { title: next.title, time: at12(when, now) });
      }
      next.userEdited = [...edited];
      w.tasks.set(tk.id, next);
      w.log("edit", next);
    }
  }
}

/** A task's stored content, comparable across a store round trip (key order, null vs undefined, the vector's typed array). */
const canon = (x: Task) => JSON.stringify(Object.keys(x).filter((k) => k !== "vec" && x[k as keyof Task] != null).sort().map((k) => [k, x[k as keyof Task]]));

// Every task write is read-modify-write of the whole store, so they run one at a time or the later one wipes the earlier.
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn); chain = r.catch(() => {}); return r; };

/** Runs one mutation, optionally replans, mirrors to the calendar and persists. One call is one undo group. */
function transact(now: number, mutate: (w: Work) => Promise<void> | void, o: { replan?: boolean; self?: boolean; quiet?: boolean; plan?: Opts; text?: (d: Diff | undefined, w: Work) => string | undefined } = {}): Promise<Result> {
  return serial(() => transactNow(now, mutate, o));
}

async function transactNow(now: number, mutate: (w: Work) => Promise<void> | void, o: { replan?: boolean; self?: boolean; quiet?: boolean; plan?: Opts; text?: (d: Diff | undefined, w: Work) => string | undefined } = {}): Promise<Result> {
  const model0 = await store.loadModel(now);
  const before = new Map((await store.allTasks()).map((x) => [x.id, x]));
  const w: Work = {
    tasks: new Map(before), model: model0, events: [], notes: [], moves: [], now,
    log(type, task, data) {
      if (o.quiet) return; // a value held mid-edit: the edit that settles it is the one worth learning from
      const ev: TaskEvent = { id: uid(), taskId: task.id, type, at: now, data };
      w.events.push(ev);
      stat(w.model, ev, task);
      w.model = learn(w.model, ev, task);
    },
  };
  const kv0 = { moves: await store.kvGet("moves"), warn: await store.kvGet("warn") };
  await mutate(w);

  let diff: Diff | undefined;
  if (o.replan !== false) {
    const r = plan([...w.tasks.values()], [], w.model, now, o.plan);
    diff = r.diff;
    w.model = r.model;
    const dragged = new Set(w.events.filter((e) => e.type === "drag").map((e) => e.taskId));
    // What changed under the plan this time: new or moved fixed/pinned items, and new rules. A move's cause is the one over its old slot.
    const hit = [...w.tasks.values()].filter((x) => (x.fixed || x.pinned) && !x.deletedAt && x.start !== undefined && x.end !== undefined
      && (before.get(x.id)?.start !== x.start || before.get(x.id)?.end !== x.end || !!before.get(x.id)?.deletedAt));
    const ids0 = new Set((model0.rules ?? []).map((x) => x.id)), rules = (w.model.rules ?? []).filter((x) => !ids0.has(x.id));
    const causeOf = (task: Task, a: number, b: number) => {
      const f = hit.find((x) => x.start! < b && x.end! > a);
      if (f) {
        const old = before.get(f.id);
        const key = f.source !== "dlu" ? "causeAt" : old && !old.deletedAt ? "causeMoved" : "causeNew";
        return t(key, { title: f.title, time: at12(f.start!, now) });
      }
      const par = task.parentId ? w.tasks.get(task.parentId) : undefined;
      for (const x of [task, par]) { // its own due date, or its parent's, changed in this transaction
        const old = x && before.get(x.id);
        if (x && old && old.deadline !== x.deadline && x.deadline !== undefined) return t("causeDue", { title: x.title, when: at12(x.deadline, now) });
      }
      const d = new Date(a), m0 = d.getHours() * 60 + d.getMinutes(), m1 = m0 + (b - a) / 60_000;
      const rl = rules.find((x) => (!x.days.length || x.days.includes(d.getDay())) && (!x.kinds.length || x.kinds.includes(task.kind)) && m0 < x.to && m1 > x.from);
      return rl && t("causeRule", { text: rl.text });
    };
    // A new sitting is made from its parent; the parent keeps no time of its own.
    const sitting = (id: string) => {
      const parent = w.tasks.get(diff!.split.find((s) => s.ids.includes(id))?.parentId ?? "");
      if (!parent) return;
      w.tasks.set(parent.id, { ...parent, start: undefined, end: undefined });
      return { ...parent, id, parentId: parent.id, userEdited: undefined, doneAt: undefined } as Task;
    };
    // Placement never writes over what the user owns: a done, deleted, or pinned-and-timed task.
    const owned = (x: Task) => !!x.doneAt || !!x.deletedAt || (!!x.pinned && x.start !== undefined);
    for (const u of diff.unplaced ?? []) {
      const old = w.tasks.get(u.id), task = old ?? sitting(u.id);
      if (task && !owned(task)) w.tasks.set(u.id, { ...task, start: undefined, end: undefined, effort: old ? task.effort : u.effort });
    }
    for (const pl of diff.placed) {
      const task = w.tasks.get(pl.id) ?? sitting(pl.id);
      if (!task || owned(task)) continue;
      w.tasks.set(pl.id, { ...task, start: pl.start, end: pl.end, effort: Math.round((pl.end - pl.start) / 60_000) });
      if (pl.from !== undefined && pl.from !== pl.start && !dragged.has(pl.id)) w.moves.push({ id: pl.id, title: task.title, from: pl.from, to: pl.start, why: pl.why, cause: causeOf(task, pl.from, pl.from + pl.end - pl.start), at: now, ...(o.self === false ? {} : { self: true }) });
      w.events.push({ id: uid(), taskId: pl.id, type: "placed", at: now, data: { policy: pl.policy, arm: pl.arm, x: pl.x } });
    }
    if (w.moves.some((m) => m.cause)) for (const m of w.moves) m.cause ??= t("causeKnock"); // moved to make room for a caused move
  }

  const changed = [...w.tasks.values()].filter((x) => before.get(x.id) !== x);
  await store.putTasks(changed);
  for (const n of w.notes) await store.putNote(n);
  for (const e of w.events) await store.putEvent(e);
  await store.saveModel(w.model);
  if (diff) { await store.kvSet("plannedAt", String(now)); await recordMoves(w.moves); await saveWarn(diff.warn ?? []); }

  const ins = diff?.insight;
  const insTitle = ins && fill(ins.template, ins.vars);
  const toast = o.text?.(diff, w) ?? insTitle ?? w.toast ?? t("nothing");
  return {
    toast,
    sub: [w.sub ?? (ins && toast === insTitle ? fill(ins.sub, ins.vars) : undefined), w.short ? t("repeatShort") : undefined].filter(Boolean).join(". ") || undefined,
    changed: changed.length > 0,
    steps: diff?.steps,
    warn: diff?.warn,
    moved: w.moves.length,
    undo: () => serial(async () => {
      // Only a task still as this change left it goes back: an edit made since (a rename between two picks, a later sync) stays.
      const now = new Map((await store.allTasks()).map((x) => [x.id, x]));
      const mine = changed.filter((x) => { const c = now.get(x.id); return !c || canon(c) === canon(x); });
      const gone = mine.filter((x) => !before.has(x.id));
      const restored = mine.filter((x) => before.has(x.id)).map((x) => before.get(x.id)!);
      await store.removeTasks(gone.map((x) => x.id));
      await store.putTasks(restored);
      await store.removeNotes(w.notes.map((n) => n.id));
      await store.removeEvents(w.events.map((e) => e.id));
      await store.saveModel(model0);
      for (const k of ["moves", "warn"] as const) await store.kvSet(k, kv0[k] ?? "[]");
    }),
  };
}

/** One spoken line: all actions, one plan, one undo. */
export function apply(actions: Action[], now = Date.now()): Promise<Result> {
  // Only a create, or a change of an existing task's time, due date or length, moves the plan.
  const replan = actions.some((a) => a.op === "create" || (a.op === "edit" && (a.when !== undefined || a.deadline !== undefined || !!a.effortMinutes)));
  return transact(now, async (w) => { for (const a of actions) await act(w, a); }, {
    replan,
    text: (d, w) => {
      const created = d?.placed.length && actions.some((a) => a.op === "create");
      if (created && d.placed.length > 1) {
        w.sub = t("plannedSub", { d: new Set(d.placed.map((p) => dayStart(p.start))).size });
        return t("planned", { n: d.placed.length });
      }
      return d?.insight ? fill(d.insight.template, d.insight.vars) : w.toast;
    },
  });
}

export type LiveEdit = { when?: number; effortMinutes?: number; deadline?: number | "" };
const toAction = (id: string, e: LiveEdit): Action => ({ op: "edit", target: id, ...(e.when !== undefined ? { when: new Date(e.when).toISOString() } : {}),
  ...(e.effortMinutes ? { effortMinutes: e.effortMinutes } : {}), ...(e.deadline !== undefined ? { deadline: e.deadline === "" ? "" : new Date(e.deadline).toISOString() } : {}) });
// One task's live edits (wheel turns): each value is saved at once with nothing else moved, so a force quit loses nothing.
// Once the edits rest for `rest` ms, one replan moves what the new value now clashes with. Edits within 30 s are one session:
// that replan first undoes the session's last one, so tasks knocked aside by a value passed over go back.
// shortcut: the undo skips tasks changed since (see canon), so a sync landing mid-session keeps its writes; fine for a wheel.
const sessions = new Map<string, { last?: Promise<Result | undefined>; at: number; timer?: ReturnType<typeof setTimeout>; drop?: () => void }>();
/** Resolves with the replan's Result once the edits rest, or undefined when a later edit took over. */
export function liveEdit(id: string, e: LiveEdit, now = Date.now(), rest = 500): Promise<Result | undefined> {
  const ss = sessions.get(id) ?? { at: 0 };
  sessions.set(id, ss);
  if (now - ss.at >= 30_000) ss.last = undefined;
  ss.at = now;
  clearTimeout(ss.timer);
  ss.drop?.();
  const held = transact(now, (w) => act(w, toAction(id, e)), { replan: false, quiet: true });
  return new Promise((done, fail) => {
    ss.drop = () => done(undefined);
    ss.timer = setTimeout(() => {
      ss.drop = undefined;
      const prev = ss.last;
      const r = held.then(() => (prev ?? Promise.resolve(undefined)).catch(() => undefined)).then(async (p) => { await p?.undo(); return apply([toAction(id, e)], now); });
      ss.last = r.catch(() => undefined);
      r.then(done, fail);
    }, rest);
    held.catch(fail); // the held write itself failed: say so now
  });
}
/** A start (and length) set on a wheel: liveEdit for a time. */
export const retime = (id: string, start: number, minutes?: number, now = Date.now(), rest?: number) => liveEdit(id, { when: start, effortMinutes: minutes }, now, rest);

export const swipeDone = (id: string, now = Date.now()) => transact(now, (w) => act(w, { op: "done", target: id }), { replan: false });
export const swipeLater = (id: string, now = Date.now()) =>
  transact(now, (w) => { const tk = w.tasks.get(id); if (tk) w.log("later", tk); w.toast = t("later"); }, { plan: { later: id } });

/** Starts the suggested gap task now. */
export const take = (id: string, start: number, end: number, now = Date.now()) =>
  transact(now, (w) => { const tk = w.tasks.get(id); if (tk) w.tasks.set(id, { ...tk, start, end, notBefore: start, userEdited: [...(tk.userEdited ?? []), "start"] }); w.toast = t("moved", { title: tk?.title ?? "", time: at12(start, now) }); }, { replan: false });

/** Replan with no edits (morning, sync). */
export const putBack = async (id: string, start: number, now = Date.now()) => {
  const r = await transact(now, async (w) => { await act(w, { op: "edit", target: id, when: new Date(start).toISOString() }); w.toast = t("putBack", { time: at12(start, now) }); });
  await seeMoves([id]);
  return r;
};

export const pin = (id: string, on = true, now = Date.now()) =>
  transact(now, (w) => {
    const tk = w.tasks.get(id);
    if (!tk) return;
    w.tasks.set(id, { ...tk, pinned: on, userEdited: on ? [...new Set([...(tk.userEdited ?? []), "start"])] : tk.userEdited });
    w.toast = t(on ? "pinned" : "unpinned", { title: tk.title });
  }, { replan: false });

export const makeRoom = (fixId: string, deadline: number, now = Date.now()) =>
  transact(now, (w) => {
    const tk = w.tasks.get(fixId);
    if (!tk) return;
    for (const x of [tk, ...targets(w, fixId)]) w.tasks.set(x.id, { ...x, notBefore: deadline });
    w.toast = t("madeRoom", { title: tk.title });
  });

/** One sentence can hold several rules ("tối T6 và sáng CN"), and past midnight is two: one transaction, one Undo. */
export const addRule = (r: Omit<Rule, "id" | "at"> | Omit<Rule, "id" | "at">[], now = Date.now()) =>
  transact(now, (w) => {
    const rs = [r].flat();
    for (const x of rs) pushRule(w, x);
    const texts = [...new Set(rs.map((x) => x.text))];
    if (texts.length > 1) w.toast = t("rulesKept", { n: texts.length });
  }, {
    text: (_, w) => { const m = w.moves[0]; if (m) w.sub = t("ruleSub", { title: m.title, when: at12(m.to, now) }); return w.toast; },
  });

export const removeRule = (id: string | string[], now = Date.now()) =>
  transact(now, (w) => {
    const ids = [id].flat(), gone = w.model.rules?.filter((x) => ids.includes(x.id)) ?? [];
    if (!gone.length) return;
    w.model = { ...w.model, rules: w.model.rules!.filter((x) => !ids.includes(x.id)) };
    w.toast = t("ruleGone", { text: [...new Set(gone.map((x) => x.text))].join(", ") });
  });

export function replan(now = Date.now(), toast?: (d: Diff) => string | undefined) {
  return transact(now, () => {}, { self: false, text: (d) => (d && toast ? toast(d) : undefined) });
}

/** Applies upstream upserts and soft deletes, replans, and reports moved tasks. */
export function ingest(upserts: Task[], deletes: string[], now = Date.now(), notices: Notice[] = []) {
  return transact(now, (w) => {
    for (const u of upserts) w.tasks.set(u.id, u);
    for (const id of deletes) { const x = w.tasks.get(id); if (x) w.tasks.set(id, { ...x, deletedAt: now }); }
  }, {
    self: false,
    text: (d, w) => {
      if (notices.length === 1) w.sub = notices[0].sub;
      return notices.length ? notices.map((n) => n.title).join(". ") : d?.displaced.length ? t("synced", { n: d.displaced.length }) : t("syncedNew");
    },
  });
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

/** Unpins a task the user fixed in place and lets the planner choose again (the "move mine" answer to an overlap). */
export const moveMine = (id: string, now = Date.now()) =>
  transact(now, (w) => {
    const tk = w.tasks.get(id);
    if (tk) w.tasks.set(id, { ...tk, fixed: tk.source === "user" ? undefined : tk.fixed, start: undefined, end: undefined, pinned: false, notBefore: tk.notBefore === tk.start ? undefined : tk.notBefore, userEdited: tk.userEdited?.filter((f) => f !== "start") });
  });

/** Future upstream tasks (lectures, exams, assignments, preps) to drop when the campus is disconnected; past ones stay. */
export const futureDlu = (tasks: Task[], now: number) =>
  tasks.filter((x) => (x.source === "dlu" || x.forId) && !x.deletedAt && (x.start ?? x.deadline ?? 0) > now);

/** Soft-deletes them through the usual path so the calendar mirror follows. */
export const removeImported = (now = Date.now()) =>
  transact(now, async (w) => {
    for (const x of futureDlu([...w.tasks.values()], now)) w.tasks.set(x.id, { ...x, deletedAt: now, userEdited: [...new Set([...(x.userEdited ?? []), "deleted"])] });
  }, { replan: false });
