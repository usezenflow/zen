import { embed } from "../../lib/nlu/embed";
import type { Kind, Task } from "../../lib/types";
import { DAY, HOUR, MIN, dayStart, hourOf } from "../features";
import { capOf } from "../../lib/rest";
import { learn, missedReplan, newModel, plan, type Opts } from "../index";
import { GRACE, holding } from "../policy";
import type { Model } from "../model";
import type { MixItem, Persona } from "./personas";
import { gauss, rng } from "./rng";

export type Act = "kept" | "done" | "drag" | "later" | "delete" | "ignore";
/** A planner move of a unit whose start was within 3 h of now (or whose deadline was): what the plan said about it. */
export interface Surprise { id: string; title: string; day: number; now: number; from: number; to: number; prior?: number; sitting: boolean; deadline?: number; why: string[]; steps: string[] }
export interface Resp { day: number; id: string; kind: Kind; hour: number; pref: number; act: Act; start: number; created: number; effort: number; part: boolean; deadline?: number; doneAt?: number }
export interface DayLog { day: number; planned: number; capacity: number; opens: number; drags: number; laters: number; undos: number; edits: number; moves: number; silent: number; rebalances: number; surprise: number; switches: number }
export interface Log {
  persona: string; seed: number; days: number; end: number;
  resps: Resp[]; daily: DayLog[]; tasks: Task[];
  parents: Set<string>; // tasks the planner cut into sittings: the sittings are the units
  zen: Map<string, number>; // Zen's own moves per unit while its start was still ahead
  placed: Set<string>; // units that got a placement
  placements: number; outside: number; bufferHits: number; // every placement, those outside the awake window, those inside a post-class buffer
  lenErr: number[]; // |guessed length - true length| in minutes, per guessed unit the persona answered
  surprises: Surprise[];
  overdueMoves: number; // Zen moves of a start still ahead on a task whose deadline had already passed
  shiftDay?: number;
  unwanted: number[]; // per day: reactions to a start the persona dislikes (dislike band, or a packed morning): the placements it must learn away from
  unwantedHours: Map<number, number>; // the hours (floor) those unwanted starts were at, and the first day of each
}

const dayOf = (d: number) => new Date(2026, 10, 16 + d).getTime(); // day 0 is Monday 16/11/2026, local time
const DEFAULT_PREF = 14;
const PART: Record<"sáng" | "tối", [number, number]> = { sáng: [5, 11], tối: [18, 22] }; // the parts adapt.ts maps, in hours
const IDX: number[][] = [[], [], [0, 4], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4]]; // which candidate opens a day with n opens uses

/** Simulates one persona for `days` days, with the app's rhythm: the planner runs at every open, and the persona replies between opens. */
export function run(p: Persona, { days = p.days ?? 30, seed = 1 } = {}): Log {
  const r = rng(seed);
  let model: Model = newModel(dayOf(0));
  const tasks: Task[] = [], byId = new Map<string, Task>();
  const truth = new Map<string, number>(); // true minutes of a unit: the planner never sees it
  const doomed = new Set<string>(); // units the persona deletes at first sight
  const reacted = new Set<string>(); // `id@start` already decided
  const overdueDone = new Set<string>(); // tasks the overdue rule has already resolved
  const owned = new Set<string>(); // accepted or dragged by hand: the persona has it now
  const funIds = new Set<string>(); // units of a mix item said to be fun (funFirst keeps them wherever they land)
  const ticks: { at: number; id: string; type: "done" | "kept" }[] = []; // the finish times still ahead
  const log: Log = {
    persona: p.name, seed, days, end: dayOf(days), resps: [], daily: [], tasks, parents: new Set(), zen: new Map(), placed: new Set(),
    placements: 0, outside: 0, bufferHits: 0, lenErr: [], surprises: [], overdueMoves: 0, shiftDay: p.shift?.day,
    unwanted: new Array(days).fill(0), unwantedHours: new Map(),
  };
  let n = 0, pull: { from: number; to: number } | undefined;
  let day = 0, accepted = 0, capT = p.capacity;
  let drags = 0, laters = 0, undos = 0, edits = 0, moves = 0, surprise = 0, silent = 0, rebalances = 0;
  let lengthEdited = false; // a length the user corrected in the last reply: the app replans on that edit
  const add = (t: Task) => { tasks.push(t); byId.set(t.id, t); };
  const sid = () => `e${n++}`;
  const prefAt = () => (p.shift && day >= p.shift.day ? { ...p.pref, ...p.shift.pref } : p.pref);
  const finish = (id: string, start: number) => start + Math.max(5, truth.get(id)! + gauss(r) * 12 + (p.bias ?? 0)) * MIN;
  const awakeAt = (h: number) => { const hh = h < p.wake ? h + 24 : h; return hh >= p.wake && hh < p.sleep; };
  const lectures = () => tasks.filter((x) => x.fixed === "lecture");

  // Fixed items that exist from the start: exams, and their preps (made 4 days before, due the evening before).
  const prepsOn = new Map<number, Task[]>();
  (p.exams ?? []).forEach((e, k) => {
    if (e.day >= days) return;
    const s = dayOf(e.day) + e.from * HOUR;
    add({ id: `exam${k}`, title: e.title, kind: "study", source: "dlu", fixed: "exam", effort: e.len, start: s, end: s + e.len * MIN, createdAt: dayOf(0) });
    const prep: Task = { id: `prep${k}`, title: `Ôn thi ${e.title}`, vec: embed(`Ôn thi ${e.title}`), kind: "study", source: "user", effort: 150, maxSitting: 90, forId: `exam${k}`, deadline: dayOf(e.day), createdAt: 0 };
    truth.set(prep.id, 150);
    const pd = Math.max(0, e.day - 4);
    prepsOn.set(pd, [...(prepsOn.get(pd) ?? []), prep]);
  });

  // The timetable is known from the start (the DLU sync gives the week ahead), so a lecture is never a change in the middle of a day.
  for (let dd = 0; dd < days; dd++) for (const l of p.lectures ?? []) if (l.wd === dd % 7 && (!l.odd || Math.floor(dd / 7) % 2 === 1)) {
    const d0 = dayOf(dd);
    add({ id: `lec${dd}-${n++}`, title: l.title, kind: "study", source: "dlu", fixed: "lecture", effort: (l.to - l.from) * 60, start: d0 + l.from * HOUR, end: d0 + l.to * HOUR, createdAt: dayOf(0) });
  }

  const openHours = (): number[] => {
    const k = 2 + Math.floor(r() * 4);
    return IDX[k].map((i) => Math.min(p.sleep - 1, Math.max(p.wake, p.opens[i] + r() - 0.5))).sort((a, b) => a - b);
  };

  /** The planner runs; moves it made to unit starts still ahead are counted, except the one a later asked for. */
  const replan = (now: number, extra: Opts = {}) => {
    const o: Opts = { ...(pull ? { pull } : {}), ...extra };
    pull = undefined;
    // Like the app (apply.ts: plan([...w.tasks.values()])): every task that exists by now, done and deleted included; plan() filters the live ones.
    const open = tasks.filter((t) => t.createdAt <= now);
    const before = new Map(open.map((t) => [t.id, t.start]));
    const res = plan(open, [], model, now, o);
    model = res.model;
    for (const pl of res.diff.placed) {
      let t = byId.get(pl.id);
      if (!t) { // a sitting the planner cut from its parent: the app keeps it as a task of its own
        const parent = byId.get(pl.id.slice(0, pl.id.lastIndexOf("#")));
        if (!parent) continue;
        log.parents.add(parent.id);
        parent.start = undefined; parent.end = undefined; // the parent keeps no time of its own once it is split (apply.ts sitting())
        t = { ...parent, id: pl.id, parentId: parent.id, effort: (pl.end - pl.start) / MIN, start: undefined, end: undefined, doneAt: undefined, deletedAt: undefined, userEdited: undefined, pinned: undefined, holdUntil: undefined };
        truth.set(t.id, t.effort * (parent.effortGuessed ? p.fallacy[parent.kind] ?? 1 : 1));
        add(t);
      }
      const old = before.get(t.id);
      if (old === undefined) log.placed.add(t.id);
      if (old !== undefined && old > now && old !== pl.start && o.later !== t.id) {
        log.zen.set(t.id, (log.zen.get(t.id) ?? 0) + 1);
        moves++;
        if (o.fill && !o.pull) silent++; // a fill pass (arrival or open) moved a piece no one asked to move
        if (t.deadline !== undefined && t.deadline < now) log.overdueMoves++; // a start still ahead moved on a task already past its deadline
        if (old - now <= 3 * HOUR) { // a surprise: a start within 3 h, moved by Zen (a past deadline does not count)
          surprise++;
          log.surprises.push({
            id: t.id, title: t.title, day, now, from: old, to: pl.start, prior: pl.from, sitting: !!t.parentId, deadline: t.deadline,
            why: (pl.why ?? []).map((w) => w.key),
            steps: (res.diff.steps ?? []).filter((s) => s.id === t.id || s.ids?.includes(t.id)).map((s) => s.key),
          });
        }
      }
      log.placements++;
      if (!awakeAt(hourOf(pl.start))) log.outside++;
      const after = lectures().find((x) => pl.start >= x.end! && pl.start < x.end! + p.buffer * MIN);
      if (after) log.bufferHits++;
      const mis = missedReplan(t, pl, now); // apply.ts writes the same: one miss counted, a guessed length shrinks from the third
      t.start = pl.start; t.end = mis?.effort !== undefined ? pl.start + mis.effort * MIN : pl.end;
      if (mis) t.misses = mis.misses;
      if (mis?.effort !== undefined) t.effort = mis.effort;
    }
  };

  const applyTicks = (now: number) => {
    ticks.sort((a, b) => a.at - b.at);
    while (ticks.length && ticks[0].at <= now) {
      const k = ticks.shift()!, t = byId.get(k.id)!;
      if (t.deletedAt) continue;
      if (k.type === "done") model = learn(model, { id: sid(), taskId: t.id, type: "done", at: k.at }, t, true, lectures().filter((x) => x.end! <= k.at).map((x) => x.end!)); // the app passes the day's class ends the same way
      t.doneAt = k.at;
      pull = { from: t.start!, to: t.end! }; // the time a finished task frees
    }
  };

  /** Unit the persona has not answered yet, starting today ahead of `now`. */
  const decidable = (t: Task, now: number) => !t.fixed && t.start !== undefined && t.start >= now && t.start < dayStart(now) + DAY
    && !t.doneAt && !t.deletedAt && !log.parents.has(t.id) && !owned.has(t.id) && !reacted.has(`${t.id}@${t.start}`);

  const react = (t: Task, now: number) => {
    const start = t.start!, id = t.id, pref = prefAt()[t.kind] ?? DEFAULT_PREF;
    const h = hourOf(start) < p.wake ? hourOf(start) + 24 : hourOf(start);
    const dated = t.deadline !== undefined, left = dated ? (t.deadline! - start) / DAY : Infinity;
    if (dated && p.deadlineStyle === "late" && left > 2) return; // waits: no reply yet
    reacted.add(`${id}@${start}`);
    const rec = (act: Act, doneAt?: number) => log.resps.push({ day, id, kind: t.kind, hour: h, pref, act, start, created: t.createdAt, effort: t.effort, part: !!t.tods, deadline: t.deadline, doneAt });
    if (doomed.has(id)) {
      model = learn(model, { id: sid(), taskId: id, type: "delete", at: now }, t, true);
      t.deletedAt = now; pull = { from: start, to: t.end! };
      rec("delete"); replan(now, { fill: true }); return;
    }
    if (t.effortGuessed && r() < 0.1) { // the length was a guess: the user corrects it
      t.effort = Math.round(truth.get(id)! / 5) * 5; delete t.effortGuessed; t.end = start + t.effort * MIN; edits++; lengthEdited = true;
    }
    const bingeing = p.binge === t.kind; // a binge takes its kind whatever the load says
    const load = (accepted + t.effort / 60) / capT, full = !bingeing && load > 1;
    const tired = !bingeing && r() < Math.min(0.9, Math.max(0, (load - 0.6) / 0.6));
    // A dated task is kept only when placed in the first 80% of its window (lead focus); otherwise it waits.
    const lead = p.leadFrac === undefined || !dated || (start - t.createdAt) <= p.leadFrac * (t.deadline! - t.createdAt);
    // A dislike is a start the persona must learn away from (it is never kept): every hour of its band, or a morning start while the morning is packed.
    const disliked = p.dislike !== undefined && h >= p.dislike.from && h < p.dislike.to;
    const dayOfNow = dayStart(now), morningN = p.packedMorning === undefined || h >= 12 ? 0 : tasks.filter((x) => x !== t && !x.fixed && x.start !== undefined && x.start >= dayOfNow && x.start < dayOfNow + 12 * HOUR && hourOf(x.start) < 12 && !x.doneAt && !x.deletedAt && !log.parents.has(x.id)).length;
    const packed = p.packedMorning !== undefined && h < 12 && morningN >= p.packedMorning;
    if ((disliked || packed) && !log.unwantedHours.has(Math.floor(h))) log.unwantedHours.set(Math.floor(h), day);
    if (disliked || packed) log.unwanted[day]++;
    const stalls = p.stall !== undefined && t.effort >= p.stall.minutes && r() < p.stall.p; // a long block it puts off: only shorter sittings get done
    if (!lead || stalls || ((tired || full) && r() < 0.5)) { // postponed when tired or over capacity, or placed too late in its window
      model = learn(model, { id: sid(), taskId: id, type: "later", at: now }, t, true);
      laters++; rec("later"); replan(now, { later: id }); return;
    }
    const inside = awakeAt(hourOf(start));
    const buffered = p.buffer > 0 && lectures().some((x) => start >= x.end! && start < x.end! + p.buffer * MIN);
    const tooLate = dated && p.deadlineStyle === "early" && left < 1;
    const near = dated && p.deadlineStyle === "late" && left <= 2;
    const batched = p.batch === undefined || t.kind !== p.batch || tasks.some((x) => x !== t && x.kind === p.batch && !x.doneAt && !x.deletedAt && x.start !== undefined && Math.abs(x.start - start) <= HOUR);
    const hated = p.hate !== undefined && h >= p.hate.from && h < p.hate.to;
    const fits = inside && !buffered && !full && batched && !hated && !disliked && !packed;
    const chaos = p.noise !== undefined && r() < p.noise;
    const funKept = p.funFirst === true && funIds.has(id); // fun first: a fun task is kept wherever it lands
    const ok = !tooLate && (chaos ? fits && r() < 0.5 : fits && (near || bingeing || funKept || Math.abs(h - pref) <= p.spread));
    if (ok) {
      accepted += t.effort / 60; owned.add(id);
      if (t.effortGuessed) log.lenErr.push(Math.abs((t.end! - t.start!) / MIN - truth.get(id)!)); // the block Zen planned, not the raw guess
      const doneAt = finish(id, start);
      if (r() < 0.7) { model = learn(model, { id: sid(), taskId: id, type: "kept", at: now }, t, true); ticks.push({ at: doneAt, id, type: "kept" }); rec("kept", doneAt); }
      else { ticks.push({ at: doneAt, id, type: "done" }); rec("done", doneAt); }
      return;
    }
    // The preferred hour today has passed (the app opened after it): the drag goes to tomorrow's, it is not ignored forever.
    const todayTo = dayStart(now) + Math.round(pref * HOUR), to = todayTo < now ? todayTo + DAY : todayTo;
    const clash = tasks.some((x) => x.fixed && x.start! < to + t.effort * MIN && x.end! > to);
    const restTo = p.buffer > 0 && lectures().some((x) => to >= x.end! && to < x.end! + p.buffer * MIN); // it will not drag into its own rest
    // a persona never drags work into an hour it refuses to work in (the hated band), any more than it keeps work there
    const toH = hourOf(to) < p.wake ? hourOf(to) + 24 : hourOf(to), hatedTo = p.hate !== undefined && toH >= p.hate.from && toH < p.hate.to;
    if (to === start || clash || hated || hatedTo || restTo || r() < p.ignoreP) { rec("ignore"); return; }
    // Drag: the user moves it to the best hour and does it there. Zen never moves a user-set start while the hold lasts.
    const from = start, fromEnd = t.end!, fromUser = t.userEdited, fromHold = t.holdUntil, undo = r() < 0.05;
    const snap = undo ? JSON.parse(JSON.stringify(model)) as Model : undefined;
    model = learn(model, { id: sid(), taskId: id, type: "drag", at: now, data: { fromStart: from, toStart: to } }, t, true);
    t.start = to; t.end = to + t.effort * MIN; t.userEdited = ["start"];
    t.holdUntil = dayStart(to) + DAY; // a time set by hand holds until its day ends (apply.ts: addDays(dayStart(when), 1))
    // The newest time set by hand wins (apply.ts transactNow): an older hold under it gives way, a running flexible block is freed; both are planned again.
    for (const x of tasks) if (x !== t && !x.fixed && !x.doneAt && !x.deletedAt && x.start !== undefined && x.end !== undefined && t.start! < x.end && x.start < t.end!) {
      if (!holding(x, now)) { if (x.start <= now && now < x.end) { x.start = undefined; x.end = undefined; } continue; }
      if (x.start > now) { x.holdUntil = undefined; x.userEdited = x.userEdited?.filter((f) => f !== "start"); }
    }
    drags++; rec("drag");
    if (undo) { // taken back: the model and the old time return, and the persona looks at the plan again
      model = snap!; t.start = from; t.end = fromEnd; t.userEdited = fromUser; t.holdUntil = fromHold; undos++; reacted.delete(`${id}@${from}`);
      return;
    }
    accepted += t.effort / 60; owned.add(id);
    if (t.effortGuessed) log.lenErr.push(Math.abs((t.end! - t.start!) / MIN - truth.get(id)!)); // the block Zen planned, not the raw guess
    ticks.push({ at: finish(id, to), id, type: "done" });
    replan(now, { avoid: [{ from, to: fromEnd }] });
  };

  const make = (m: MixItem, i: number, createdAt: number): Task => {
    const id = `t${day}-${i}-${n++}`, guessed = !!m.effortGuessed;
    const t: Task = { id, title: m.title, vec: embed(m.title), kind: m.kind, source: "user", effort: m.effort, createdAt, ...(guessed ? { effortGuessed: true, maxSitting: 90 } : {}) };
    if (m.dueInDays !== undefined) {
      const [lo, hi] = typeof m.dueInDays === "number" ? [m.dueInDays, m.dueInDays] : m.dueInDays;
      t.deadline = dayOf(day + lo + Math.floor(r() * (hi - lo + 1))) + 22 * HOUR;
    }
    if (m.part) { // a said part: the sitting's window is that part of its day, as adapt.ts sets it
      const [a, b] = PART[m.part];
      const dd = day + (createdAt > dayOf(day) + b * HOUR || r() < 0.5 ? 1 : 0);
      t.tods = [[a * 60, b * 60]];
      t.notAfter = dayOf(dd) + b * HOUR;
    }
    truth.set(id, m.effort * (guessed ? p.fallacy[m.kind] ?? 1 : 1));
    if (m.fun) funIds.add(id);
    if (r() < (p.deleteP ?? 0.03)) doomed.add(id);
    return t;
  };

  /** apply.ts sweepUndone, mirrored (the original reads the store): at 21:30 what was left undone today moves to tomorrow from 9h, silently.
   *  Only those tasks are re-placed, as a user-caused pass (not a fill pass), so it is not a silent move. */
  const sweep = (now: number) => {
    const from = dayStart(now) + DAY + 9 * HOUR;
    const pick = (x: Task) => !x.fixed && !x.doneAt && !x.deletedAt && !x.pinned && !holding(x, now) && !x.userEdited?.includes("start")
      && x.start !== undefined && x.end !== undefined && dayStart(x.start) === dayStart(now) && x.end + GRACE <= now
      && (x.deadline ?? Infinity) > from && (x.notAfter ?? Infinity) > from;
    const moved = tasks.filter(pick);
    if (!moved.length) return;
    for (const x of moved) x.notBefore = Math.max(x.notBefore ?? 0, from); // start and end stay: the replan sees the lost block and counts the miss
    replan(now, { only: moved.map((x) => x.id) });
  };

  /** Days (the next 7, from today) whose booked time is over the day's cap: apply.ts overDays, mirrored (it is not exported). */
  const overDays = (list: Task[], now: number) => {
    const out = new Set<number>();
    for (let i = 0; i < 7; i++) {
      const d = dayStart(now + i * DAY), e = dayStart(now + (i + 1) * DAY);
      const load = list.reduce((s, x) => (!x.doneAt && !x.deletedAt && x.start !== undefined && x.end !== undefined && x.start < e && x.end > d ? s + Math.min(x.end, e) - Math.max(x.start, d) : s), 0);
      if (load > capOf(list, d, now, 0, false).ms) out.add(d);
    }
    return out;
  };

  /** apply.ts proposeRebalance, mirrored (the original reads and writes the store): a dry plan that may move placed work, kept only when it
   *  moves something and drops an overloaded day. The persona takes the proposal unless it ignores proposals (ignoreP). */
  const rebalance = (now: number) => {
    const open = tasks.filter((x) => x.createdAt <= now);
    const over = overDays(open, now);
    if (!over.size) return;
    const res = plan(open, [], model, now, {}); // dry: its model is dropped, as a dry transaction writes nothing
    const moves = res.diff.placed.map((pl) => ({ t: byId.get(pl.id), to: pl.start }))
      .filter((m): m is { t: Task; to: number } => !!m.t && m.t.start !== undefined && m.t.start > now && m.to !== m.t.start);
    if (!moves.length) return;
    const to = new Map(moves.map((m) => [m.t.id, m.to]));
    const after = open.map((x) => (to.has(x.id) ? { ...x, start: to.get(x.id), end: to.get(x.id)! + (x.end! - x.start!) } : x));
    if (overDays(after, now).size >= over.size || r() < p.ignoreP) return;
    for (const m of moves) { const len = m.t.end! - m.t.start!; m.t.start = m.to; m.t.end = m.to + len; }
    rebalances += moves.length;
  };

  for (day = 0; day < days; day++) {
    const d0 = dayOf(day), weekend = day % 7 >= 5, holiday = !!p.holidays?.includes(day);
    const jit = p.capJitter ?? 0.2;
    capT = (holiday ? p.holidayCapacity ?? p.capacity * 0.5 : p.capacity * (weekend ? p.weekendCapacity ?? 1 : 1)) * (1 + (2 * r() - 1) * jit);
    accepted = drags = laters = undos = edits = moves = surprise = silent = rebalances = 0;

    // The app opens: 2 to 5 times a day. The gaps between opens are when new tasks arrive.
    const hours = openHours(), opens = hours.map((h) => d0 + Math.round(h * 60) * MIN);
    const nextFirst = d0 + DAY + Math.round(hours[0] * 60) * MIN;
    const gaps = opens.map((o, i) => [o, i + 1 < opens.length ? opens[i + 1] : nextFirst]);
    const arrive = (m: MixItem, i: number) => {
      const g = gaps[Math.floor(r() * gaps.length)];
      add(make(m, i, Math.round(g[0] + r() * (g[1] - g[0]))));
    };
    if (!holiday) p.mix.forEach((m, i) => {
      const on = m.weekdays ? m.weekdays.includes(day % 7) : r() < (m.perWeek / 7) * (weekend ? p.weekendScale ?? 1 : 1);
      if (on) arrive(m, i);
    });
    for (const prep of prepsOn.get(day) ?? []) { const g = gaps[0]; prep.createdAt = Math.round(g[0]); add({ ...prep, id: `${prep.id}-${day}` }); truth.set(`${prep.id}-${day}`, 150); }

    // The app's day: the opens (new tasks arrive in the gaps, and a fill pass places them), and the 21:30 sweep between them.
    const sweepAt = d0 + Math.round(21.5 * 60) * MIN;
    const stops = [...opens.map((at, k) => ({ at, k })), { at: sweepAt, k: -1 }].sort((a, b) => a.at - b.at);
    for (const { at: now, k } of stops) {
      applyTicks(now);
      if (k < 0) { sweep(now); continue; }
      // Overdue rule: a task more than a day past its deadline is finished (60%) or deleted (40%) at the next open. Once only.
      for (const t of tasks) {
        if (t.fixed || log.parents.has(t.id) || t.deadline === undefined || t.deadline + DAY >= now || t.doneAt || t.deletedAt) continue;
        if (overdueDone.has(t.id) || ticks.some((x) => x.id === t.id)) continue;
        overdueDone.add(t.id);
        if (r() < 0.6) t.doneAt = now; else t.deletedAt = now;
      }
      replan(now, { fill: true });
      if (k === 0) rebalance(now); // maybeRebalance: once a day, at the first open
      const seen = new Set<string>();
      for (let guard = 0; guard < 40; guard++) {
        const next = tasks.filter((t) => decidable(t, now) && !seen.has(t.id)).sort((a, b) => a.start! - b.start!)[0];
        if (!next) break;
        seen.add(next.id);
        lengthEdited = false;
        react(next, now);
        if (lengthEdited) replan(now); // a user-caused pass (not a fill pass): the corrected block may now overlap a placed one
      }
    }

    // The day's own work as planned at the last open (done or not), and how often two kinds sit side by side.
    const dayTasks = tasks.filter((t) => !t.fixed && t.start !== undefined && !t.deletedAt && !log.parents.has(t.id) && t.start >= d0 && t.start < d0 + DAY)
      .sort((a, b) => a.start! - b.start!);
    let switches = 0;
    for (let i = 1; i < dayTasks.length; i++) if (dayTasks[i].kind !== dayTasks[i - 1].kind) switches++;
    log.daily.push({
      // planned is the true time the day's work takes: a guessed length counts as the persona really takes it
      day, planned: dayTasks.reduce((s, t) => s + (truth.get(t.id) ?? t.effort) / 60, 0), capacity: capT, opens: opens.length,
      drags, laters, undos, edits, moves, silent, rebalances, surprise, switches,
    });
  }
  for (const k of ticks) byId.get(k.id)!.doneAt = k.at; // finishes after the last open land at the end of the run
  return log;
}
