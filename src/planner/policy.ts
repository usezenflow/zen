import type { Diff, Placement, Reason, ReasonKey, Step, Task, TaskEvent, TaskType, Warn } from "../lib/types";
import { DAY, HOUR, I_AFTER, I_ENERGY, I_SIM, KINDS, MIN, PART4, type FeatCtx, cdist, dayStart, dayType, dueOf, features, hourOf, partIdx } from "./features";
import { aimOf, effort, fallacy, leadSample, lateDragged, neighbors, noteHyp, peakHour, slipOf } from "./habits";
import { ALPHA, ARMS, D, LAMBDA, N0, type Primed, coldParts, decayArms, prepare, primeBatch, ucb, ucbAt, update } from "./linucb";
import { grounded } from "./grounded";
import { type Model, afterBuffer, newModel } from "./model";
import { PART_NAMES } from "../lib/parts";
import { type Busy, type End, type Rest, type Util, EJECT_CAP, SLOT, STEP, W_BATCH, W_HARD, W_SOFT, awake, backToBack, batchKind, cells, dayGone, fixedHours, solve, wakeEnd } from "./place";
import { DEFAULT_BOUNDS, boundsOf } from "./bounds";
import { day, dayLabel, when } from "../lib/when";
import { minSitting, split } from "./split";
import { type Piece, bell, dur, lateH, moveCost, pullOk, startValue } from "./value";
import { snapGuess } from "../lib/nlu/size";
import { capOf } from "../lib/rest";
import { TPL as tpl } from "../lib/i18n"; // the insight sentences live in i18n.ts

const LONG_SITTING = 180; // near a deadline sittings merge up to this; longer work still splits

type Gap = { from: number; to: number };
export interface Opts { later?: string; hourOnly?: boolean; pull?: Gap | Gap[]; avoid?: { from: number; to: number }[] } // pull: time freed by a done or delete (one gap or several), from its start (or now) to its end; avoid: slots the user just left by hand
/** A block that ended this long ago is still busy (the user may be finishing it); missed after. */
export const GRACE = 15 * MIN;
/** A time set by hand is busy only until its hold ends or its start passes (then a preference the planner may move). */
export const holding = (t: Task, now: number) => t.holdUntil !== undefined && now < Math.min(t.holdUntil, t.start ?? -Infinity);

const HALF = 21 * DAY;
const COLD_A0 = LAMBDA + N0;
const SURE = 3; // outcomes an hour must remember before a reason may name it
type Titled = Busy & { title?: string };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
// One colour per task everywhere (rows, week, month, detail): a prep is the user's plan even though it has a due time.
export const typeOf = (t: Task): TaskType => t.fixed ?? (dueOf(t) !== undefined && !t.forId ? "assignment" : "plan");
// A said length keeps its minutes; a guessed one sits on the half hour (a micro chore on 15).
const sized = (t: Task, m: number) => (!t.effortGuessed ? m : snapGuess(m)); // said: as said; guessed: 15, else half hours

function decay(m: Model, now: number) {
  const dt = now - m.at;
  if (dt <= 0) return;
  decayArms(m.arms, dt, m.parts);
  const g = 0.5 ** (dt / HALF);
  for (const k of KINDS) { m.slip[k].later *= g; m.slip[k].placed *= g; }
  m.at = now;
}

/** A replan of a task whose block ended unfinished (pl.from is its stored start): one more miss. From the third, a guessed length shrinks a step (never below 15, never a said one). */
export function missedReplan(t: Task, pl: { start: number; end: number; from?: number }, now: number): { misses: number; effort?: number } | undefined {
  if (t.start === undefined || t.end === undefined || t.end + GRACE > now || pl.from !== t.start) return undefined;
  const misses = (t.misses ?? 0) + 1;
  // effort only when it shrinks: an unshrunk block keeps its exact end (a fractional length is not rounded)
  return { misses, ...(misses >= 3 && t.effortGuessed && t.deadline === undefined ? { effort: Math.max(15, snapGuess(Math.round((pl.end - pl.start) / MIN) - 30)) } : {}) };
}

const KIND_VI: Record<string, string> = { study: "học", exercise: "tập thể dục", chores: "làm việc nhà", social: "gặp gỡ", other: "làm việc khác", work: "làm việc", errand: "làm việc vặt", finance: "lo chuyện tiền", self: "chăm bản thân" };

export function plan(tasks: Task[], busy: Busy[], model: Model, now: number, opts: Opts = {}): { diff: Diff; model: Model } {
  const first = planOnce(tasks, busy, model, now, opts);
  if (!first.bump) return first;
  const second = planOnce(tasks, busy, model, now, opts, new Set(first.bump));
  return second.trouble < first.trouble ? second : first; // the bump is kept only when it leaves fewer pieces short
}

function planOnce(tasks: Task[], busy: Busy[], model: Model, now: number, opts: Opts, unlock?: Set<string>): { diff: Diff; model: Model; bump?: string[]; trouble: number } {
  const m = clone(model);
  decay(m, now);
  const B = boundsOf(m); // the user's own parts and awake window once learned; the defaults until then
  const live = tasks.filter((t) => !t.doneAt && !t.deletedAt);
  const allBusy: Titled[] = [...busy];
  const fixedEnds: End[] = [];
  const flex: Task[] = [];
  for (const t of live) {
    const inProgress = t.start !== undefined && t.end !== undefined && t.start <= now && now < t.end + GRACE && opts.later !== t.id; // "later" on the running task moves it; a block just ended stays busy through its grace
    if ((t.fixed || t.pinned || inProgress || holding(t, now)) && t.start !== undefined && t.end !== undefined) {
      allBusy.push({ start: t.start, end: t.end, title: t.title });
      fixedEnds.push({ kind: t.kind, end: t.end });
    } else if (!t.fixed) flex.push(t);
  }
  allBusy.sort((a, b) => a.start - b.start);

  // A day's cap (rest.ts capOf: 6 h, halved on a holiday, × 0.75 the day before an exam), computed once per day of this plan. The learned line is not used here: it sits at its 3 h floor for light users and pushed dated work later (focus lead).
  const capMemo = new Map<number, ReturnType<typeof capOf>>();
  const capAt = (d: number) => { const k = dayStart(d); let c = capMemo.get(k); if (!c) capMemo.set(k, (c = capOf(tasks, k, now, 0, false))); return c; };
  const capH = (d: number) => capAt(d).ms / HOUR;
  // A prep for an exam the day after d is not capped on d: the cap is for other work, the prep keeps its cold scoring.
  const examAt = new Map(tasks.filter((x) => x.fixed === "exam" && !x.deletedAt && x.start !== undefined).map((x) => [x.id, x.start!]));
  const exempt = (p: Piece, d: number) => { const ex = p.task.forId !== undefined ? examAt.get(p.task.forId) : undefined; return ex !== undefined && dayStart(ex) === dayStart(d + 1.5 * DAY); };

  const kids = new Map<string, Task[]>();
  for (const t of flex) if (t.parentId) (kids.get(t.parentId) ?? kids.set(t.parentId, []).get(t.parentId)!).push(t);
  // Every sitting a parent ever had (done, deleted, pinned too): its open ones are placed, never split again.
  const ever = new Map<string, Task[]>();
  for (const t of tasks) if (t.parentId) (ever.get(t.parentId) ?? ever.set(t.parentId, []).get(t.parentId)!).push(t);
  const ix = (t: Task) => Number(t.id.slice(t.id.lastIndexOf("#") + 1)) || 0; // "p#10" after "p#9", not between 1 and 2
  const pieces: Piece[] = [];
  const splits: Diff["split"] = [];
  const lateBad = lateDragged(m); // you dragged work off the late hours: the rest of the part past the said window is not offered
  // A said window's end ("trong hôm nay", notAfter) bounds the work as a due does; a repeat's window is per day, not an end.
  const endOf = (t: Task) => t.deadline ?? (t.rrule ? undefined : t.notAfter);
  const mk = (task: Task, eff: number, k: number, n: number, prior?: number, missed?: number): Piece => ({
    id: task.id, task, effort: eff, k, n, slip: dueOf(task) === undefined ? 0 : slipOf(m, task.kind), avoid: opts.avoid, aim: aimOf(m, task.kind),
    prior: prior !== undefined && prior >= now ? prior : undefined, missed, soon: missed !== undefined || (opts.later !== undefined && (opts.later === task.id || opts.later === task.parentId)), // no "later": undefined === undefined made every unsplit piece "soon" (2-day reach)
  });
  // Longest free, awake stretch inside a window that lies within one day; undefined for anything wider.
  const widest = (t: Task) => {
    const e = endOf(t);
    if (e === undefined || t.rrule || t.notBefore === undefined || dayStart(t.notBefore) !== dayStart(e - 1)) return undefined;
    const d = dayStart(e - 1);
    let s = Math.max(t.notBefore, d + B.from * MIN, Math.ceil(now / STEP) * STEP), best = 0;
    const end = d === dayStart(now) ? e : Math.min(e, d + wakeEnd(t.tods, B) * MIN); // tonight's work may run on to midnight (`over` below)
    for (const b of allBusy) {
      if (b.end <= s) continue;
      if (b.start >= end) break;
      best = Math.max(best, b.start - s); s = Math.max(s, b.end);
    }
    return Math.max(best, end - s) / MIN;
  };
  const lost = (t: Task) => (t.start !== undefined && t.end !== undefined && t.end + GRACE <= now ? t.start : undefined);
  for (let t of flex) {
    if (t.parentId) continue;
    // An exam's prep is done by 22:00 the evening before, never the morning of, unless that leaves no time at all.
    if (t.forId && t.deadline !== undefined && dayStart(t.deadline) - 2 * HOUR > now + HOUR) t = { ...t, deadline: Math.min(t.deadline, dayStart(t.deadline) - 2 * HOUR) };
    if (dayGone(t, now, B.to)) continue; // a past day of a repeating task stays missed; the next day has its own
    const sibs = kids.get(t.id), old = ever.get(t.id);
    if (sibs) {
      sibs.sort((a, b) => ix(a) - ix(b)).forEach((c, i) => pieces.push(mk(c, sized(c, c.effort), i + 1, sibs.length, c.start, lost(c))));
      continue;
    }
    // No open sitting left yet not done: its sittings were dropped to resize it (materialize). Split what is left again, with new ids.
    if (old?.some((c) => !c.doneAt && !c.deletedAt)) continue; // pinned or running: already busy time
    const done = old?.filter((c) => c.doneAt) ?? [];
    const left = effort(t, m) - done.reduce((a, c) => a + c.effort, 0);
    if (old && left <= 0) continue;
    let eff = sized(t, left);
    let cap = t.maxSitting ?? 120;
    // A tight deadline gets fewer sittings, one per whole day left (under a day: one), not a full set crammed in.
    // Exam prep (maxSitting) shrinks its total a little with them (halfway to proportional); other work keeps its size, in sittings of at most 3 h.
    const natural = Math.ceil(eff / cap), room = endOf(t) === undefined ? natural : Math.max(1, Math.floor((endOf(t)! - now) / DAY));
    // A guessed length gives way to a said due: "mai làm đồ án" is what fits by tomorrow (a long sitting a day), not 30 h that fit nowhere.
    const guess = eff;
    if (natural > room && t.effortGuessed) { eff = Math.min(eff, room * LONG_SITTING); cap = Math.max(cap, Math.min(Math.ceil(eff / room / 30) * 30, LONG_SITTING)); }
    else if (natural > room && t.maxSitting !== undefined) { eff = sized(t, (eff * (natural + room)) / (2 * natural)); cap = Math.min(Math.ceil(eff / room / 30) * 30, LONG_SITTING); }
    else if (natural > room) cap = Math.max(cap, Math.min(Math.ceil(eff / room / 30) * 30, LONG_SITTING));
    // What was asked bends to what is free, never past sense. A guessed length (no length said) shrinks to the longest free stretch of its
    // window, not below what the work needs (an errand 15 min, deep work 1h30); a said length never shrinks. A window too packed for that
    // runs on to the rest of its day, then to any day: the task always gets a time, and its reason says why it is not where it was asked.
    const need = t.effortGuessed ? Math.min(eff, minSitting(t)) : Math.min(eff, cap);
    const ask = t.notAfter !== undefined && t.deadline === undefined && !t.rrule ? { from: t.notBefore, to: t.notAfter } : undefined;
    let gapMin = widest(t);
    if (ask && gapMin !== undefined && gapMin < need) {
      // The said part, then its neighbours: the rest of today's part, then its later part (sáng → trưa), the same part tomorrow, tomorrow's later part, today's earlier one.
      // Parts already past are skipped; the first that fits is taken. A step into the evening (chiều → tối) also keeps tomorrow's said part open, never past its end.
      const D = dayStart(ask.from!), sm = (ask.from! - D) / MIN, i = DEFAULT_BOUNDS.parts.findIndex(([a, b]) => sm >= a && sm < b);
      // today's later part joins on to what is left of the said one (21:20 "tối": 21:30, not 22:00)
      // the same part on another day repeats the window as it was said (18-22), not the whole part
      const part = (off: number, j: number): Task => {
        const same = off >= 1 && j === i, a = same ? sm : B.parts[off === 0 && j === i + 1 ? i : j][0], e = same ? Math.min(B.parts[j][1], (ask.to - D) / MIN) : B.parts[j][1];
        return { ...t, tods: [[a, e]], notBefore: D + off * DAY + a * MIN, notAfter: D + off * DAY + e * MIN };
      };
      // the said window can be narrower than its part (tối said as 18-22 is 18-24): the rest of the same part comes first, then the next one
      const order: [number, number][] = i < 0 ? [] : [...(lateBad && B.parts[i][1] > (ask.to - D) / MIN ? [] : [[0, i] as [number, number]]), [0, i + 1], [1, i], [1, i + 1], [0, i - 1]];
      const hit = order.find(([off, j]) => B.parts[j] && D + off * DAY + B.parts[j][1] * MIN > now && (widest(part(off, j)) ?? -1) >= need);
      if (hit) {
        // a late hour may move to tomorrow's said part, but only once the user has dragged work off it (learned below the cold prior); the solver picks by value
        const [off, j] = hit, late = off === 0 && j > i && B.parts[j][0] >= 18 * 60 && lateBad;
        t = late ? { ...t, tods: [[B.parts[i][0], B.parts[j][1]]], notBefore: D + B.parts[i][0] * MIN, notAfter: D + DAY + B.parts[i][1] * MIN } : part(off, j);
      } else t = { ...t, notBefore: dayStart(now) + DAY, notAfter: dayStart(now) + 2 * DAY }; // nothing fits: the rest of tomorrow, still in the said parts
      gapMin = widest(t);
    }
    // shrunk to the gap on the same grid: half hours, or 15 for minor work when only 15 to 29 minutes are free
    const fitGap = (g: number) => (g >= 30 ? Math.floor(g / 30) * 30 : g >= 15 ? 15 : 0);
    if (t.effortGuessed && gapMin !== undefined && fitGap(gapMin) >= need && eff > gapMin) { eff = fitGap(gapMin); cap = eff; }
    const slow = t.effortGuessed ? fallacy(m, t.kind) : 1;
    const fit: Partial<Piece> = { ...(ask && t.notAfter !== ask.to ? { ask } : {}), ...(eff < guess && t.effortGuessed ? { cut: guess } : {}), ...(slow > 1 ? { slow } : {}) };
    if (eff > cap || old) {
      // Each sitting's share follows the free time of the day the bell aims it at (value.ts SOFT_AIM), so a light day gets a long one.
      // Sittings land one a day on the freest days before the due (place.ts TWIN, load): size each by its day's free hours, in date order.
      const due = endOf(t), lo0 = dayStart(Math.max(now, t.notBefore ?? now)), cnt = split(eff, cap).length;
      const days = due === undefined ? [] : Array.from({ length: Math.max(0, Math.round((dayStart(due - 1) - lo0) / DAY)) + 1 }, (_, i) => lo0 + i * DAY);
      // A day's room is what is left under its cap (the load hinge in place.ts dayCost); a class-heavy day has none.
      const freeH = (d: number) => Math.max(0, capH(d) - fixedHours(allBusy, d) - (d === dayStart(now) ? Math.max(0, (now - d) / HOUR - B.from / 60) / 3 : 0));
      const light = days.filter((d) => freeH(d) > 0);
      // Fewer light days than sittings: fewer, longer sittings (up to 2 h) on the light days, not two a day or a short one on a full day.
      const cap2 = light.length && light.length < cnt ? Math.min(Math.max(cap, 120), Math.max(cap, Math.ceil(eff / light.length / 30) * 30)) : cap;
      const cnt2 = split(eff, cap2).length;
      const pick = days.length > cnt2 ? days.map((d) => [freeH(d), d] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, cnt2).sort((a, b) => a[1] - b[1]) : undefined;
      const sizes = split(eff, cap2, pick?.map(([h]) => h)), from = old ? Math.max(...old.map(ix)) : 0, d = done.length;
      const ids = sizes.map((_, i) => `${t.id}#${from + i + 1}`);
      sizes.forEach((s, i) => pieces.push(Object.assign(mk({ ...t, id: ids[i], parentId: t.id, effort: s, start: undefined, end: undefined }, s, d + i + 1, d + sizes.length, undefined, i ? undefined : lost(t)), fit)));
      splits.push({ parentId: t.id, ids });
    } else pieces.push(Object.assign(mk(t, eff, 1, 1, t.start, lost(t)), fit));
  }
  // Orphan sittings whose parent is gone or done.
  for (const t of flex) if (t.parentId && !flex.some((p) => p.id === t.parentId && !p.parentId) && !pieces.some((p) => p.id === t.id)) {
    pieces.push(mk(t, sized(t, t.effort), 1, 1, t.start, lost(t)));
  }
  // Work due today that, all together, is longer than what is left before 22:00 may run on to midnight ("hôm nay A, B, C" at 19:45).
  const tonight = pieces.filter((p) => { const e = endOf(p.task); return e !== undefined && !p.task.rrule && dayStart(e - 1) === dayStart(now); });
  if (Math.ceil(now / STEP) * STEP + tonight.reduce((n, p) => n + p.effort, 0) * MIN > dayStart(now) + B.to * MIN) for (const p of tonight) p.over = true;

  const peak = peakHour(m, now);
  const nbs = new Map(pieces.map((p) => [p.id, neighbors(p.task, m, now)]));
  const fh = new Map<number, number>(), fixedH = (d: number) => fh.get(d) ?? (fh.set(d, fixedHours(allBusy, d)), fh.get(d)!); // once per day, not per cell
  const ctx = (p: Piece, ends: End[]): FeatCtx => ({ fixedH, peak, nb: nbs.get(p.id)!, ends });
  const xOf = (p: Piece, s: number, ends: End[]) => features(p.task, s, ctx(p, ends));
  const prep = prepare(m.arms, m.parts, PART_OF); // each hour's theta gets its part's pooled evidence (linucb prepare)
  const seen = (a: number) => m.arms[a].A[0] - COLD_A0 >= SURE;
  const rules = m.rules ?? [];
  const hits = (p: Piece, s: number) => rules.filter((r) => {
    if (r.kinds.length && !r.kinds.includes(p.task.kind)) return false;
    if (r.days.length && !r.days.includes(new Date(s).getDay())) return false;
    const a = (s - dayStart(s)) / MIN;
    return a < r.to && a + p.effort > r.from;
  });
  const used = new Set<string>();
  const BLOCK = -1000; // like `later` and asleep: only when nothing else fits
  const spanLater = (p: Piece, s: number) =>
    opts.later === p.id && p.task.start !== undefined && s < p.task.start + dur(p) && s + dur(p) > p.task.start;
  // A placed piece whose slot is still good stays put. Only a cause frees it: a clash, a rule, a due date or window it would now miss, "later".
  // A pull: a piece may take the freed time only if it is unscheduled, or its start is later than the gap's (it moves earlier, never later).
  const pulls: Gap[] = [opts.pull ?? []].flat();
  // Load per day (hours: lectures half, flexible work as placed now), for the cross-day pull and the overload below.
  const loadOf = (d: number) => fixedHours(allBusy, d) + pieces.reduce((n, q) => n + (q.prior !== undefined && dayStart(q.prior) === d ? q.effort / 60 : 0), 0);
  for (const p of pulls.length ? pieces : []) {
    const tk = p.task;
    // A hand-set time is held (legacy ones without a hold stay held); a hold that ran out is a preference again.
    if (tk.fixed || tk.pinned || holding(tk, now) || (tk.userEdited?.includes("start") && tk.holdUntil === undefined)) continue;
    const gaps = pulls.filter((g) => {
      if (!(p.prior === undefined || p.prior > g.from)) return false;
      if (p.prior === undefined) return true;
      const day = dayStart(g.from);
      // Calmer: a piece in the next 24 h keeps its day, and a later day never gives its time to an earlier gap (a cross-day pull moved too much: bench doubt movesPerDay).
      if (p.prior < now + DAY && dayStart(p.prior) !== day) return false;
      return dayStart(p.prior) <= day;
    });
    if (gaps.length) p.gaps = gaps;
  }
  // Overload is a cause: on a day past its cap, the lightest unpinned pieces with no due go unlocked (lowest load first to keep), so the solver may move them.
  const dayLoad = new Map<number, number>();
  for (const p of pieces) if (p.prior !== undefined) dayLoad.set(dayStart(p.prior), (dayLoad.get(dayStart(p.prior)) ?? 0) + dur(p) / HOUR);
  const unlockOver = new Set<string>();
  for (const d of dayLoad.keys()) {
    let h = loadOf(d);
    if (h <= capH(d)) continue;
    for (const p of pieces.filter((q) => q.prior !== undefined && dayStart(q.prior) === d && !q.gaps && !q.missed && !q.task.pinned && !q.task.fixed && !q.task.userEdited?.includes("start") && dueOf(q.task) === undefined).sort((a, b) => b.effort - a.effort)) {
      if (h <= capH(d)) break;
      unlockOver.add(p.id); h -= dur(p) / HOUR;
    }
  }
  const held: Busy[] = [...allBusy], own = (p: Piece) => Number(!!p.task.userEdited?.includes("start"));
  // The checks an old slot must pass to be kept: no rule, window or awake hour is broken, and nothing clashes.
  const clear = (p: Piece, s: number, others: Busy[]) => {
    const t = p.task, e = s + dur(p);
    return !(spanLater(p, s) || hits(p, s).length || !awake(p, s, undefined, B) || (t.deadline !== undefined && e > t.deadline) || (t.notAfter !== undefined && e > t.notAfter) || (t.notBefore !== undefined && s < t.notBefore) || others.some((b) => s < b.end && e > b.start));
  };
  for (const p of [...pieces].sort((a, b) => own(b) - own(a))) { // a time set by hand wins a clash between two plans
    const s = p.prior;
    if (s === undefined || p.gaps || unlock?.has(p.id) || unlockOver.has(p.id) || !clear(p, s, held)) continue;
    p.lock = true; held.push({ start: s, end: s + dur(p) });
  }
  // Exploring: not while the model is cold, and only the first new piece without a deadline, once a day.
  const explored = m.exploredAt !== undefined && dayStart(m.exploredAt) === dayStart(now);

  // Light and short only: a 30-minute undated piece is a cheap place to test an hour.
  const explorer = !explored && m.hist.length + m.doneHours.length >= 5 ? pieces.find((p) => dueOf(p.task) === undefined && p.prior === undefined && p.effort <= 30) : undefined;
  const alphaOf = (p: Piece) => (p === explorer ? ALPHA : 0);

  // Task x Cell x Feature, built once: every feature but "after" is fixed per (piece, cell). "After" depends on
  // what the solver has placed, so it stays a one-hot column patched in per call (ucbAt, O(1) per cell).
  interface Batch { lo: number; n: number; prim: Primed; masked: Uint8Array }
  const batches = new Map<string, Batch>();
  for (const p of pieces) {
    const cs = cells(p, now), n = cs.length;
    if (!n) continue; // past the 30-day horizon: no cell to score, the solver leaves it unplaced
    const c0 = ctx(p, []);
    const X = new Float64Array(n * D), arm = new Uint8Array(n), masked = new Uint8Array(n);
    let day = -Infinity, next = -Infinity; // dayStart once per day, not per cell (a Date each)
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (c >= next) { day = dayStart(c); next = dayStart(day + 1.5 * DAY); }
      arm[i] = Math.floor(hourOf(c));
      const h = hits(p, c);
      for (const r of h) used.add(r.id);
      masked[i] = h.length || spanLater(p, c) || !awake(p, c, day, B) ? 1 : 0;
      if (masked[i]) continue; // scored BLOCK whatever its features: skip the work
      if (opts.hourOnly) X[i * D] = 1; else X.set(features(p.task, c, c0), i * D);
    }
    batches.set(p.id, { lo: cs[0], n, prim: primeBatch(prep, X, arm, I_AFTER, KINDS.length), masked });
  }
  const gridAt = (b: Batch, s: number) => { const i = (s - b.lo) / STEP; return Number.isInteger(i) && i >= 0 && i < b.n ? i : -1; };
  // Kind of the latest end in the hour before each cell, as features() picks it: O(ends), not O(cells * ends).
  const afterAll = (b: Batch, ends: End[]) => {
    const j = new Int8Array(b.n).fill(-1), at = new Float64Array(b.n).fill(-Infinity);
    if (opts.hourOnly) return j;
    for (const e of ends) {
      const hi = Math.min(b.n - 1, Math.floor((e.end + HOUR - b.lo) / STEP));
      for (let i = Math.max(0, Math.ceil((e.end - b.lo) / STEP)); i <= hi; i++) if (e.end > at[i]) { at[i] = e.end; j[i] = KINDS.indexOf(e.kind); }
    }
    return j;
  };
  const linAll = (p: Piece, ends: End[]) => {
    const b = batches.get(p.id)!, j = afterAll(b, ends), out = new Float64Array(b.n), a = alphaOf(p);
    for (let i = 0; i < b.n; i++) out[i] = b.masked[i] ? BLOCK : ucbAt(prep, b.prim, i, j[i], a);
    return out;
  };
  const linUtil: Util = (p, s, ends) => {
    if (spanLater(p, s) || hits(p, s).length || !awake(p, s, undefined, B)) return BLOCK;
    const b = batches.get(p.id)!, i = gridAt(b, s);
    if (i >= 0) {
      let best: End | undefined;
      if (!opts.hourOnly) for (const e of ends) if (e.end <= s && e.end >= s - HOUR && (!best || e.end > best.end)) best = e;
      return ucbAt(prep, b.prim, i, best ? KINDS.indexOf(best.kind) : -1, alphaOf(p));
    }
    return ucb(prep, Math.floor(hourOf(s)), xz(p, s, ends), alphaOf(p)); // off-grid start (a swap): slow path
  };
  function xz(p: Piece, s: number, ends: End[]) {
    const x = xOf(p, s, ends);
    return opts.hourOnly ? x.map((v, i) => (i === 0 ? 1 : 0)) : x;
  }
  // Own work keeps the learned rest after each lecture or exam (hard, see place.ts afterClass).
  const rest: Rest = { classEnds: live.filter((t) => (t.fixed === "lecture" || t.fixed === "exam") && t.end !== undefined).map((t) => t.end!), buffer: afterBuffer(m) * MIN };
  const solved = solve(pieces, { busy: allBusy, fixedEnds, now, util: linUtil, utilAll: linAll, bounds: B, rest, cap: capH, exempt }, [...pieces.map((p) => p.id)].sort().join("|").split("").reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261)); // same pieces, same plan
  const fin = new Map(solved.starts), at = (p: Piece) => fin.get(p.id)!;
  // Cause-free moves: placed pieces the solver moved that are not pinned, missed or "later". Only the 5 most valuable keep their move.
  // shortcut: 5 is a constant, upgrade to a per-user budget once undo rate is tracked
  // (not `soon`: it is true for every undated piece, since `later` undefined matches parentId undefined)
  const movers = pieces.filter((q) => q.prior !== undefined && !q.lock && !q.task.pinned && q.missed === undefined && (opts.later === undefined || (opts.later !== q.id && opts.later !== q.task.parentId)) && at(q) >= 0 && at(q) !== q.prior);
  const moveCap = [...dayLoad.keys()].some((d) => loadOf(d) > capH(d)) ? 8 : 5; // a day over its cap may move more
  if (movers.length > moveCap) {
    const gain = (q: Piece) => startValue(q, at(q), now, linUtil(q, at(q), fixedEnds)) - startValue(q, q.prior!, now, linUtil(q, q.prior!, fixedEnds));
    const keep = new Set(movers.sort((a, b) => gain(b) - gain(a)).slice(0, moveCap));
    for (const q of movers) { // the rest go back to their old slot when it is still clear
      if (keep.has(q)) continue;
      const others: Busy[] = [...allBusy, ...pieces.filter((o) => o !== q && at(o) >= 0).map((o) => ({ start: at(o), end: at(o) + dur(o) }))];
      if (clear(q, q.prior!, others)) fin.set(q.id, q.prior!);
    }
  }
  // Packed (item 9): a piece unplaced, late, or out of its said window. Zen-placed pieces in its way with a later due (or none) can give way.
  const short = pieces.filter((q) => at(q) < 0 ? cells(q, now, rest).length > 0
    : (q.task.deadline !== undefined && at(q) + dur(q) > q.task.deadline) || (!!q.ask && (at(q) + dur(q) > q.ask.to || (q.ask.from !== undefined && at(q) < q.ask.from))));
  // Only what a due or a said window can use counts: an unplaced piece with no due gains nothing from a bump, so it does not decide one.
  const urgent = short.filter((q) => q.task.deadline !== undefined || q.ask !== undefined);
  // Only new trouble bumps: a piece still short at its own old slot was short last plan too, and a replan with nothing new moves nothing.
  const fresh = urgent.filter((q) => q.prior === undefined || at(q) !== q.prior);
  let bump: string[] | undefined;
  if (fresh.length && !pulls.length && !unlock) {
    const dl = (x: Piece) => x.task.deadline ?? Infinity;
    const cand = new Map<string, Piece>();
    for (const q of fresh) for (const p of pieces) {
      if (p === q || p.prior === undefined || dl(p) <= dl(q) || p.task.pinned || p.task.fixed || p.task.userEdited?.includes("start")) continue;
      const inWin = !!q.ask && p.prior >= (q.ask.from ?? -Infinity) && p.prior < q.ask.to;
      if (inWin || (q.task.deadline !== undefined && p.prior < q.task.deadline)) cand.set(p.id, p);
    }
    bump = [...cand.values()].sort((a, b) => (dl(a) === dl(b) ? a.prior! - b.prior! : dl(a) < dl(b) ? 1 : -1)).slice(0, EJECT_CAP).map((p) => p.id);
  }

  // Busy time and every placed piece, sorted once per plan (not once per piece: that was O(P² log P)).
  const taken: (Busy & { by?: Piece })[] = [...allBusy, ...pieces.filter((q) => at(q) >= 0).map((q) => ({ start: at(q), end: at(q) + dur(q), by: q }))].sort((x, y) => x.start - y.start);
  // Second-best start in solver terms: at least 1 h from the pick, clear of busy time.
  const altOf = (p: Piece, start: number) => {
    let top: { c: number; v: number } | undefined;
    const cs = cells(p, now, rest), u = linAll(p, fixedEnds);
    // The others' time merged into disjoint spans, swept once with the ascending cells.
    const spans: Busy[] = [];
    for (const b of taken) {
      if (b.by === p) continue;
      const last = spans[spans.length - 1];
      if (last && b.start <= last.end) last.end = Math.max(last.end, b.end); else spans.push({ start: b.start, end: b.end });
    }
    let j = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      while (j < spans.length && spans[j].end <= c) j++;
      if (Math.abs(c - start) < HOUR || !pullOk(p, c) || (j < spans.length && spans[j].start < c + dur(p))) continue;
      const v = startValue(p, c, now, u[i]);
      if (!top || v > top.v) top = { c, v };
    }
    return top?.c;
  };
  const ends: End[] = [...fixedEnds, ...pieces.filter((p) => at(p) >= 0).map((p) => ({ kind: p.task.kind, end: at(p) + dur(p) }))];

  // The solver terms rebuilt from value.ts and place.ts's day cost (mirrored here: place.ts does not export them).
  const flexH = (d: number, skip: Piece) => pieces.reduce((n, q) => (q !== skip && dayStart(at(q)) === d ? n + dur(q) / HOUR : n), 0);
  const loadH = (p: Piece, s: number) => { const d = dayStart(s); return fixedHours(allBusy, d) + flexH(d, p) + dur(p) / HOUR; };
  const hinge = (h: number, t: number) => { const c = capH(t); return W_SOFT * Math.max(0, h - (c - 2)) + W_HARD * Math.max(0, h - c); }; // the day of t, as place.ts dayCost
  const halo = (p: Piece, s: number) => {
    let n = 0, who: string | undefined;
    for (const b of allBusy) if (!(s < b.end && s + dur(p) > b.start) && s - HOUR < b.end && s + dur(p) + HOUR > b.start) { n++; who ??= b.title; }
    return { v: 0.1 * n * (p.effort / 30), who };
  };
  const GROUPS: [ReasonKey, number, number][] = [["hour", 0, 1], ["weekend", 1, 2], ["busy", 2, 3], ["deadline", 3, 4], ["kind", 4, I_AFTER], ["after", I_AFTER, I_ENERGY], ["energy", I_ENERGY, I_SIM], ["similar", I_SIM, D]];
  const dot = (th: ArrayLike<number>, x: number[], k0 = 0, k1 = D) => { let v = 0; for (let k = k0; k < k1; k++) v += th[k] * x[k]; return v; };
  // No learned reason yet: say what is true from the task itself (its due, its length), never "I do not know you".
  // Facts a reason can name: how far ahead of the due, what it follows, which part of which day. The words stay loose (reasons.ts).
  const dueVars = (p: Piece, s: number) => { const d = dueOf(p.task); return d === undefined ? undefined : { due: when(d, now), left: Math.round((d - s - dur(p)) / MIN) }; };
  const partOf = (s: number) => {
    const h = hourOf(s), dd = Math.round((dayStart(s) - dayStart(now)) / DAY);
    const part = h < 11 ? "Sáng" : h < 13 ? "Trưa" : h < 18 ? "Chiều" : "Tối";
    return `${part} ${dd === 0 ? "nay" : dd === 1 ? "mai" : day(s, now)}`;
  };
  // The window said, in words: a part of a day ("Sáng mai"), or the whole day ("Hôm nay") when it spans more than one part.
  const wasOf = (a: { from?: number; to: number }) => {
    if (a.from !== undefined && a.to - a.from <= 8 * HOUR) return partOf(a.from);
    const dd = Math.round((dayStart(a.to - 1) - dayStart(now)) / DAY);
    return dd === 0 ? "Hôm nay" : dd === 1 ? "Ngày mai" : day(a.to - 1, now);
  };
  const afterOf = (p: Piece, s: number) => allBusy.find((b) => b.title && b.end <= s && b.end > s - 30 * MIN)?.title
    ?? pieces.find((q) => q !== p && at(q) >= 0 && at(q) + dur(q) <= s && at(q) + dur(q) > s - 30 * MIN && q.task.title !== p.task.title)?.task.title;
  const guessOf = (p: Piece, s: number): Reason => dueVars(p, s) ? { key: "deadline", w: 1, vars: dueVars(p, s) } : { key: "guess", w: 1, vars: { m: p.effort, part: partOf(s), pn: slotOf(s).pn, ...(afterOf(p, s) ? { after: afterOf(p, s)! } : {}) } };
  // How often you finished work (or work like this) near this hour lately: the count behind "Mấy lần gần đây…".
  // Same part of the day and same kind of day (ngày thường or cuối tuần); an older tick without its weekday counts by the hour alone.
  const doneNear = (s: number) => m.doneHours.filter((d) => now - d.at <= 14 * DAY && (d.wd === undefined ? cdist(d.hour, hourOf(s)) <= 1 : partIdx(d.hour) === partIdx(hourOf(s)) && dayType(d.wd) === dayType(new Date(s).getDay()))).length;
  // Where a time sits, for the reasons that only hold at that time (grounded checks it again when the task is moved).
  const slotOf = (s: number) => ({ pn: PART4[partIdx(hourOf(s))], dt: dayType(new Date(s).getDay()) });
  const likeNear = (p: Piece, s: number) => (nbs.get(p.id) ?? []).filter((n) => n.r > 0 && cdist(n.hour, hourOf(s)) <= 1).length;
  // The placed pieces as neighbours: a batch names the errand or finance piece it sits back to back with.
  const near: Task[] = pieces.filter((q) => at(q) >= 0).map((q) => ({ ...q.task, start: at(q), end: at(q) + dur(q) }));
  const pairedAt = (p: Piece, s: number) => batchKind(p.task.kind) ? near.find((n) => n.id !== p.id && batchKind(n.kind) && backToBack({ start: s, end: s + dur(p) }, { start: n.start!, end: n.end! }))?.title : undefined;
  const whyOf = (p: Piece, s: number, c: number): { why: Reason[]; explore: boolean } => {
    const xs = xz(p, s, ends), xc = xz(p, c, ends), as = Math.floor(hourOf(s)), ac = Math.floor(hourOf(c));
    const ths = prep.theta[as], thc = prep.theta[ac], a = alphaOf(p);
    const raw: Reason[] = [];
    const put = (key: ReasonKey, w: number, vars?: Reason["vars"]) => { if (w) raw.push({ key, w, vars }); };
    // The intercept starts as the default daily curve; "bạn hay…" is only true once both hours have outcomes of their own.
    const known = seen(as) && seen(ac);
    for (const [key, k0, k1] of GROUPS) {
      if (!known) break;
      const w = dot(ths, xs, k0, k1) - dot(thc, xc, k0, k1);
      const ai = xs.slice(I_AFTER, I_AFTER + KINDS.length).indexOf(1), aj = ai >= 0 ? ai : xc.slice(I_AFTER, I_AFTER + KINDS.length).indexOf(1);
      put(key, w, key === "deadline" ? dueVars(p, s) ?? { due: "" }
        : key === "kind" ? { kind: p.task.kind, pn: slotOf(s).pn } : key === "after" ? { prev: KINDS[aj] ?? "" }
        : key === "similar" ? { hour: Math.round(hourOf(s)), n: likeNear(p, s), pn: slotOf(s).pn } : key === "hour" ? { hour: Math.floor(hourOf(s)), n: doneNear(s), ...slotOf(s) }
        : key === "energy" ? { pn: slotOf(s).pn } : undefined);
    }
    const meanS = dot(ths, xs), meanC = dot(thc, xc);
    const bonus = a ? ucb(prep, as, xs, a) - meanS - (ucb(prep, ac, xc, a) - meanC) : 0;
    const explore = bonus > 0 && meanS < meanC;
    if (explore) put("explore", bonus);
    if (p.n > 1) put("pace", bell(p, now, s) - bell(p, now, c), { k: p.k, n: p.n });
    put("late", 100 * (lateH(p, c) - lateH(p, s)), dueVars(p, s));
    const stab = moveCost(p, c, now) - moveCost(p, s, now);
    if (stab > 0) put("stable", stab); // no wording for "moving cost us"
    const Ls = loadH(p, s);
    const loadGain = hinge(loadH(p, c), c) - hinge(Ls, s);
    put("load", loadGain, { h: Math.round(Ls) });
    // The day it was pushed off is capped (a holiday, or the day before an exam) and would have carried this load: say so, and name that day.
    const capC = capAt(c);
    if (capC.why && loadGain > 0 && !exempt(p, c)) put(capC.why.key, loadGain, { ...(capC.why.key === "holiday" ? { title: capC.why.title } : {}), day: dayStart(c) });
    const hs = halo(p, s), hc = halo(p, c);
    put("gap", hc.v - hs.v, (hs.v > hc.v ? hs.who : hc.who) ? { title: (hs.v > hc.v ? hs.who : hc.who)! } : undefined);
    const bs = pairedAt(p, s);
    if (bs !== undefined && pairedAt(p, c) === undefined) put("batch", W_BATCH, { title: bs });
    const tot = raw.reduce((n, r) => n + Math.abs(r.w), 0);
    const lead: Reason[] = [];
    const sorted = raw.map((r) => ({ ...r, w: r.w / tot })).filter((r) => r.key === "explore" || Math.abs(r.w) >= 0.05).sort((x, y) => y.w - x.w);
    const ex = sorted.findIndex((r) => r.key === "explore");
    if (ex >= 0) lead.push(...sorted.splice(ex, 1));
    const rule = hits(p, c).find((r) => !hits(p, s).includes(r));
    if (rule) lead.unshift({ key: "rule", w: 1, vars: { text: rule.text } });
    const out = lead.slice(0, 4);
    let neg = 0;
    for (const r of sorted) {
      if (out.length >= 4) break;
      if (r.w < 0 && neg++) continue;
      out.push(r);
    }
    return { why: out.some((r) => r.w > 0) ? out : [guessOf(p, s)], explore };
  };

  const diff: Diff = { placed: [], displaced: [], split: splits };
  const missed: Piece[] = [];
  let top: { score: number; piece: Piece; start: number; why: keyof typeof tpl; prev?: string } | undefined;
  for (const p of pieces) {
    const s = at(p);
    if (s < 0) { (diff.unplaced ??= []).push({ id: p.id, effort: p.effort }); continue; } // no free, awake slot at all: warned below
    const changed = p.prior !== s, known0 = m.placed[p.id];
    // a repeat placed before its day bound stopped counting as a due drops the "Hạn 0:00" reason it was kept for
    if (known0?.why && dueOf(p.task) === undefined) known0.why = known0.why.filter((r) => r.key !== "deadline");
    // held where it was placed: it keeps the reasons it was placed for. Moved by hand since, those reasons were for another time: say them anew.
    if (!changed && known0?.why && p.lock && known0.start === s) continue;
    const alt = altOf(p, s);
    const c = changed && p.prior !== undefined ? p.prior : alt;
    const r = c === undefined ? { why: [guessOf(p, s)], explore: false } : whyOf(p, s, c);
    if (r.explore) m.exploredAt = now;
    // What came of what was asked leads: the window was packed, the length was shrunk, the day ran late. Else, inside the window said.
    const fits: Reason[] = [];
    if (p.ask && (s + dur(p) > p.ask.to || (p.ask.from !== undefined && s < p.ask.from))) fits.push({ key: "packed", w: 1, vars: { was: wasOf(p.ask), to: partOf(s).replace(/^./, (c) => c.toLowerCase()) } });
    if (p.cut !== undefined || p.slow !== undefined) fits.push({ key: "fit", w: 1, vars: { len: p.effort, part: partOf(s), pn: slotOf(s).pn, ...(dueOf(p.task) !== undefined ? { due: when(dueOf(p.task)!, now) } : {}), ...(p.slow !== undefined ? { slow: p.slow } : {}) } });
    if (p.over && s + dur(p) > dayStart(s) + B.to * MIN) fits.push({ key: "over", w: 1 });
    if (!fits.length && p.task.notAfter !== undefined) fits.push({ key: "said", w: 1 });
    if ((p.task.misses ?? 0) >= 3) fits.push({ key: "missed3", w: 1, vars: { n: p.task.misses!, part: partOf(s) } });
    r.why = [...fits, ...r.why].slice(0, 4);
    if (p.task.userEdited?.includes("start") && p.task.start === s) r.why = [{ key: "chose", w: 1 } as Reason, ...r.why.filter((x) => x.key !== "stable")].slice(0, 4);
    if (p.missed !== undefined) {
      r.why.unshift({ key: "missed", w: 1, vars: { time: when(p.missed, now).split(" ").pop()! } }); r.why = r.why.slice(0, 4); missed.push(p);
      // Charged once per missed start: the stored block stays stale until apply writes the replan back, and a plan may run again first.
      const old = m.placed[p.id]; // the hour it was placed on did not work out
      if (old?.missCharged !== p.missed) {
        if (old) update(m.arms[old.arm], old.x, -0.4);
        if (p.task.vec) { m.hist.push({ vec: Array.from(p.task.vec), hour: hourOf(old?.start ?? p.missed), r: -1, at: now, miss: true }); m.hist = m.hist.slice(-300); }
      }
    }
    r.why = grounded(r.why, { task: p.task, start: s, rules: m.rules ?? [], tasks: [...near, ...tasks.filter((t) => t.fixed)] }); // only what is true of the task is said
    if (!r.why.length) r.why = [guessOf(p, s)];
    const known = m.placed[p.id];
    // a held piece keeps the reasons it was placed for; one moved by hand learns its new hour, so a tick credits the hour it really ran
    if (!changed && known) { if (!p.lock || known.start !== s) Object.assign(known, { why: r.why, alt, explore: r.explore, start: s, arm: Math.floor(hourOf(s)), x: xz(p, s, ends) }); continue; }
    const x = xz(p, s, ends), arm = Math.floor(hourOf(s)), from = p.missed ?? p.prior ?? (opts.later === p.id ? p.task.start : undefined);
    diff.placed.push({ id: p.id, start: s, end: s + dur(p), policy: "linucb", arm, x, alt, why: r.why, explore: r.explore, ...(from !== undefined && from !== s ? { from } : {}) });
    m.placed[p.id] = { arm, x, start: s, policy: "linucb", at: now, why: r.why, alt, explore: r.explore, ...(p.missed !== undefined ? { missCharged: p.missed } : {}) };
    if (p.prior === undefined && dueOf(p.task) !== undefined) m.slip[p.task.kind].placed += 1;
    if (from !== undefined && from !== s) diff.displaced.push({ id: p.id, from, to: s });
    if (changed) {
      const th = prep.theta[arm];
      const ai = x.slice(I_AFTER, I_AFTER + KINDS.length).indexOf(1);
      const cands: [keyof typeof tpl, number, string?][] = [
        ["after", ai >= 0 ? th[I_AFTER + ai] : 0, ai >= 0 ? KINDS[ai] : undefined],
        ["similar", th[I_SIM] * x[I_SIM]],
        ["slip", 0.3 * p.slip],
      ];
      for (const [why, score, prev] of cands) if ((why === "slip" || seen(arm)) && score > 0.02 && (!top || score > top.score)) top = { score, piece: p, start: s, why, prev };
    }
  }
  for (const [id, v] of Object.entries(m.placed)) if (v.start < now - 30 * DAY) delete m.placed[id];
  if (top) diff.insight = {
    template: tpl[top.why][0], sub: tpl[top.why][1],
    vars: { title: top.piece.task.title, what: top.piece.task.title.replace(/^\p{Lu}(?!\p{Lu})/u, (c) => c.toLocaleLowerCase("vi")), kind: KIND_VI[top.piece.task.kind], prev: (KIND_VI[top.prev ?? ""] ?? "").replace(/^./, (c) => c.toLocaleUpperCase("vi")), time: when(top.start, now).replace(/^Hôm nay /, "") }, // views/cascade: "dời sang 18:30" today, the day only when not
  };

  const byId = new Map(pieces.map((p) => [p.id, p]));
  // What was read: this week, or as far as the plan reached ("đến 14/3" for a 30-day horizon)
  const far = Math.max(now, ...diff.placed.map((pl) => pl.start)), mon = dayStart(now) - ((new Date(now).getDay() + 6) % 7) * DAY;
  const steps: Step[] = [{ key: "read", vars: { what: far < mon + 7 * DAY ? "tuần này" : `đến ${dayLabel(far).slice(4)}` } }];
  const row = (p: Piece) => (p.id.includes("#") ? p.task.parentId! : p.id);
  const said = new Set<string>(), line = (key: "place" | "move", pl: Placement) => {
    const p = byId.get(pl.id)!, id = row(p);
    if (said.has(id) || p.missed !== undefined) return;
    said.add(id);
    steps.push({ key, id, vars: { title: p.task.title, time: when(pl.start, now) } });
  };
  // A new repeat is one line with all its occurrences, not "Đặt … vào T2", "… T3", "… T4" and then the rest at once
  const series = new Map<string, Placement[]>();
  for (const pl of diff.placed) {
    if (pl.from !== undefined) continue;
    const t = byId.get(pl.id)!.task;
    if (t.rrule && !t.parentId && byId.get(pl.id)!.missed === undefined) { const k = `${t.rrule}|${t.title}`; series.set(k, [...(series.get(k) ?? []), pl]); }
    else line("place", pl);
  }
  for (const pls of series.values()) {
    if (pls.length < 2) { line("place", pls[0]); continue; }
    const xs = [...pls].sort((a, b) => a.start - b.start);
    for (const x of xs) said.add(x.id);
    steps.push({ key: "series", id: xs[0].id, ids: xs.map((x) => x.id), vars: { title: byId.get(xs[0].id)!.task.title, n: xs.length, from: dayLabel(xs[0].start).replace(",", ""), to: dayLabel(xs.at(-1)!.start).replace(",", "") } });
  }
  for (const pl of diff.placed) if (pl.from !== undefined) line("move", pl);
  for (const e of solved.log) if (e.kind === "day" && e.day !== undefined) steps.push({ key: "lighten", vars: { day: day(e.day, now), h: Math.round(fixedHours(allBusy, e.day) + pieces.reduce((n, q) => (dayStart(at(q)) === e.day ? n + dur(q) / HOUR : n), 0)) } });
  for (const id of used) steps.push({ key: "rule", vars: { text: rules.find((r) => r.id === id)!.text } });
  for (const p of missed) steps.push({ key: "missed", vars: { title: p.task.title } });
  diff.steps = steps.slice(0, 6);

  // A deadline task with a piece past its deadline: how much is missing, and which other task could give way.
  const warn: Warn[] = [];
  const pid = (p: Piece) => p.task.parentId ?? p.task.id;
  // A piece past the 30-day horizon has no cell at all: it waits on its day, it is not short of time, so it never warns.
  const reach = (p: Piece) => cells(p, now).length > 0;
  for (const id of new Set(pieces.filter((p) => (at(p) < 0 && reach(p)) || (p.task.deadline !== undefined && at(p) + dur(p) > p.task.deadline)).map(pid))) {
    const mine = pieces.filter((p) => pid(p) === id), out = mine.some((p) => at(p) < 0 && reach(p));
    // Unplaced with no due date: the end of the days it could have gone in.
    const dl = mine[0].task.deadline ?? Math.max(...mine.map((p) => { const cs = cells(p, now); return cs.length ? cs[cs.length - 1] + dur(p) : now; }));
    const others = pieces.filter((p) => pid(p) !== id);
    let free = 0;
    for (let c = Math.ceil(now / SLOT) * SLOT; c + SLOT <= dl; c += SLOT) {
      const h = hourOf(c);
      if (h >= 7 && h < 23 && !allBusy.some((b) => c < b.end && c + SLOT > b.start) && !others.some((q) => c < at(q) + dur(q) && c + SLOT > at(q))) free += SLOT / MIN;
    }
    const need = mine.reduce((n, q) => n + q.effort, 0);
    // Late with time to spare (a pinned or windowed piece): not short of time, so nothing to push and nothing urgent to say.
    if (!out && dl > now && free >= need) continue;
    const fixes = new Map<string, { id: string; title: string; start: number; len: number }>();
    for (const q of others) if ((q.task.deadline === undefined || q.task.deadline > dl) && at(q) >= 0 && at(q) < dl && q.task.title !== mine[0].task.title) fixes.set(pid(q), { id: pid(q), title: q.task.title, start: at(q), len: Math.max(fixes.get(pid(q))?.len ?? 0, q.effort) });
    if (dl <= now) fixes.clear(); // past due: pushing others can't help; the card offers "done" instead
    else if (!fixes.size && !out) continue; // speak only when one tap can help, or when something has no room at all
    warn.push({ id, title: mine[0].task.title, deadline: dl, need, free, fixes: [...fixes.values()].sort((x, y) => y.len - x.len).slice(0, 2).map(({ len: _, ...f }) => f) });
  }
  if (warn.length) diff.warn = warn;
  return { diff, model: m, bump: bump?.length ? bump : undefined, trouble: urgent.length };
}

const DRAG_SIGMA = 0.75; // hours: a drag teaches the hours around it (the narrow kernel was 0.5)
const PART_OF = Array.from({ length: ARMS }, (_, h) => partIdx(h)); // the part of each hour arm
const kernel = (a: number, h: number, sigma = 0.75) => Math.exp(-(cdist(a, h) ** 2) / (2 * sigma ** 2));

const FIRST_MOVE_BOOST = 1;
const FIRST_MOVE_TAU = 30;
// Only the first drag or later of a placement is an impulse; ageMin is minutes since placement.
const boost = (pl: { at?: number; moved?: boolean }, at: number) =>
  pl.moved || pl.at === undefined ? 1 : 1 + FIRST_MOVE_BOOST * Math.exp(-Math.max(0, at - pl.at) / MIN / FIRST_MOVE_TAU);
const clampR = (r: number) => Math.max(-2, Math.min(0, r));
// An outcome teaches its hour's arm and that hour's part arm: the part evidence reaches hours with none of their own (linucb prepare).
const teach = (m: Model, a: number, x: number[], r: number, w = 1) => {
  update(m.arms[a], x, r, w);
  update(m.parts![PART_OF[a]], x, r, w);
};

// Reward from one outcome; every placed task teaches linucb, whichever policy placed it.
const R = { kept: 0.25, done: 0.5, later: -0.5, delete: -0.2 };

/** The reward one outcome gives the placed cell, for stats; undefined when the task was never placed or the event teaches nothing. */
export function outcome(model: Model, ev: TaskEvent, task: Task): { arm: number; x: number[]; policy: string; reward: number } | undefined {
  const pl = model.placed[task.id];
  if (!pl) return;
  const start = pl.start;
  let reward: number | undefined;
  if (ev.type === "later") reward = clampR(R.later * boost(pl, ev.at));
  else if (ev.type === "kept" || ev.type === "done") reward = R[ev.type];
  else if (ev.type === "delete" && ev.at < start) reward = R.delete;
  else if (ev.type === "drag") {
    const from = Number(ev.data?.fromStart ?? start), to = Number(ev.data?.toStart);
    if (Number.isFinite(from) && Number.isFinite(to)) reward = -1; // flat, however far: as learn
  }
  return reward === undefined ? undefined : { arm: pl.arm, x: pl.x, policy: pl.policy ?? "linucb", reward };
}

/** `own`: the caller already holds its own copy of `model` (a loop of learns), so it is updated in place instead of copied again. */
export function learn(model: Model, ev: TaskEvent, task: Task, own = false, classEnds: number[] = []): Model {
  // Teaches nothing: the same model back, so a title/note/place edit doesn't clone and rewrite ~500 KB (decay catches up on the next event).
  if (!["kept", "done", "later", "delete", "drag"].includes(ev.type)) return model;
  const m = own ? model : clone(model);
  decay(m, ev.at);
  m.parts ??= coldParts();
  delete m.hypNow;
  // before 05:00 is the night of the day before, counted past 24:00 (a 00:30 tick is 1470), so a night owl's first and last stay on one day
  const nightMin = (t: number) => { const mo = (t - dayStart(t)) / MIN; return mo < 5 * 60 ? mo + 24 * 60 : mo; };
  const dayOfNight = (t: number) => (t - dayStart(t)) / MIN < 5 * 60 ? dayStart(t - DAY) : dayStart(t);
  // What the day bounds learn from: only times the user chose (a done tick, a drag's new time, a "later" click), never a kept or planned slot.
  const chosen = ev.type === "done" || ev.type === "later" ? ev.at : ev.type === "drag" ? Number(ev.data?.toStart) : NaN;
  if (Number.isFinite(chosen)) {
    const dd = dayOfNight(chosen), mo = nightMin(chosen);
    const act = (m.active ??= []);
    const row = act.find((r) => r.day === dd);
    if (row) { row.first = Math.min(row.first, mo); row.last = Math.max(row.last, mo); }
    else act.push({ first: mo, last: mo, day: dd });
    m.active = act.sort((a, b) => a.day - b.day).slice(-30);
  }
  const pl = m.placed[task.id];
  const hist = (start: number, r: number) => {
    if (task.vec) m.hist.push({ vec: Array.from(task.vec), hour: hourOf(start), r, at: ev.at });
    m.hist = m.hist.slice(-300);
  };
  const start = pl?.start ?? task.start;
  switch (ev.type) {
    case "kept":
      if (pl) { teach(m, pl.arm, pl.x, R.kept); m.kept = [...(m.kept ?? []), ev.at].slice(-300); }
      // The user kept the placement where Zen put it: taken as done at the placed end, for the lead share (aimOf).
      if (pl) leadSample(m, task, task.end ?? start ?? ev.at);
      break;
    case "done": {
      // How much of its window was left when it was finished: learned per kind, so an early finisher is aimed earlier (aimOf).
      leadSample(m, task, ev.at);
      const tod = task.tods?.length === 1 ? task.tods[0][0] : undefined, k = tod === undefined ? -1 : DEFAULT_BOUNDS.parts.findIndex(([a, b]) => tod >= a && tod < b);
      if (k >= 0) { const ps = (m.partSeen ??= {}), xs = (ps[PART_NAMES[k]] ??= []); xs.push(nightMin(ev.at)); ps[PART_NAMES[k]] = xs.slice(-50); }
      // A tick far from the block says little about the planned hour: early credits the hour it happened, late credits none.
      const end = task.end ?? (start ?? 0) + HOUR, late = start !== undefined && ev.at > end + HOUR;
      const early = start !== undefined && ev.at < start - HOUR, arm = early ? Math.floor(hourOf(ev.at)) : pl?.arm;
      if (pl && !late && arm !== undefined) teach(m, arm, pl.x, R.done);
      else if (pl && late) teach(m, pl.arm, pl.x, R.done * -0.25); // done far past the block: a small doubt on the planned hour
      // A tick on a task Zen never placed (a time you set, or done at once) still credits the hour you did it in.
      // shortcut: the day's class hours, what ended just before and alike titles are unknown here, so those features are 0; pass the busy list into learn() if this proves too rough.
      else if (!pl) teach(m, Math.floor(hourOf(ev.at)), features(task, ev.at, { fixedH: () => 0, peak: peakHour(m, ev.at), nb: [], ends: [] }), R.done);
      if (start !== undefined) {
        if (!late) {
          hist(early ? ev.at : start, 1);
          m.doneHours.push({ hour: hourOf(ev.at), at: ev.at, wd: new Date(ev.at).getDay() });
          m.doneHours = m.doneHours.slice(-200);
        }
        // A tick up to 1.5x the planned length (or 30 min past it) teaches the real length. Wider (3x) taught overruns but read late ticks as long work and cost a dense timetable its keeps (bench: dluStudent).
        if (task.vec && task.start !== undefined && task.end !== undefined && ev.at >= task.start && ev.at <= task.start + Math.max(1.5 * (task.end - task.start), (task.end - task.start) + 30 * MIN)) {
          m.efforts.push({ vec: Array.from(task.vec), minutes: Math.min(240, Math.max(15, (ev.at - task.start) / MIN)), at: ev.at, kind: task.kind, ...(task.effortGuessed && task.effort > 0 ? { guess: task.effort } : {}) });
          m.efforts = m.efforts.slice(-200);
        }
        // The rest you took after a lecture or exam that day: from its end to the start you worked (0 to 2 h, else it says nothing).
        const began = task.start !== undefined && task.end !== undefined && ev.at >= task.start && ev.at <= task.end + 30 * MIN ? task.start : ev.at - task.effort * MIN;
        const prev = classEnds.filter((e) => e <= began && dayStart(e) === dayStart(began)).sort((a, b) => b - a)[0];
        if (prev !== undefined && began - prev <= 2 * HOUR) m.afterClass = [...(m.afterClass ?? []), Math.round((began - prev) / MIN)].slice(-30);
      }
      break;
    }
    case "later":
      m.slip[task.kind].later += 1;
      if (pl) {
        const r = clampR(R.later * boost(pl, ev.at));
        teach(m, pl.arm, pl.x, r);
        pl.moved = true;
      }
      if (start !== undefined) hist(start, -1);
      break;
    case "delete":
      if (start !== undefined && ev.at < start) {
        if (pl) { teach(m, pl.arm, pl.x, R.delete); }
        hist(start, -1);
      }
      break;
    case "drag": {
      const from = Number(ev.data?.fromStart ?? start), to = Number(ev.data?.toStart);
      if (!Number.isFinite(from) || !Number.isFinite(to)) break;
      // Where you put it counts even when the planner never placed it (a time you set pins the task): the rhythm reads this list.
      (m.moved ??= []).push({ hour: hourOf(to), at: ev.at, wd: new Date(to).getDay() });
      m.moved = m.moved.slice(-200);
      (m.left ??= []).push({ hour: hourOf(from), at: ev.at, wd: new Date(from).getDay() }); // where you took it off: the slot not to fill again
      m.left = m.left.slice(-200);
      // Flat -1 where it was taken from, +0.5 where it went, each as 3 outcomes on a narrow kernel. Not placed by the planner: its kind alone teaches.
      const x = new Array(D).fill(0);
      if (pl) pl.x.forEach((v, i) => { x[i] = v; });
      else x[4 + KINDS.indexOf(task.kind)] = 1;
      x[0] = 0.5; // the intercept at half weight: the hour's curve, not every kind's
      for (let a = 0; a < m.arms.length; a++) { teach(m, a, x, -1, 3 * kernel(a + 0.5, hourOf(from), DRAG_SIGMA)); teach(m, a, x, 0.5, 3 * kernel(a + 0.5, hourOf(to), DRAG_SIGMA)); }
      hist(from, -1);
      m.hypNow = noteHyp(m, task.kind, hourOf(from), hourOf(to), ev.at);
      if (pl) m.placed[task.id] = { ...pl, start: to, arm: Math.floor(hourOf(to)), moved: true, why: undefined }; // the reasons were for the old time: the next plan says them anew
      break;
    }
    default:
  }
  return m;
}


export { newModel };
