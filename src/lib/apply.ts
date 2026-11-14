import { titleVec } from "./nlu/vec";
import { learn, outcome, plan, type Model, type Opts } from "../planner";
import { readBusy } from "./calendar";
import { fill, t } from "./i18n";
import { when as at12 } from "./when";
import * as stats from "./stats";
import * as store from "./store";
import { recordMoves, saveWarn, seeMoves } from "./moves";
import type { Action, Diff, EventType, Gone, Kind, Move, Note, Notice, Rule, Step, Task, TaskEvent, Warn } from "./types";

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

type Occ = { notBefore?: number; deadline?: number };
const MAX_OCC = 30;

/** Day starts a DAILY, WEEKLY-with-days, MONTHLY or YEARLY rule lands on from `d0`, and whether the list stops short of the rule's own end. */
function ruleDays(p: Record<string, string | undefined>, d0: number, now: number): { days: number[]; short: boolean } {
  const n = Math.max(1, Number(p.INTERVAL) || 1), want = Number(p.COUNT) > 0 ? Number(p.COUNT) : undefined, cap = Math.min(want ?? MAX_OCC, MAX_OCC);
  const u = /^(\d{4})(\d\d)(\d\d)/.exec(p.UNTIL ?? ""), until = u ? new Date(+u[1], +u[2] - 1, +u[3]).getTime() : undefined;
  const monthly = p.FREQ === "MONTHLY", yearly = p.FREQ === "YEARLY";
  const span = want ? (monthly ? 800 : yearly ? 4000 : 90) : monthly ? 92 : yearly ? 400 : (p.FREQ === "WEEKLY" && n > 1) || until !== undefined ? 60 : 7;
  const end = d0 + (span - 1) * DAY, out: number[] = [];
  const lo = Math.max(d0, dayStart(now)), wd = daysOf(p);
  const push = (d: number) => { if (d >= lo && d <= end && (until === undefined || d <= until) && out.length < cap) out.push(d); };
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
    for (let i = 0; d0 + i * DAY <= end && out.length < cap; i++) {
      const d = d0 + i * DAY;
      if (p.FREQ === "DAILY" ? i % n === 0 && (!wd?.length || wd.includes(new Date(d).getDay())) : Math.floor(i / 7) % n === 0 && (!wd?.length ? i % 7 === 0 : wd.includes(new Date(d).getDay()))) push(d);
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
        const end = due !== undefined && tod(due) > 0 && (when === undefined || tod(due) > tod(when)) ? d + tod(due) : d + DAY;
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

/** Occurrences a live user series is missing so it reaches ~14 days ahead; one per kept day (daily or weekdays) or `COUNT` per week (weekly). */
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
    const copy = (o: { notBefore?: number; deadline: number }): Task => ({
      ...last, ...o, id: uid(), start: undefined, end: undefined, doneAt: undefined, deletedAt: undefined, userEdited: undefined, note: undefined, createdAt: now,
    });
    if (byDay(p) && !p.COUNT) {
      const have = new Set(xs.map((x) => dayStart((x.deadline ?? 0) - 1)));
      const days = daysOf(p), clock = last.notBefore !== undefined && tod(last.notBefore) ? tod(last.notBefore) : undefined;
      const due = last.deadline !== undefined && tod(last.deadline) ? tod(last.deadline) : DAY;
      for (let d = dayStart(now); d <= horizon; d += DAY) {
        if (days?.length && !days.includes(new Date(d).getDay())) continue;
        if (!have.has(d) && (cut === undefined || d < cut)) out.push(copy({ notBefore: clock !== undefined ? d + clock : Math.max(now, d), deadline: d + due }));
      }
    } else if (p.FREQ === "WEEKLY") {
      const n = Math.min(Number(p.COUNT) > 0 ? Number(p.COUNT) : 1, 7);
      const newest = Math.max(...xs.map((x) => x.deadline ?? 0));
      for (let d = newest + 7 * DAY; d <= horizon; d += 7 * DAY) {
        if (d > now && (cut === undefined || d - 7 * DAY < cut)) for (let i = 0; i < n; i++) out.push(copy({ notBefore: d - 7 * DAY, deadline: d }));
      }
    }
  }
  return out;
}

/** Keeps live repeating series ~14 days ahead (a foreground hook); replans only when something was added. */
export async function topUp(now = Date.now()): Promise<Result | undefined> {
  const add = missing(await store.allTasks(), await loadGone(), now);
  return add.length ? transact(now, (w) => { for (const x of add) w.tasks.set(x.id, x); }) : undefined;
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
    for (const o of occ.list) {
      const task: Task = {
        id: uid(), title, vec: titleVec(title), kind: a.kind ?? "other", source: "user", effort: a.effortMinutes ?? 0, createdAt: now,
        deadline: o.deadline, notBefore: o.notBefore, rrule: a.repeat, ...(a.location ? { location: a.location } : {}),
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
      w.tasks.set(tk.id, { ...tk, deletedAt: now, userEdited: [...new Set([...(tk.userEdited ?? []), "deleted"])] });
      w.log("delete", tk);
      w.toast = t("deleted", { title: tk.title });
    } else if (a.op === "edit") {
      const when = ms(a.when);
      const edited = new Set(tk.userEdited);
      const next: Task = { ...tk };
      if (a.title) { next.title = a.title; edited.add("title"); }
      if (a.effortMinutes) { next.effort = a.effortMinutes; edited.add("effort"); }
      if (a.kind) next.kind = a.kind as Kind;
      if (a.note !== undefined) { next.note = a.note; edited.add("note"); }
      const dl = ms(a.deadline);
      if (dl) { next.deadline = dl; edited.add("deadline"); }
      if (when !== undefined) {
        next.notBefore = when;
        next.start = when;
        edited.add("start");
        next.end = when + Math.max(30, tk.effort || 30) * 60_000;
        w.log("drag", tk, { fromStart: tk.start, toStart: when });
        w.toast = t("moved", { title: next.title, time: at12(when, now) });
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
    tasks: new Map(before), model: model0, events: [], notes: [], moves: [], now,
    log(type, task, data) {
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
    const busy = await readBusy(now, now + HORIZON);
    const r = plan([...w.tasks.values()], busy, w.model, now, o.plan);
    diff = r.diff;
    w.model = r.model;
    const dragged = new Set(w.events.filter((e) => e.type === "drag").map((e) => e.taskId));
    // What changed under the plan this time: new or moved fixed/pinned items, and new rules. A move's cause is the one over its old slot.
    // shortcut: phone-calendar busy blocks aren't diffed (no before snapshot), so moves they force read as knock-ons; snapshot readBusy if that matters.
    const hit = [...w.tasks.values()].filter((x) => (x.fixed || x.pinned) && !x.deletedAt && x.start !== undefined && x.end !== undefined
      && (before.get(x.id)?.start !== x.start || before.get(x.id)?.end !== x.end || !!before.get(x.id)?.deletedAt));
    const ids0 = new Set((model0.rules ?? []).map((x) => x.id)), rules = (w.model.rules ?? []).filter((x) => !ids0.has(x.id));
    const causeOf = (task: Task, a: number, b: number) => {
      const f = hit.find((x) => x.start! < b && x.end! > a);
      if (f) return t("causeAt", { title: f.title, time: at12(f.start!, now) });
      const d = new Date(a), m0 = d.getHours() * 60 + d.getMinutes(), m1 = m0 + (b - a) / 60_000;
      const rl = rules.find((x) => (!x.days.length || x.days.includes(d.getDay())) && (!x.kinds.length || x.kinds.includes(task.kind)) && m0 < x.to && m1 > x.from);
      return rl && t("causeRule", { text: rl.text });
    };
    for (const pl of diff.placed) {
      let task = w.tasks.get(pl.id);
      if (!task) {
        const parent = w.tasks.get(diff.split.find((s) => s.ids.includes(pl.id))?.parentId ?? "");
        if (!parent) continue;
        task = { ...parent, id: pl.id, parentId: parent.id, userEdited: undefined, doneAt: undefined };
        w.tasks.set(parent.id, { ...parent, start: undefined, end: undefined });
      }
      w.tasks.set(pl.id, { ...task, start: pl.start, end: pl.end, effort: Math.round((pl.end - pl.start) / 60_000) });
      if (pl.from !== undefined && pl.from !== pl.start && !dragged.has(pl.id)) w.moves.push({ id: pl.id, title: task.title, from: pl.from, to: pl.start, why: pl.why, cause: causeOf(task, pl.from, pl.from + pl.end - pl.start), at: now });
      w.events.push({ id: uid(), taskId: pl.id, type: "placed", at: now, data: { policy: pl.policy, arm: pl.arm, x: pl.x, otherStart: pl.otherStart } });
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
    async undo() {
      const gone = changed.filter((x) => !before.has(x.id));
      const restored = changed.filter((x) => before.has(x.id)).map((x) => before.get(x.id)!);
      await store.removeTasks(gone.map((x) => x.id));
      await store.putTasks(restored);
      await store.removeNotes(w.notes.map((n) => n.id));
      await store.removeEvents(w.events.map((e) => e.id));
      await store.saveModel(model0);
      for (const k of ["moves", "warn"] as const) await store.kvSet(k, kv0[k] ?? "[]");
    },
  };
}

/** One spoken line: all actions, one plan, one undo. */
export function apply(actions: Action[], now = Date.now()): Promise<Result> {
  return transact(now, async (w) => { for (const a of actions) await act(w, a); }, {
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
  });

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
  return transact(now, () => {}, { text: (d) => (d && toast ? toast(d) : undefined) });
}

/** Applies upstream upserts and soft deletes, replans, and reports moved tasks. */
export function ingest(upserts: Task[], deletes: string[], now = Date.now(), notices: Notice[] = []) {
  return transact(now, (w) => {
    for (const u of upserts) w.tasks.set(u.id, u);
    for (const id of deletes) { const x = w.tasks.get(id); if (x) w.tasks.set(id, { ...x, deletedAt: now }); }
  }, {
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
    if (tk) w.tasks.set(id, { ...tk, start: undefined, end: undefined, notBefore: tk.notBefore === tk.start ? undefined : tk.notBefore, userEdited: tk.userEdited?.filter((f) => f !== "start") });
  });

/** Future upstream tasks (lectures, exams, assignments, preps) to drop when the campus is disconnected; past ones stay. */
export const futureDlu = (tasks: Task[], now: number) =>
  tasks.filter((x) => (x.source === "dlu" || x.forId) && !x.deletedAt && (x.start ?? x.deadline ?? 0) > now);

/** Soft-deletes them through the usual path so the calendar mirror follows. */
export const removeImported = (now = Date.now()) =>
  transact(now, async (w) => {
    for (const x of futureDlu([...w.tasks.values()], now)) w.tasks.set(x.id, { ...x, deletedAt: now, userEdited: [...new Set([...(x.userEdited ?? []), "deleted"])] });
  }, { replan: false });
