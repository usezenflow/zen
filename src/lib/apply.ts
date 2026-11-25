import { embed } from "./nlu/embed";
import { learn, missedReplan, outcome, plan, type Model, type Opts } from "../planner";
import { GRACE, holding } from "../planner/policy";
import { dayGone } from "../planner/place";
import { cosine, effort, forgetWhen as forgetLearned, settleHyp as settleLearned } from "../planner/habits";
import { addClassLog, classLogsOf, classMults } from "./nlu/context";
import { fill, partAt, t } from "./i18n";
import { day, hm, when as at12 } from "./when";
import { holidays } from "./holidays";
import * as stats from "./stats";
import * as store from "./store";
import { recordMoves, saveWarn, seeMoves } from "./moves";
import type { Action, Cause, Diff, EventType, Gone, Kind, Move, Notice, Rule, Step, Task, TaskEvent, Warn } from "./types";
import type { SeriesOffer } from "./series";

const DAY = 86400_000;
const HOUR_MS = 3600_000;
const kv: stats.Storage = { get: store.kvGet, set: store.kvSet };
let seq = 0;

/** Queues the anonymous stat row for an outcome the model learns from. */
function stat(m: Model, ev: TaskEvent, task: Task) {
  const o = outcome(m, ev, task);
  if (o) void stats.record(kv, { ...o, kind: task.kind, zeroEdit: ev.type === "kept" || ev.type === "done", at: Math.floor(ev.at / 1000), ev: ev.id }).catch(() => {});
}
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const dayStart = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();
const ms = (iso?: string) => {
  const v = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(v) ? v : undefined;
};

/** `moves`: what the plan moved; `clashes`: classes, exams and busy blocks a time set here lands on; `lost`: tasks that had a time and now have none. */
export interface Result { toast: string; sub?: string; changed: boolean; undo: () => Promise<void>; undoable?: boolean; steps?: Step[]; warn?: Warn[]; moved?: number; moves?: Move[]; clashes?: { mine: Task; fixed: Task }[]; lost?: Task[];
  /** No room: the shrink-to-fit length that is free, or a split across days, for the toast to offer instead of a new time. */
  alt?: { id: string; title: string; minutes?: number; split?: boolean } }

interface Work {
  timed: Set<string>; // tasks given a time by hand in this transaction, whether or not they had one before (a drag needs a place to come from)
  tasks: Map<string, Task>;
  model: Model;
  events: TaskEvent[];
  now: number;
  toast?: string;
  sub?: string;
  short?: boolean; // a repeat was only partly expanded
  moves: Move[];
  only?: string[]; // planned alone: these ids (and a split task's sittings) may move, every other piece holds
  log(type: EventType, task: Task, data?: TaskEvent["data"]): void;
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const rule = (rrule: string) => Object.fromEntries(rrule.split(";").map((kv) => kv.split("="))) as Record<string, string | undefined>;
/** A weekly rule with one more weekday (`d` names one): the weekday joins BYDAY, the rest of the rule stays.
 *  shortcut: a weekly rule with no BYDAY ("n lần mỗi tuần") is left as it is, upgrade when such a series can take a day. */
const withDay = (r: string, d: string) => {
  const p = rule(r), day = rule(d).BYDAY!, days = p.BYDAY?.split(",") ?? [];
  if (p.FREQ !== "WEEKLY" || !days.length || days.includes(day)) return r;
  return Object.entries({ ...p, BYDAY: [...days, day].join(",") }).map(([k, v]) => `${k}=${v}`).join(";");
};
/** Weekdays a rule keeps (JS getDay), or undefined for every day. */
const daysOf = (p: Record<string, string | undefined>) => p.BYDAY?.split(",").map((d) => BYDAY.indexOf(d.slice(-2))).filter((d) => d >= 0);
/** Day-by-day rules: DAILY, or any rule naming weekdays ("thứ 2 hàng tuần", "ngày thường", "mỗi ngày trừ CN"). */
const byDay = (p: Record<string, string | undefined>) => p.FREQ === "DAILY" || (p.FREQ === "WEEKLY" && !!daysOf(p)?.length);
const tod = (ms: number) => ms - dayStart(ms);
/** Calendar day stepping: `+ k * DAY` drifts an hour across a DST change. */
const addDays = (d: number, k: number) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate() + k).getTime(); };

type Occ = { notBefore?: number; deadline?: number };
const MAX_OCC = 120; // a series is made as far ahead as a deadline may be (cells: 120 days); the planner places only the first 30

/** Day starts a DAILY, WEEKLY-with-days, MONTHLY or YEARLY rule lands on from `d0`, and whether the list stops short of the rule's own end.
 *  COUNT is the total from `d0`, past days included; only days from today to `upTo` (default: the rule's first stretch) are listed. */
function ruleDays(p: Record<string, string | undefined>, d0: number, now: number, upTo?: number): { days: number[]; short: boolean } {
  const n = Math.max(1, Number(p.INTERVAL) || 1), want = Number(p.COUNT) > 0 ? Number(p.COUNT) : undefined, cap = Math.min(want ?? MAX_OCC, MAX_OCC);
  const u = /^(\d{4})(\d\d)(\d\d)/.exec(p.UNTIL ?? ""), until = u ? new Date(+u[1], +u[2] - 1, +u[3]).getTime() : undefined;
  const monthly = p.FREQ === "MONTHLY", yearly = p.FREQ === "YEARLY";
  const span = want ? (monthly ? 800 : yearly ? 4000 : 90) : yearly ? 400 : 120;
  const end = upTo ?? addDays(d0, span - 1), out: number[] = [];
  const lo = Math.max(d0, dayStart(now)), wd = daysOf(p);
  let seen = 0; // occurrences from d0 on, for COUNT
  // a daily or weekly routine skips public holidays (still counted for COUNT); a monthly or yearly date (rent, a birthday) keeps its day
  const off = monthly || yearly ? undefined : holidays(lo, addDays(end, 1));
  const push = (d: number) => {
    if (d < d0 || d > end || (until !== undefined && d > until) || (want !== undefined && seen >= want)) return;
    seen++;
    if (d >= lo && out.length < cap && !off?.has(d)) out.push(d);
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
const seriesKey = (x: Task) => x.seriesId ?? `${x.rrule}|${x.title}`; // older repeats have no id: rule and title

/** Ids a scope pick covers. Series = same section (DLU lectures) or same rrule and title (user repeats);
 *  "following" is this one and later ones, "all" the whole series, "this" just itself. */
export function scopeIds(tasks: Task[], id: string, scope: "this" | "following" | "all"): string[] {
  const me = tasks.find((x) => x.id === id);
  const kin = (x: Task) => (me?.section ? x.section === me.section : (me?.rrule || me?.seriesId) ? seriesKey(x) === seriesKey(me) : me?.parentId ? x.parentId === me.parentId : false);
  const ids = !me || scope === "this" ? [id] : tasks.filter((x) => x.id === id || (kin(x) && !x.deletedAt && !x.doneAt && (scope === "all" || at(x) >= at(me)))).map((x) => x.id);
  // Last live sitting gone: the parent goes too (last, after its sittings), or the planner splits it again.
  if (me?.parentId && !ids.includes(me.parentId) && tasks.every((x) => x.parentId !== me.parentId || x.deletedAt || x.doneAt || ids.includes(x.id))) ids.push(me.parentId);
  return ids;
}

export async function loadGone(): Promise<Gone> {
  try { return { sections: {}, series: {}, ...JSON.parse((await store.kvGet("gone")) ?? "{}") }; } catch { return { sections: {}, series: {} }; }
}

/** Deletes a scope and tombstones the series so sync and top-up do not bring the rest back. One undo covers both. */
export function removeScope(id: string, scope: "this" | "following" | "all", now = Date.now()): Promise<Result> {
  // Reads and writes run inside the write queue: a task written meanwhile is seen, and no second write lands between the reads and the delete.
  return serial(async () => {
    const tasks = await store.allTasks();
    const me = tasks.find((x) => x.id === id);
    const raw = await store.kvGet("gone");
    if (me && scope !== "this" && (me.section || me.rrule || me.seriesId)) {
      const gone = await loadGone();
      const cut = scope === "all" ? 0 : at(me);
      if (me.section) gone.sections[me.section] = cut; else gone.series[seriesKey(me)] = cut;
      await store.kvSet("gone", JSON.stringify(gone));
    }
    // Freed time is pulled into by later tasks, only earlier; nothing else reshuffles under the user.
    const r = await transactNow(now, async (w) => { for (const target of scopeIds([...w.tasks.values()], id, scope)) await act(w, { op: "delete", target }); }, { cause: "delete", text: (_, w) => w.toast });
    return { ...r, undo: async () => { await store.kvSet("gone", raw ?? "{}"); await r.undo(); } };
  });
}

/** "từ tuần sau gym chuyển sang T3, T5": the series stops at `from` (tombstoned there, as removeScope "following") and a new one goes on
 *  from that day on the new rule, with the old one's name, length, parts of the day, place and note. One undo covers both. */
export function reshapeSeries(id: string, from: number, rrule: string, now = Date.now()): Promise<Result> {
  return serial(async () => {
    const tasks = await store.allTasks();
    const me = tasks.find((x) => x.id === id);
    const raw = await store.kvGet("gone");
    if (!me?.rrule || me.section) throw new Error("not a user series");
    const gone = await loadGone();
    gone.series[seriesKey(me)] = from;
    await store.kvSet("gone", JSON.stringify(gone));
    const busy = me.fixed === "busy" && me.start !== undefined;
    const r = await transactNow(now, async (w) => {
      for (const x of [...w.tasks.values()]) if (x.rrule && seriesKey(x) === seriesKey(me) && !x.deletedAt && !x.doneAt && at(x) >= from) await act(w, { op: "delete", target: x.id });
      // a busy block keeps its clock on its new days; a flexible one starts its days at `from`
      const start = busy ? dayStart(from) + (me.start! - dayStart(me.start!)) : Math.max(from, now);
      await act(w, { op: "create", title: me.title, kind: me.kind, effortMinutes: me.effort, tods: me.tods, location: me.location, note: me.note, repeat: rrule,
        ...(busy ? { fixed: "busy" as const, when: new Date(start).toISOString() } : { notBefore: new Date(start).toISOString() }) });
      w.toast = t("seriesDays", { title: me.title, days: rrule.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(",").map((d) => ({ MO: "T2", TU: "T3", WE: "T4", TH: "T5", FR: "T6", SA: "T7", SU: "CN" })[d] ?? d).join(", ") ?? "" });
    }, { cause: "user-task", text: (_, w) => w.toast });
    return { ...r, undo: async () => { await store.kvSet("gone", raw ?? "{}"); await r.undo(); } };
  });
}

/** Occurrences a live user series is missing so it reaches 120 days ahead, as it was made: the rule's own days (BYDAY, INTERVAL, COUNT as a total, UNTIL),
 *  or `COUNT` per week for a plain weekly "n lần mỗi tuần". */
function missing(tasks: Task[], gone: Gone, now: number): Task[] {
  const horizon = now + 119 * DAY;
  const series = new Map<string, Task[]>();
  for (const x of tasks) if (x.source === "user" && x.rrule && !x.parentId) { const k = seriesKey(x), xs = series.get(k); if (xs) xs.push(x); else series.set(k, [x]); }
  const out: Task[] = [];
  for (const [key, xs] of series) {
    const last = xs.reduce((a, b) => (at(b) > at(a) ? b : a));
    const p = rule(last.rrule!);
    const cut = gone.series[key];
    if (!xs.some((x) => !x.deletedAt) || cut === 0) continue;
    const fx = last.fixed === "busy" && last.start !== undefined, len = (last.end ?? 0) - (last.start ?? 0);
    // a fixed block keeps its clock: the new day gets start and end, or the planner drops it
    // a title changed on one occurrence only stays on it; a note set on all of them carries on
    const base = xs.filter((x) => !x.userEdited?.includes("title")).reduce<Task | undefined>((a, b) => (!a || at(b) > at(a) ? b : a), undefined) ?? last;
    const note = xs.every((x) => x.note === last.note) ? last.note : undefined;
    const copy = (o: { notBefore?: number; deadline?: number }): Task => ({
      ...last, ...o, title: base.title, id: uid(), start: undefined, end: undefined, doneAt: undefined, deletedAt: undefined, userEdited: undefined, note, createdAt: now,
      ...(fx ? { start: o.notBefore, end: o.notBefore! + len, notBefore: undefined, deadline: undefined } : {}),
    });
    if (byDay(p) || (p.FREQ === "WEEKLY" && Number(p.INTERVAL) > 1)) {
      const dayOf = (x: Task) => dayStart(fx ? x.start ?? 0 : (x.deadline ?? 0) - 1), have = new Set(xs.map(dayOf));
      const clock = fx ? tod(last.start!) : last.notBefore !== undefined && tod(last.notBefore) ? tod(last.notBefore) : undefined;
      const due = last.deadline !== undefined && tod(last.deadline) ? tod(last.deadline) : undefined;
      // The first occurrence anchors INTERVAL and COUNT, as it did when the series was made.
      for (const d of ruleDays(p, Math.min(...xs.map(dayOf)), now, horizon).days) {
        const x = copy({ notBefore: clock !== undefined ? d + clock : Math.max(now, d), deadline: due !== undefined ? d + due : addDays(d, 1) });
        if (!have.has(d) && (cut === undefined || d < cut) && (fx || !dayGone(x, now))) out.push(x);
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

/** Keeps live repeating series 120 days ahead (a foreground hook); replans only when something was added. */
// Read inside the write queue: two at once (app focus and resume both fire it) each saw the series short and both added copies.
export function topUp(now = Date.now()): Promise<Result | undefined> {
  return serial(async () => {
    // older repeats get their series id once, before a rename of one occurrence splits them off
    const tasks = await store.allTasks(), ids = new Map<string, string>();
    const old = tasks.filter((x) => x.source === "user" && x.rrule && !x.parentId && !x.seriesId);
    for (const x of old) if (!ids.has(seriesKey(x))) ids.set(seriesKey(x), uid());
    const gone = await loadGone();
    if (old.length) {
      for (const [key, id] of ids) if (key in gone.series) gone.series[id] = gone.series[key]; // a deleted stretch stays deleted under the new key
      await store.kvSet("gone", JSON.stringify(gone));
      await store.putTasks(old.map((x) => Object.assign(x, { seriesId: ids.get(seriesKey(x)) })));
    }
    const add = missing(tasks, gone, now);
    return add.length ? transactNow(now, (w) => { for (const x of add) w.tasks.set(x.id, x); }, { self: false, cause: "create", plan: { only: add.map((x) => x.id) } }).then(quiet) : undefined;
  });
}

/** Resolves an id the model gave; a split parent resolves to its sittings. */
function targets(w: Work, id?: string, whole = false): Task[] {
  const task = id ? w.tasks.get(id) : undefined;
  if (!task) return [];
  const kids = [...w.tasks.values()].filter((c) => c.parentId === task.id && !c.doneAt && !c.deletedAt);
  return kids.length ? (whole ? [task, ...kids] : kids) : [task]; // whole: a name, place, note or kind is the task's and every sitting's
}


// A name, place or note changed on one of a series (a repeat, a timetable section, sittings) reaches every other one when they all
// still had the same value: one that was renamed on its own keeps its own, and so does the field.
function seriesWide(w: Work, a: Action, own: Task[]): [Task, Action][] {
  const me = a.target ? w.tasks.get(a.target) : undefined;
  if (!me || (a.title === undefined && a.location === undefined && a.note === undefined)) return [];
  const ids = new Set(scopeIds([...w.tasks.values()], me.id, "all"));
  if (me.parentId) ids.add(me.parentId);
  const kin = [...ids].map((id) => w.tasks.get(id)!).filter((x) => x && !x.deletedAt && !own.includes(x));
  if (!kin.length) return [];
  const same = (f: (x: Task) => unknown) => [...own, ...kin].every((x) => f(x) === f(me));
  const b: Action = { op: "edit", target: a.target };
  if (a.title && same((x) => x.title)) b.title = a.title;
  if (a.location !== undefined && same((x) => x.location ?? "")) b.location = a.location;
  if (a.note !== undefined && same((x) => x.note ?? "")) b.note = a.note;
  return b.title !== undefined || b.location !== undefined || b.note !== undefined ? kin.map((x) => [x, b]) : [];
}

function pushRule(w: Work, r: Omit<Rule, "id" | "at">) {
  w.model = { ...w.model, rules: [...(w.model.rules ?? []), { ...r, id: uid(), at: w.now }] };
  w.toast = t("ruleKept", { text: r.text });
}

async function act(w: Work, a: Action, refs = new Map<string, string>()) {
  const { now } = w;
  if (a.op === "create") {
    const title = a.title?.trim();
    if (!title) return;
    // a repeat with no said clock is flexible: its default 09:00 `when` is no start, the day's own start is (notBefore)
    const when = a.repeat && !a.fixed ? ms(a.notBefore) ?? ms(a.when) : ms(a.when) ?? ms(a.notBefore);
    if (a.repeat) {
      const gone = await loadGone();
      if (delete gone.series[`${a.repeat}|${title}`]) await store.kvSet("gone", JSON.stringify(gone)); // a fresh series replaces the deleted one
    }
    // A weekday said for a series ("hằng tuần"): every open member's rule takes it, and only that weekday's occurrences are made.
    const members = a.repeat && a.seriesId ? [...w.tasks.values()].filter((x) => x.seriesId === a.seriesId && x.rrule && !x.deletedAt && !x.doneAt && !x.parentId) : [];
    let rrule = a.repeat;
    if (members.length) {
      rrule = withDay(members[0].rrule!, a.repeat!);
      if (rrule === members[0].rrule) { w.toast = t("added", { title }); return; }
      for (const m of members) w.tasks.set(m.id, { ...m, rrule });
    }
    // Saying the same repeat twice (voice then typed, alt chip) must not make a second copy: it could never be deleted as one series.
    const clock = (x: { start?: number }) => (x.start === undefined ? -1 : new Date(x.start).getHours() * 60 + new Date(x.start).getMinutes());
    if (a.repeat && [...w.tasks.values()].some((x) => x.rrule === a.repeat && !x.deletedAt && !x.doneAt && x.title.toLowerCase() === title.toLowerCase() && JSON.stringify(x.tods ?? []) === JSON.stringify(a.tods ?? []) && clock(x) === (a.fixed && when !== undefined ? clock({ start: when }) : -1))) { w.toast = t("added", { title }); return; }
    const occ = occurrences(a.repeat, now, when, ms(a.deadline));
    if (occ.short) w.short = true;
    const vec = embed(title);
    // A kind the user corrected on a title that reads alike wins.
    const near = [...w.tasks.values()].filter((x) => x.vec && x.userEdited?.includes("kind")).map((x) => ({ c: cosine(vec, x.vec!), k: x.kind })).filter((n) => n.c > 0.6).sort((p, q) => q.c - p.c)[0];
    const fixed = a.fixed && when !== undefined ? a.fixed : undefined;
    // a repeat's said window is its parts of the day (tods), which every occurrence keeps; a day's notAfter would hold only the first
    const notAfter = a.repeat ? undefined : ms(a.notAfter);
    const seriesId = a.seriesId ?? (a.repeat ? uid() : undefined); // a one-off session carries its series' id, with no rule
    // an order: the predecessor is a ref of this batch (its id is set up front) or an existing task; an anchor that is a task id is the exam it prepares
    const after = a.after && (refs.get(a.after) ?? (w.tasks.get(a.after) && !w.tasks.get(a.after)!.deletedAt ? a.after : undefined));
    const forId = a.anchor && w.tasks.get(a.anchor) && !w.tasks.get(a.anchor)!.deletedAt ? a.anchor : undefined; // an exam id (the sizer's anchor is a date)
    let own = a.ref ? refs.get(a.ref) : undefined; // the first occurrence takes the id the batch gave its ref
    for (const o of occ.list) {
      if (!fixed && dayGone({ rrule: a.repeat, deadline: o.deadline, tods: a.tods, effort: a.effortMinutes ?? 0 } as Task, now)) continue; // today's part already gone: from the next day
      const task: Task = {
        id: own ?? uid(), title, vec, kind: near?.k ?? a.kind ?? "other", source: "user", effort: a.effortMinutes ?? 0, createdAt: now,
        deadline: o.deadline, notBefore: o.notBefore, rrule, ...(seriesId ? { seriesId } : {}), ...(a.location ? { location: a.location } : {}), ...(a.note ? { note: a.note } : {}), ...(notAfter !== undefined ? { notAfter } : {}), ...(a.tods?.length ? { tods: a.tods } : {}),
        ...(a.maxSitting ? { maxSitting: a.maxSitting } : {}), ...(a.effortGuessed ? { effortGuessed: true } : {}), ...(a.effortGuessed && a.cls ? { cls: a.cls, guessMin: a.guessMin } : {}),
        ...(after ? { after: [after] } : {}), ...(forId ? { forId } : {}),
      };
      own = undefined;
      if (fixed && o.notBefore !== undefined) { // an exact said time is a busy block, not a plan
        task.effort = effort(task, w.model);
        Object.assign(task, { fixed, start: o.notBefore, end: o.notBefore + task.effort * 60_000, notBefore: undefined, deadline: undefined, notAfter: undefined, tods: undefined });
      }
      w.tasks.set(task.id, task);
    }
    w.toast = t("added", { title });
    return;
  }
  const whole = a.op === "edit" && a.when === undefined && a.deadline === undefined && !a.effortMinutes;
  const all = targets(w, a.target, whole), lead = [...all].sort((x, y) => (x.start ?? Infinity) - (y.start ?? Infinity))[0];
  for (const [tk, b] of [...all.map((x): [Task, Action] => [x, a]), ...(whole ? seriesWide(w, a, all) : [])]) {
    a = b; // the rest of a series takes only the fields it shared (seriesWide)
    if (a.op === "done") {
      if (tk.doneAt) continue; // a second tap (card, row, widget) must not log a second done
      const next = { ...tk, doneAt: now, misses: undefined };
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
      if (tk.deletedAt) continue; // a screen saving as it closes after a delete must not touch the deleted task (Undo skips a changed one)
      const when = ms(a.when);
      const edited = new Set(tk.userEdited);
      const next: Task = { ...tk };
      if (a.title) { next.title = a.title; edited.add("title"); w.toast = t("renamed", { title: a.title }); }
      if (a.effortMinutes) { next.effort = a.effortMinutes; edited.add("effort"); next.effortGuessed = undefined; } // said now, no longer a guess
      if (a.kind) { next.kind = a.kind as Kind; edited.add("kind"); }
      if (a.location !== undefined) { next.location = a.location || undefined; edited.add("location"); } // "" clears it
      if (a.deadline === "") { next.deadline = undefined; edited.add("deadline"); }
      if (a.note !== undefined) { next.note = a.note; edited.add("note"); }
      if (a.reopen && next.doneAt) {
        next.doneAt = undefined;
        const p = tk.parentId && w.tasks.get(tk.parentId);
        if (p && p.doneAt) w.tasks.set(p.id, { ...p, doneAt: undefined }); // a sitting open again: its task is not done either
        w.toast = t("reopened", { title: tk.title });
      }
      const dl = ms(a.deadline);
      if (dl) { next.deadline = dl; edited.add("deadline"); }
      if (a.anchor && w.tasks.get(a.anchor)?.fixed === "exam") next.forId = a.anchor; // the anchor picker: prep for that exam
      // a time the user sets wins over the parts of the day it was said in
      if (when !== undefined) { next.tods = undefined; next.notAfter = undefined; next.userDay = undefined; } // a clock set by hand ends any window a drop or a said part left
      if (when !== undefined && tk !== lead) {
        // A split task moved as a whole: its first open sitting takes the time, the rest are planned after it, not stacked on it.
        Object.assign(next, { start: undefined, end: undefined, pinned: false, notBefore: when + (lead.effort || 30) * 60_000 });
        edited.delete("start");
      } else if (when !== undefined) {
        next.notBefore = when;
        next.start = when;
        w.timed.add(tk.id);
        // A time you set is a preference, not a pin: it holds until its day ends (or its start passes), then the planner may move it. Only "Đừng dời" pins.
        next.holdUntil = addDays(dayStart(when), 1);
        edited.add("start");
        next.end = when + (next.effort || 30) * 60_000; // next.effort: the length may be edited in the same action
        // From where it was before the wheel's held values (a.from), else a settled move would teach from its own new time.
        const from = a.from?.start !== undefined ? a.from : { start: tk.start, end: tk.end };
        // Another day at the same time of day is a change of day, not of time: nothing to learn about the hour, and not "dời".
        const sameClock = from.start !== undefined && from.start !== when && hm(from.start) === hm(when);
        if (from.start !== undefined && from.start !== when && !sameClock) {
          w.log("drag", tk, { fromStart: from.start, fromEnd: from.end, toStart: when });
          w.sub = t("learnedAvoid", { time: partAt(new Date(from.start).getHours()) }); // the part it was dragged away from, never the clock
        }
        w.toast = t("moved", { title: next.title, time: at12(when, now) }); // one line for a move, a day change or a put-back alike
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
export const serial = <T>(fn: () => Promise<T>): Promise<T> => { const r = chain.then(fn); chain = r.catch(() => {}); return r; };

/** A flexible task still waiting for a time (not a split parent, whose sittings hold the time): any freed time should take it. */
export const waiting = (all: Task[], now = Date.now()) => {
  const parents = new Set(all.filter((c) => c.parentId && !c.deletedAt).map((c) => c.parentId));
  // a repeat's gone day stays missed (the planner skips it), so it is not waiting; nor is one whose window already closed, or one a month off (never placeable yet)
  return all.filter((x) => !x.fixed && !x.doneAt && !x.deletedAt && x.start === undefined && !parents.has(x.id) && !(x.rrule && (x.deadline ?? x.notAfter ?? Infinity) <= now)
    && (x.deadline ?? x.notAfter ?? Infinity) > now && (x.notBefore ?? now) < now + 30 * DAY);
};

/** A transaction's options. `cause` plans (none plans nothing); `dry` plans but writes nothing; `self`: moves are the user's own. */
type TxOpts = { cause?: Cause; self?: boolean; quiet?: boolean; dry?: boolean; plan?: Opts; text?: (d: Diff | undefined, w: Work) => string | undefined };

/** Runs one mutation, optionally replans, mirrors to the calendar and persists. One call is one undo group. */
function transact(now: number, mutate: (w: Work) => Promise<void> | void, o: TxOpts = {}): Promise<Result> {
  return serial(() => transactNow(now, mutate, o));
}

async function transactNow(now: number, mutate: (w: Work) => Promise<void> | void, o: TxOpts = {}): Promise<Result> {
  const model0 = await store.loadModel(now);
  const before = new Map((await store.allTasks()).map((x) => [x.id, x]));
  const w: Work = {
    timed: new Set(), tasks: new Map(before), model: model0, events: [], moves: [], now,
    log(type, task, data) {
      if (o.quiet) return; // a value held mid-edit: the edit that settles it is the one worth learning from
      const ev: TaskEvent = { id: uid(), taskId: task.id, type, at: now, data };
      w.events.push(ev);
      stat(w.model, ev, task);
      // a tick learns the rest it took after a lecture or exam: the day's class ends come from the same tasks (see learn)
      const classEnds = type !== "done" ? [] : [...w.tasks.values()].filter((x) => (x.fixed === "lecture" || x.fixed === "exam") && x.end !== undefined).map((x) => x.end!);
      w.model = learn(w.model, ev, task, false, classEnds);
    },
  };
  const kv0 = { moves: await store.kvGet("moves"), warn: await store.kvGet("warn") };
  await mutate(w);

  let diff: Diff | undefined;
  // Times set by hand in this transaction (a held wheel value was saved before, so `before` already has it: this is how we know).
  const dragged = new Set(w.events.filter((e) => e.type === "drag").map((e) => e.taskId));
  const handSet = new Set([...dragged, ...w.timed]); // a time set on a task that had none is set as much as a dragged one: it knocks older hand-set tasks and can clash with a class
  const span = (x: Task) => !x.doneAt && !x.deletedAt && x.start !== undefined && x.end !== undefined;
  const set = [...handSet].map((id) => w.tasks.get(id)!).filter((x) => x && span(x));
  // A time set wholly in the past is kept as set (pinned, as any set time) and planned around by no one: nothing new is planned for it. Part after now replans.
  const past = set.length === handSet.size && set.length > 0 && set.every((x) => x.end! <= now) && ![...w.tasks.keys()].some((id) => !before.has(id));
  // "pull": time was freed (a done, a delete, a dropped sitting). Later pieces may take it, earlier only; the rest of the calendar holds.
  // Every freed stretch still ahead (a series deleted whole frees many, an early finish frees from now) may take later pieces, earlier only.
  const pullCause = o.cause === "early-done" || o.cause === "delete"; // time freed: planning only when a piece can take it
  let pullGaps: { from: number; to: number }[] = [];
  if (pullCause) {
    const freed = [...w.tasks.values()].filter((x) => { const b = before.get(x.id); return !!b && b.start !== undefined && b.end !== undefined && !b.doneAt && !b.deletedAt && (!!x.doneAt || !!x.deletedAt) && b.end > now; }).map((x) => before.get(x.id)!).sort((a, b) => a.start! - b.start!);
    pullGaps = freed.map((b) => ({ from: Math.max(now, b.start!), to: b.end! }));
  }
  // Only when a piece could take it: flexible, not held by hand (a hold that ran out is a preference), and starting after the gap. Otherwise nothing is planned at all.
  const can = (x: Task, from: number) => !x.fixed && !x.doneAt && !x.deletedAt && !x.pinned && !holding(x, now) && !(x.userEdited?.includes("start") && x.holdUntil === undefined) && (x.start === undefined || x.start > from);
  pullGaps = pullGaps.filter((g) => g.to > g.from && [...w.tasks.values()].some((x) => can(x, g.from)));
  const hasPull = pullGaps.length > 0;
  const pulled: string[] = []; // placed earlier than before, or unscheduled before: the freed time took them
  // A pull that frees nothing ahead still places the tasks waiting for a time, and only those (placing them moves nothing placed).
  const waitIds = pullCause && !hasPull ? waiting([...w.tasks.values()], now).map((x) => x.id) : [];
  const waits = waitIds.length > 0;
  const clashes = set.flatMap((mine) => [...w.tasks.values()].filter((f) => f.fixed && f.id !== mine.id && span(f) && f.start! < mine.end! && mine.start! < f.end!).map((fixed) => ({ mine, fixed })));
  const cause = o.cause ?? (clashes.length ? "conflict" : undefined); // a time set over a fixed item plans even with no cause of its own
  if (((cause && !pullCause) || hasPull || waits) && (!past || hasPull || waits)) {
    // The newest time set by hand wins: an older hand-set flexible task under it gives way and is planned again (not one already running).
    for (const a of set) for (const x of [...w.tasks.values()]) {
      if (x.id === a.id || x.fixed || !span(x) || !(x.start! < a.end! && a.start! < x.end!)) continue;
      if (!x.pinned) { if (x.start! <= now && now < x.end!) w.tasks.set(x.id, { ...x, start: undefined, end: undefined }); continue; } // a running flexible block is busy to the planner: free it so it is planned again
      if (x.start! <= now) continue;
      w.tasks.set(x.id, { ...x, pinned: false, notBefore: x.notBefore === x.start ? undefined : x.notBefore, userEdited: x.userEdited?.filter((f) => f !== "start") });
    }
    // The slots the user just set tasks off: a flexible task is not knocked back into one (soft, see value.ts moveCost).
    const avoid = w.events.filter((e) => e.type === "drag" && e.data?.fromStart !== undefined && e.data?.fromEnd !== undefined).map((e) => ({ from: Number(e.data!.fromStart), to: Number(e.data!.fromEnd) }));
    const only = w.only ?? (waits ? waitIds : undefined);
    const r = plan([...w.tasks.values()], [], w.model, now, { ...o.plan, avoid, ...(hasPull ? { pull: pullGaps } : {}), ...(only ? { only } : {}) });
    diff = r.diff;
    w.model = r.model;
    // What changed under the plan this time: new or moved fixed/pinned items, and new rules. A move's cause is the one over its old slot.
    const hit = [...w.tasks.values()].filter((x) => (x.fixed || x.pinned || holding(x, now)) && !x.deletedAt && x.start !== undefined && x.end !== undefined
      && (dragged.has(x.id) || before.get(x.id)?.start !== x.start || before.get(x.id)?.end !== x.end || !!before.get(x.id)?.deletedAt));
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
      // an already-unplaced task keeps its object: a plan that finds it still has no room changed nothing (no toast, no write)
      if (task && !owned(task) && !(old && task.start === undefined && task.end === undefined)) w.tasks.set(u.id, { ...task, start: undefined, end: undefined, effort: old ? task.effort : u.effort });
    }
    for (const pl of diff.placed) {
      const task = w.tasks.get(pl.id) ?? sitting(pl.id);
      if (!task || owned(task)) continue;
      const mis = missedReplan(task, pl, now), shrunk = mis?.effort !== undefined;
      w.tasks.set(pl.id, { ...task, start: pl.start, end: shrunk ? pl.start + mis.effort! * 60_000 : pl.end, effort: shrunk ? mis.effort! : Math.round((pl.end - pl.start) / 60_000), ...(mis ? { misses: mis.misses } : {}) });
      if (hasPull && (pl.from === undefined || pl.from > pl.start)) pulled.push(pl.id);
      if (pl.from !== undefined && pl.from !== pl.start && !dragged.has(pl.id)) w.moves.push({ id: pl.id, title: task.title, from: pl.from, to: pl.start, why: pl.why, cause: causeOf(task, pl.from, pl.from + pl.end - pl.start), at: now, ...(o.self === false ? {} : { self: true }) });
      w.events.push({ id: uid(), taskId: pl.id, type: "placed", at: now, data: { policy: pl.policy, arm: pl.arm, x: pl.x } });
    }
    if (w.moves.some((m) => m.cause)) for (const m of w.moves) m.cause ??= t("causeKnock"); // moved to make room for a caused move
    if (pulled.length === 1) { const got = diff.placed.find((p) => p.id === pulled[0])!; w.sub = t("pulledIn", { title: w.tasks.get(got.id)!.title, part: partAt(new Date(got.start).getHours()) }); }
    else if (pulled.length > 1) w.sub = t("pulledInN", { n: pulled.length, part: partAt(new Date(diff.placed.find((p) => p.id === pulled[0])!.start).getHours()) });
  }

  const changed = [...w.tasks.values()].filter((x) => before.get(x.id) !== x);
  const lost = (diff?.unplaced ?? []).map((u) => before.get(u.id)).filter((x): x is Task => !!x && x.start !== undefined && x.start > now);
  const extra = { moves: w.moves, clashes, lost };
  if (o.dry) return { toast: "", changed: false, undo: async () => {}, ...extra }; // a preview: nothing written
  await store.putTasks(changed);
  for (const e of w.events) await store.putEvent(e);
  // a guessed length (per frame class) against what the user finished: its multiplier learns from it
  for (const e of w.events) {
    const x = w.tasks.get(e.taskId);
    // an exam's prep learns too (its length is the sizer's, not said); a sitting is measured against its own length, not the whole task's
    if (e.type === "done" && x?.cls && (x.effortGuessed || x.forId) && x.guessMin && x.start !== undefined && e.at >= x.start && e.at <= (x.end ?? x.start) + 30 * 60_000)
      await learnClass(x.cls, Math.min(240, Math.max(15, (e.at - x.start) / 60_000)) / (x.parentId && x.effort > 0 ? x.effort : x.guessMin));
  }
  let modelV: string | undefined; // the model this change wrote: undo restores it only while it is still the stored one
  if (w.model !== model0) { await store.saveModel(w.model); modelV = uid(); await store.kvSet("model.v", modelV); } // ~500 KB of JSON: not rewritten by a write that learned nothing (a held wheel value)
  if (diff) { await store.kvSet("plannedAt", String(now)); await recordMoves(w.moves); await saveWarn(diff.warn ?? []); }

  const ins = diff?.insight;
  const insTitle = ins && fill(ins.template, ins.vars);
  const toast = o.text?.(diff, w) ?? insTitle ?? w.toast ?? t("nothing");
  // No room: a task with a shrink-to-fit length (its free time) or, with none at all, a split across days.
  const short = diff?.warn?.find((x) => x.free > 0 && x.free < x.need);
  const stuck = diff?.unplaced?.find((u) => w.tasks.get(u.id)?.title);
  const alt = short ? { id: short.id, title: short.title, minutes: short.free } : stuck ? { id: stuck.id, title: w.tasks.get(stuck.id)!.title, split: true } : undefined;
  return {
    toast,
    sub: [w.sub ?? (ins && toast === insTitle ? fill(ins.sub, ins.vars) : undefined), w.short ? t("repeatShort") : undefined].filter(Boolean).join(". ") || undefined,
    changed: changed.length > 0,
    steps: diff?.steps,
    warn: diff?.warn,
    moved: w.moves.length,
    alt,
    ...extra,
    undoable: true,
    undo: () => serial(async () => {
      // Only a task still as this change left it goes back: an edit made since (a rename between two picks, a later sync) stays.
      const now = new Map((await store.allTasks()).map((x) => [x.id, x]));
      const mine = changed.filter((x) => { const c = now.get(x.id); return !c || canon(c) === canon(x); });
      const gone = mine.filter((x) => !before.has(x.id));
      const restored = mine.filter((x) => before.has(x.id)).map((x) => before.get(x.id)!);
      await store.removeTasks(gone.map((x) => x.id));
      await store.putTasks(restored);
      await store.removeEvents(w.events.map((e) => e.id));
      await stats.forget(kv, w.events.map((e) => e.id));
      if (modelV !== undefined && (await store.kvGet("model.v")) === modelV) await store.saveModel(model0); // a later change learned since: its learning stays
      for (const k of ["moves", "warn"] as const) await store.kvSet(k, kv0[k] ?? "[]");
    }),
  };
}

/** The cause a change plans under. A title or note alone plans nothing; a done or delete frees time, so only a task still without one may take it. */
function causeOf(actions: Action[]): Cause | undefined {
  const edits = actions.filter((a) => a.op === "edit");
  return actions.some((a) => a.op === "create") ? "create"
    : edits.some((a) => a.deadline !== undefined) ? "deadline"
    : edits.some((a) => a.when !== undefined || !!a.effortMinutes) ? "time-edit"
    : edits.some((a) => a.kind) ? "kind-change"
    : actions.some((a) => a.op === "done") ? "early-done"
    : actions.some((a) => a.op === "delete") ? "delete" : undefined;
}

/** One spoken line: all actions, one plan, one undo. */
export function apply(actions: Action[], now = Date.now()): Promise<Result> {
  return transact(now, async (w) => { const refs = new Map(actions.flatMap((a) => (a.ref ? [[a.ref, uid()] as const] : []))); for (const a of actions) await act(w, a, refs); }, {
    cause: causeOf(actions),
    text: (d, w) => {
      const created = d?.placed.length && actions.some((a) => a.op === "create");
      if (created && d.placed.length > 1) {
        // Counts tasks, not sittings: the sub names the most-split one ("Bài luận chia 3 buổi"), else the days.
        const by = new Map<string, { title: string; n: number }>();
        for (const p of d.placed) { const x = w.tasks.get(p.id); const k = x?.parentId ?? p.id; const e = by.get(k) ?? { title: x?.title ?? "", n: 0 }; e.n++; by.set(k, e); }
        const top = [...by.values()].sort((a, b) => b.n - a.n)[0];
        w.sub = top.n >= 2 ? t("plannedSplit", { title: top.title, k: top.n }) : t("plannedSub", { d: new Set(d.placed.map((p) => dayStart(p.start))).size });
        return t("planned", { n: by.size });
      }
      return d?.insight ? fill(d.insight.template, d.insight.vars) : w.toast;
    },
  });
}

export type LiveEdit = { when?: number; effortMinutes?: number; deadline?: number | "" };
export const toAction = (id: string, e: LiveEdit): Action => ({ op: "edit", target: id, ...(e.when !== undefined ? { when: new Date(e.when).toISOString() } : {}),
  ...(e.effortMinutes ? { effortMinutes: e.effortMinutes } : {}), ...(e.deadline !== undefined ? { deadline: e.deadline === "" ? "" : new Date(e.deadline).toISOString() } : {}) });
// One task's live edits (wheel turns): each value is saved at once with nothing else moved, so a force quit loses nothing.
// Once the edits rest for `rest` ms, one replan moves what the new value now clashes with. Edits within 30 s are one session:
// that replan first undoes the session's last one, so tasks knocked aside by a value passed over go back.
// shortcut: the undo skips tasks changed since (see canon), so a sync landing mid-session keeps its writes; fine for a wheel.
const sessions = new Map<string, { last?: Promise<Result | undefined>; at: number; from?: { start?: number; end?: number }; timer?: ReturnType<typeof setTimeout>; drop?: () => void }>();
/** Resolves with the replan's Result once the edits rest, or undefined when a later edit took over. */
export function liveEdit(id: string, e: LiveEdit, now = Date.now(), rest = 500): Promise<Result | undefined> {
  const ss = sessions.get(id) ?? { at: 0 };
  sessions.set(id, ss);
  if (now - ss.at >= 30_000) { ss.last = undefined; ss.from = undefined; } // a new session: its first held write records where the task was
  ss.at = now;
  clearTimeout(ss.timer);
  ss.drop?.();
  const held = transact(now, (w) => { const tk = w.tasks.get(id); ss.from ??= { start: tk?.start, end: tk?.end }; return act(w, toAction(id, e)); }, { quiet: true });
  return new Promise((done, fail) => {
    ss.drop = () => done(undefined);
    ss.timer = setTimeout(() => {
      ss.drop = undefined;
      const prev = ss.last;
      const r = held.then(() => (prev ?? Promise.resolve(undefined)).catch(() => undefined)).then(async (p) => { await p?.undo(); return apply([{ ...toAction(id, e), from: ss.from }], now); });
      ss.last = r.catch(() => undefined);
      r.then(done, fail);
    }, rest);
    held.catch(fail); // the held write itself failed: say so now
  });
}
/** What a value would do, with nothing written: the detail screen's line while its dial is open. */
export const preview = (id: string, e: LiveEdit, now = Date.now()) => transact(now, (w) => act(w, toAction(id, e)), { dry: true, cause: causeOf([toAction(id, e)]) });
/** A start (and length) set on a wheel: liveEdit for a time. */
export const retime = (id: string, start: number, minutes?: number, now = Date.now(), rest?: number) => liveEdit(id, { when: start, effortMinutes: minutes }, now, rest);

export const swipeDone = (id: string, now = Date.now()) => transact(now, (w) => act(w, { op: "done", target: id }), { cause: "early-done", text: (_, w) => w.toast });
export const swipeLater = (id: string, now = Date.now()) =>
  transact(now, (w) => { const tk = w.tasks.get(id); if (tk?.fixed) return; if (tk) w.log("later", tk); w.toast = t("later"); }, { cause: "user-task", plan: { later: id, only: [id] } }); // a class or busy block never moves: nothing to learn, nothing said

/** Starts the suggested gap task now. */
export const take = (id: string, start: number, end: number, now = Date.now()) =>
  transact(now, (w) => { const tk = w.tasks.get(id); if (tk) w.tasks.set(id, { ...tk, start, end, notBefore: start, notAfter: undefined, userDay: undefined, userEdited: [...(tk.userEdited ?? []), "start"] }); w.toast = t("moved", { title: tk?.title ?? "", time: at12(start, now) }); }, { cause: "user-task" });

/** "Lặp lại … hằng tuần" said yes: the repeat is created through the usual series path (Action.repeat). */
export const acceptSeries = (o: SeriesOffer, now = Date.now()) => apply([{ op: "create", title: o.title, kind: o.kind, effortMinutes: o.effort, repeat: o.rrule }], now);
export const SERIES_NO = "series.no";
/** "Không": remembered, so the same title on the same weekday is not offered again. */
export async function declineSeries(key: string) {
  const no: string[] = JSON.parse((await store.kvGet(SERIES_NO)) ?? "[]");
  await store.kvSet(SERIES_NO, JSON.stringify([...no, key]));
}

/** Replan with no edits (morning, sync). */
export const putBack = async (id: string, start: number, now = Date.now()) => {
  const r = await transact(now, async (w) => { await act(w, { op: "edit", target: id, when: new Date(start).toISOString() }); w.toast = t("moved", { title: w.tasks.get(id)?.title ?? "", time: at12(start, now) }); }, { cause: "time-edit" });
  await seeMoves([id]);
  return r;
};

export const pin = (id: string, on = true, now = Date.now()) =>
  transact(now, (w) => {
    const tk = w.tasks.get(id);
    if (!tk) return;
    w.tasks.set(id, { ...tk, pinned: on, holdUntil: undefined, userEdited: on ? [...new Set([...(tk.userEdited ?? []), "start"])] : tk.userEdited });
    w.toast = t(on ? "pinned" : "unpinned", { title: tk.title });
  });

export const makeRoom = (fixId: string, deadline: number, now = Date.now()) =>
  transact(now, (w) => {
    const tk = w.tasks.get(fixId);
    if (!tk) return;
    for (const x of [tk, ...targets(w, fixId)]) w.tasks.set(x.id, { ...x, notBefore: deadline });
    w.toast = t("madeRoom", { title: tk.title });
  }, { cause: "conflict" });

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

/** Forget what was learned from drags: an hour (its drags and cold weights) or a part of the day (its learned part weights and hypotheses). */
export const forgetWhen = (when: { hour: number } | { part: number }, now = Date.now()) =>
  transact(now, (w) => {
    const m = { ...w.model, arms: [...w.model.arms], parts: [...(w.model.parts ?? [])], hyps: (w.model.hyps ?? []).map((h) => ({ ...h })) };
    forgetLearned(m, when);
    w.model = m;
    w.toast = "hour" in when ? t("avoidGone", { a: when.hour }) : undefined;
  });

/** "Luôn vậy" (rule) or "Chỉ lần này" (off) on the hypothesis a drag gave (Model.hyps): the planner's arms are not touched. */
export const settleHyp = (kind: Kind, part: number, state: "rule" | "off", now = Date.now()) =>
  transact(now, (w) => {
    const m = { ...w.model, hyps: (w.model.hyps ?? []).map((h) => ({ ...h })) };
    settleLearned(m, kind, part, state);
    w.model = m;
  });

// Replans waiting for their turn are one: the tick, a foreground and a sync landing together plan once, not three times over the whole calendar.
let waitingReplan: Promise<Result> | undefined;
export function replan(now = Date.now(), toast?: (d: Diff) => string | undefined, cause: Cause = "timetable", only?: string[]) {
  const shared = !toast && !only; // only the plain whole-calendar replans are one: a narrowed one must not stand in for another
  if (shared && waitingReplan) return waitingReplan;
  const r = transact(now, () => { if (waitingReplan === r) waitingReplan = undefined; }, { self: false, cause, plan: only ? { only } : undefined, text: (d) => (d && toast ? toast(d) : undefined) }).then(quiet);
  if (shared) { waitingReplan = r; const clear = () => { if (waitingReplan === r) waitingReplan = undefined; }; r.then(clear, clear); }
  return r;
}

/** Applies upstream upserts and soft deletes, replans, and reports moved tasks. `plan` false stores only (a drain plans once at its end); upserts or deletes plan as the timetable's change. */
export function ingest(upserts: Task[], deletes: string[], now = Date.now(), notices: Notice[] = [], plan = true) {
  return transact(now, (w) => {
    // `upserts` were worked out from a snapshot taken before this write waited its turn: what the user did meanwhile wins.
    for (const u of upserts) {
      const x = w.tasks.get(u.id);
      if (!x) { w.tasks.set(u.id, u); continue; }
      const mine = x.userEdited?.includes("start") && x.start !== u.start;
      w.tasks.set(u.id, { ...u, doneAt: u.doneAt ?? x.doneAt, ...(x.userEdited?.includes("deleted") ? { deletedAt: u.deletedAt ?? x.deletedAt, userEdited: [...new Set([...(u.userEdited ?? []), "deleted"])] } : {}), ...(mine ? { start: x.start, end: x.end, userEdited: [...new Set([...(u.userEdited ?? []), "start"])] } : {}) });
    }
    for (const id of deletes) { const x = w.tasks.get(id); if (x && !x.doneAt) w.tasks.set(id, { ...x, deletedAt: now }); }
  }, {
    self: false,
    cause: plan && (upserts.length || deletes.length) ? "timetable" : undefined,
    text: (d, w) => {
      if (notices.length === 1) w.sub = notices[0].sub;
      return notices.length ? notices.map((n) => n.title).join(". ") : d?.displaced.length ? t("synced", { n: d.displaced.length }) : t("syncedNew");
    },
  }).then(quiet);
}

const CLASS_KEY = "nlu.classMult";
/** Adds one ratio (actual or needed minutes over the guess) to a frame class's multiplier logs. */
async function learnClass(cls: string, ratio: number) {
  await store.kvSet(CLASS_KEY, JSON.stringify(addClassLog(classLogsOf(await store.kvGet(CLASS_KEY)), cls, ratio)));
}
/** The learned multiplier per frame class, for the reader's sizer. */
export const loadClassMult = async (): Promise<Record<string, number>> => classMults(classLogsOf(await store.kvGet(CLASS_KEY)));
/** "Cần thêm một buổi": a guessed length the user needed one more sitting of, a ratio above the guess. */
export async function needMore(x: Task) {
  if (x.cls && x.effortGuessed && x.guessMin) await learnClass(x.cls, (x.guessMin + (x.maxSitting ?? 60)) / x.guessMin);
}

const sitIx = (c: Task) => Number(c.id.slice(c.id.lastIndexOf("#") + 1)) || 0;
const sitsOf = (w: Work, parentId: string) => [...w.tasks.values()].filter((c) => c.parentId === parentId && !c.deletedAt).sort((a, b) => sitIx(a) - sitIx(b));
const openSits = (w: Work, parentId: string) => sitsOf(w, parentId).filter((c) => !c.doneAt);
/** "Cần thêm một buổi" / "Còn nữa": one sitting more, the same length as the last open one (the last one, once all are done), after it; the planner places it. */
/** After a sitting is added or dropped, the open ones are placed again from scratch, so they spread evenly up to the due
 * (one a day, sized by free time). A running one, one pinned or set by hand, and a done one stay. Returns how many were freed. */
function respread(w: Work, parentId: string, now: number): number {
  let n = 0;
  for (const c of openSits(w, parentId)) {
    if (c.pinned || c.userEdited?.includes("start") || (c.start !== undefined && c.end !== undefined && c.start <= now && now < c.end)) continue;
    w.tasks.set(c.id, { ...c, start: undefined, end: undefined }); n++;
  }
  return n;
}

export function addSitting(parentId: string, now = Date.now()): Promise<Result> {
  let added: string | undefined;
  return transact(now, (w) => {
    const parent = w.tasks.get(parentId);
    // An unsplit task becomes a split one: it is its own first sitting (time and done state kept), and the parent is the container.
    if (parent && !parent.deletedAt && !sitsOf(w, parentId).length) {
      w.tasks.set(`${parentId}#1`, { ...parent, id: `${parentId}#1`, parentId });
      w.tasks.set(parentId, { ...parent, start: undefined, end: undefined, doneAt: undefined, pinned: false });
    }
    const last = openSits(w, parentId).pop() ?? sitsOf(w, parentId).pop();
    if (!last) return;
    const kids = [...w.tasks.values()].filter((c) => c.parentId === parentId);
    added = `${parentId}#${Math.max(...kids.map(sitIx)) + 1}`; // past every id made, deleted ones too
    w.tasks.set(added, { ...last, id: added, start: undefined, end: undefined, pinned: false, fixed: undefined, notBefore: undefined, userEdited: undefined, doneAt: undefined, deletedAt: undefined });
    w.toast = t("sittingAdded", { title: last.title });
    const n = respread(w, parentId, now);
    if (n > 1) w.sub = t("respread", { n });
  }, {
    cause: "create",
    text: (d, w) => { const p = d?.placed.find((x) => x.id === added); if (p && !w.sub) w.sub = at12(p.start, now); return w.toast; },
  });
}
/** "Còn nữa" shows on a guessed task's last sitting (by time; the task itself when it is unsplit) once it is done or running now; never for a said length. */
export function lastMore(sits: Task[], now: number): Task | undefined {
  const last = sits.filter((c) => !c.deletedAt).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity)).pop();
  if (!last || !last.cls || !last.effortGuessed || !last.guessMin) return undefined;
  const running = last.start !== undefined && last.end !== undefined && last.start <= now && now < last.end;
  return last.doneAt || running ? last : undefined;
}
/** "Còn nữa": one sitting more, and the class learns the guess needed one (as "Cần thêm một buổi" does). */
export async function stillMore(last: Task, now = Date.now()): Promise<Result> {
  const r = await addSitting(last.parentId ?? last.id, now);
  await needMore(last);
  return r;
}
/** "Bớt một buổi": the last open sitting goes; only with two or more open, so the split keeps one. */
/** Drops one open sitting (`id`, else the last) and spreads the rest again; never the last open one, which would leave none. */
export function dropSitting(parentId: string, now = Date.now(), id?: string): Promise<Result> {
  return transact(now, async (w) => {
    w.only = [parentId]; // the respread is the task's own sittings; nothing else moves
    const open = openSits(w, parentId);
    if (open.length < 2) return;
    await act(w, { op: "delete", target: (open.find((c) => c.id === id) ?? open[open.length - 1]).id });
    w.toast = t("sittingDropped", { title: open[0].title });
    const n = respread(w, parentId, now);
    if (n > 1) w.sub = t("respread", { n });
  }, { cause: "user-task", text: (_, w) => w.toast });
}

/** Marks tasks placed over a day ago and still in place as kept. */
export const keepSweep = (now = Date.now()) => serial(() => keepSweepNow(now));
async function keepSweepNow(now: number) {
  const [tasks, { kept, placed }] = [await store.allTasks(), await store.keptPlaced()];
  const due = tasks.filter((x) => !x.doneAt && !x.deletedAt && x.start !== undefined && x.start > now && !kept.has(x.id) && (placed.get(x.id) ?? now) <= now - DAY);
  if (!due.length) return;
  let m = await store.loadModel(now), own = false;
  for (const x of due) {
    const ev: TaskEvent = { id: uid(), taskId: x.id, type: "kept", at: now };
    stat(m, ev, x);
    m = learn(m, ev, x, own); // one copy of the ~500 KB model for the whole sweep, not one per task
    own = true;
    await store.putEvent(ev);
  }
  await store.saveModel(m);
}

export { pickNow } from "./now";

/** Unpins a task the user fixed in place and lets the planner choose again (the "move mine" answer to an overlap). */
export const moveMine = (id: string, now = Date.now()) =>
  transact(now, (w) => {
    const tk = w.tasks.get(id);
    if (tk) w.tasks.set(id, { ...tk, fixed: tk.source === "user" ? undefined : tk.fixed, start: undefined, end: undefined, pinned: false, notBefore: tk.notBefore === tk.start ? undefined : tk.notBefore, userEdited: tk.userEdited?.filter((f) => f !== "start") });
  }, { cause: "conflict" });

/** Moves a flexible task (or its open sittings) to another day, keeping its part of the day (tods): no clock, the planner picks the slot that day.
 *  `part` (minutes after midnight) sets the part instead ("Dời: chiều nay"). A fixed task (a class, an exam, a busy block) is not moved; nothing is written then. */
export const moveToDay = (id: string, dayMs: number, now = Date.now(), part?: [number, number]) => {
  const ids = new Set<string>();
  let title = "";
  return transact(now, (w) => {
    w.only = [];
    const tk = w.tasks.get(id);
    const d = dayStart(dayMs);
    if (!tk || tk.fixed || tk.doneAt || tk.deletedAt || d < dayStart(now) || d > dayStart(now) + 29 * DAY) return; // past or beyond the planning horizon: no cells, the task would vanish
    const nextDay = new Date(d); nextDay.setDate(nextDay.getDate() + 1); // not d + DAY: a 23 or 25 hour day
    for (const x of targets(w, id)) { // a split parent moves its open sittings, which are what is planned
      ids.add(x.id);
      w.tasks.set(x.id, { ...x, start: undefined, end: undefined, pinned: false, notBefore: d, notAfter: nextDay.getTime(), userDay: true, ...(part ? { tods: [part] } : {}), userEdited: x.userEdited?.filter((f) => f !== "start") });
    }
    title = tk.title;
    w.only = [...ids];
    w.toast = t("moved", { title: tk.title, time: day(d, now) });
  }, { cause: "user-task", text: (df, w) => { // say where it really landed, not where it was dropped
    const p = df?.placed.find((x) => ids.has(x.id));
    return p && title ? t("moved", { title, time: day(dayStart(p.start), now) }) : w.toast;
  } });
};

/** A change the clock or a sync made, not the user: its result shows no Undo. */
const quiet = (r: Result): Result => ({ ...r, undoable: false });

/** 21:30: what was left undone today (its block has ended) is placed tomorrow from 9h, one toast; Undo brings it back. Running, later and hand-set work stay. */
export function sweepUndone(now = Date.now()): Promise<Result | undefined> {
  const tomorrow = addDays(dayStart(now), 1), from = tomorrow + 9 * HOUR_MS;
  const pick = (x: Task) => !x.doneAt && !x.deletedAt && !x.fixed && !x.pinned && !x.rrule && !holding(x, now) && !x.userEdited?.includes("start")
    && x.start !== undefined && x.end !== undefined && dayStart(x.start) === dayStart(now) && x.end + GRACE <= now
    && (x.deadline ?? Infinity) > from && (x.notAfter ?? Infinity) > from;
  return serial(async () => {
    if (!(await store.allTasks()).some(pick)) return undefined;
    return transactNow(now, (w) => { // transactNow, not transact: this already holds the write queue (transact would wait on itself)
      const moved = [...w.tasks.values()].filter(pick);
      for (const x of moved) w.tasks.set(x.id, { ...x, start: undefined, end: undefined, notBefore: Math.max(x.notBefore ?? 0, from) });
      w.only = moved.map((x) => x.id);
      w.toast = t("swept", { n: moved.length });
      w.sub = moved.map((x) => x.title).join(", ");
    }, { cause: "user-task", text: (_, w) => w.toast });
  });
}

/** Future upstream tasks (lectures, exams, assignments, preps) to drop when the campus is disconnected; past ones stay. */
export const futureDlu = (tasks: Task[], now: number) =>
  tasks.filter((x) => (x.source === "dlu" || x.forId) && !x.deletedAt && (x.start ?? x.deadline ?? 0) > now);

/** Soft-deletes them through the usual path so the calendar mirror follows. */
export const removeImported = (now = Date.now()) =>
  transact(now, async (w) => {
    for (const x of futureDlu([...w.tasks.values()], now)) w.tasks.set(x.id, { ...x, deletedAt: now, userEdited: [...new Set([...(x.userEdited ?? []), "deleted"])] });
  });
