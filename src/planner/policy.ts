import type { Diff, Placement, Reason, ReasonKey, Step, Task, TaskEvent, TaskType, Warn } from "../lib/types";
import { DAY, HOUR, I_AFTER, I_ENERGY, I_SIM, KINDS, MIN, type FeatCtx, cdist, dayStart, dueOf, features, hourOf } from "./features";
import { effort, neighbors, peakHour, slipOf } from "./habits";
import { ALPHA, D, LAMBDA, N0, type Primed, decayArms, prepare, primeBatch, ucb, ucbAt, update } from "./linucb";
import { type Model, newModel } from "./model";
import { type Busy, type End, type Util, SLOT, STEP, WAKE_TO, awake, cells, dayGone, fixedHours, gap, solve } from "./place";
import { day, dayLabel, when } from "../lib/when";
import { split } from "./split";
import { type Piece, bell, dur, lateH, moveCost, startValue } from "./value";

const LONG_SITTING = 180; // near a deadline sittings merge up to this; longer work still splits

export interface Opts { later?: string; hourOnly?: boolean }

const HALF = 21 * DAY;
const COLD_A0 = LAMBDA + N0;
const SURE = 3; // outcomes an hour must remember before a reason may name it
type Titled = Busy & { title?: string };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
// One colour per task everywhere (rows, week, month, detail): a prep is the user's plan even though it has a due time.
export const typeOf = (t: Task): TaskType => t.fixed ?? (dueOf(t) !== undefined && !t.forId ? "assignment" : "plan");
const round15 = (m: number) => Math.max(15, Math.ceil(m / 15) * 15);

function decay(m: Model, now: number) {
  const dt = now - m.at;
  if (dt <= 0) return;
  decayArms(m.arms, dt);
  const g = 0.5 ** (dt / HALF);
  for (const k of KINDS) { m.slip[k].later *= g; m.slip[k].placed *= g; }
  m.at = now;
}

const tpl = {
  after: ["Bạn hay {prev} trước khi {kind}", "{title} dời sang {time}"],
  similar: ["{title} dời sang {time}", "Hợp giờ bạn hay làm việc tương tự"],
  slip: ["{title} được xếp sớm hơn, lúc {time}", "Bạn hay dời lại việc {kind}"],
};
const KIND_VI: Record<string, string> = { study: "học", exercise: "tập thể dục", chores: "làm việc nhà", social: "gặp gỡ", other: "làm việc khác" };

export function plan(tasks: Task[], busy: Busy[], model: Model, now: number, opts: Opts = {}): { diff: Diff; model: Model } {
  const m = clone(model);
  decay(m, now);
  const live = tasks.filter((t) => !t.doneAt && !t.deletedAt);
  const allBusy: Titled[] = [...busy];
  const fixedEnds: End[] = [];
  const flex: Task[] = [];
  for (const t of live) {
    const inProgress = t.start !== undefined && t.end !== undefined && t.start <= now && now < t.end && opts.later !== t.id; // "later" on the running task moves it
    if ((t.fixed || t.pinned || inProgress) && t.start !== undefined && t.end !== undefined) {
      allBusy.push({ start: t.start, end: t.end, title: t.title });
      fixedEnds.push({ kind: t.kind, end: t.end });
    } else if (!t.fixed) flex.push(t);
  }
  allBusy.sort((a, b) => a.start - b.start);

  const kids = new Map<string, Task[]>();
  for (const t of flex) if (t.parentId) (kids.get(t.parentId) ?? kids.set(t.parentId, []).get(t.parentId)!).push(t);
  // Every sitting a parent ever had (done, deleted, pinned too): its open ones are placed, never split again.
  const ever = new Map<string, Task[]>();
  for (const t of tasks) if (t.parentId) (ever.get(t.parentId) ?? ever.set(t.parentId, []).get(t.parentId)!).push(t);
  const ix = (t: Task) => Number(t.id.slice(t.id.lastIndexOf("#") + 1)) || 0; // "p#10" after "p#9", not between 1 and 2
  const pieces: Piece[] = [];
  const splits: Diff["split"] = [];
  const mk = (task: Task, eff: number, k: number, n: number, prior?: number, missed?: number): Piece => ({
    id: task.id, task, effort: eff, k, n, slip: dueOf(task) === undefined ? 0 : slipOf(m, task.kind),
    over: task.deadline !== undefined && !task.rrule && dayStart(task.deadline - 1) === dayStart(now) && Math.ceil(now / STEP) * STEP + eff * MIN > dayStart(now) + WAKE_TO * MIN,
    prior: prior !== undefined && prior >= now ? prior : undefined, missed, soon: missed !== undefined || opts.later === task.id || opts.later === task.parentId,
  });
  const lost = (t: Task) => (t.start !== undefined && t.end !== undefined && t.end <= now ? t.start : undefined);
  for (const t of flex) {
    if (t.parentId) continue;
    if (dayGone(t, now)) continue; // a past day of a repeating task stays missed; the next day has its own
    const sibs = kids.get(t.id), old = ever.get(t.id);
    if (sibs) {
      sibs.sort((a, b) => ix(a) - ix(b)).forEach((c, i) => pieces.push(mk(c, round15(c.effort), i + 1, sibs.length, c.start, lost(c))));
      continue;
    }
    // No open sitting left yet not done: its sittings were dropped to resize it (materialize). Split what is left again, with new ids.
    if (old?.some((c) => !c.doneAt && !c.deletedAt)) continue; // pinned or running: already busy time
    const done = old?.filter((c) => c.doneAt) ?? [];
    const left = effort(t, m) - done.reduce((a, c) => a + c.effort, 0);
    if (old && left <= 0) continue;
    let eff = round15(left);
    let cap = t.maxSitting ?? 120;
    // A tight deadline gets fewer sittings, one per whole day left (under a day: one), not a full set crammed in.
    // Exam prep (maxSitting) shrinks its total a little with them (halfway to proportional); other work keeps its size, in sittings of at most 3 h.
    const natural = Math.ceil(eff / cap), room = t.deadline === undefined ? natural : Math.max(1, Math.floor((t.deadline - now) / DAY));
    if (natural > room && t.maxSitting !== undefined) { eff = round15((eff * (natural + room)) / (2 * natural)); cap = round15(eff / room); }
    else if (natural > room) cap = Math.max(cap, Math.min(round15(eff / room), LONG_SITTING));
    if (eff > cap || old) {
      const sizes = split(eff, cap), from = old ? Math.max(...old.map(ix)) : 0, d = done.length;
      const ids = sizes.map((_, i) => `${t.id}#${from + i + 1}`);
      sizes.forEach((s, i) => pieces.push(mk({ ...t, id: ids[i], parentId: t.id, effort: s, start: undefined, end: undefined }, s, d + i + 1, d + sizes.length, undefined, i ? undefined : lost(t))));
      splits.push({ parentId: t.id, ids });
    } else pieces.push(mk(t, eff, 1, 1, t.start, lost(t)));
  }
  // Orphan sittings whose parent is gone or done.
  for (const t of flex) if (t.parentId && !flex.some((p) => p.id === t.parentId && !p.parentId) && !pieces.some((p) => p.id === t.id)) {
    pieces.push(mk(t, round15(t.effort), 1, 1, t.start, lost(t)));
  }

  const peak = peakHour(m, now);
  const nbs = new Map(pieces.map((p) => [p.id, neighbors(p.task, m, now)]));
  const fh = new Map<number, number>(), fixedH = (d: number) => fh.get(d) ?? (fh.set(d, fixedHours(allBusy, d)), fh.get(d)!); // once per day, not per cell
  const ctx = (p: Piece, ends: End[]): FeatCtx => ({ fixedH, peak, nb: nbs.get(p.id)!, ends });
  const xOf = (p: Piece, s: number, ends: End[]) => features(p.task, s, ctx(p, ends));
  const prep = prepare(m.arms);
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
  const held: Busy[] = [...allBusy], own = (p: Piece) => Number(!!p.task.userEdited?.includes("start"));
  for (const p of [...pieces].sort((a, b) => own(b) - own(a))) { // a time set by hand wins a clash between two plans
    const s = p.prior, t = p.task;
    if (s === undefined) continue;
    const e = s + dur(p);
    if (spanLater(p, s) || hits(p, s).length || !awake(p, s) || (t.deadline !== undefined && e > t.deadline) || (t.notAfter !== undefined && e > t.notAfter) || (t.notBefore !== undefined && s < t.notBefore) || held.some((b) => s < b.end && e > b.start)) continue;
    p.lock = true; held.push({ start: s, end: e });
  }
  // Exploring: not while the model is cold, and only the first new piece without a deadline per plan.
  const explorer = m.hist.length + m.doneHours.length >= 5 ? pieces.find((p) => dueOf(p.task) === undefined && p.prior === undefined) : undefined;
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
      masked[i] = h.length || spanLater(p, c) || !awake(p, c, day) ? 1 : 0;
      if (masked[i]) continue; // scored BLOCK whatever its features: skip the work
      if (opts.hourOnly) X[i * D] = 1; else X.set(features(p.task, c, c0), i * D);
    }
    batches.set(p.id, { lo: cs[0], n, prim: primeBatch(prep, X, arm, I_AFTER, 5), masked });
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
    if (spanLater(p, s) || hits(p, s).length || !awake(p, s)) return BLOCK;
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
  const solved = solve(pieces, { busy: allBusy, fixedEnds, now, util: linUtil, utilAll: linAll }, [...pieces.map((p) => p.id)].sort().join("|").split("").reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261)); // same pieces, same plan
  const at = (p: Piece) => solved.starts.get(p.id)!;

  // Busy time and every placed piece, sorted once per plan (not once per piece: that was O(P² log P)).
  const taken: (Busy & { by?: Piece })[] = [...allBusy, ...pieces.filter((q) => at(q) >= 0).map((q) => ({ start: at(q), end: at(q) + dur(q), by: q }))].sort((x, y) => x.start - y.start);
  // Second-best start in solver terms: at least 1 h from the pick, clear of busy time.
  const altOf = (p: Piece, start: number) => {
    let top: { c: number; v: number } | undefined;
    const cs = cells(p, now), u = linAll(p, fixedEnds);
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
      if (Math.abs(c - start) < HOUR || (j < spans.length && spans[j].start < c + dur(p))) continue;
      const v = startValue(p, c, now, u[i]);
      if (!top || v > top.v) top = { c, v };
    }
    return top?.c;
  };
  const ends: End[] = [...fixedEnds, ...pieces.filter((p) => at(p) >= 0).map((p) => ({ kind: p.task.kind, end: at(p) + dur(p) }))];

  // The solver terms rebuilt from value.ts and place.ts's day cost (mirrored here: place.ts does not export them).
  const flexH = (d: number, skip: Piece) => pieces.reduce((n, q) => (q !== skip && dayStart(at(q)) === d ? n + dur(q) / HOUR : n), 0);
  const loadH = (p: Piece, s: number) => { const d = dayStart(s); return fixedHours(allBusy, d) + flexH(d, p) + dur(p) / HOUR; };
  const hinge = (h: number) => 0.3 * Math.max(0, h - 4) + Math.max(0, h - 6);
  const halo = (p: Piece, s: number) => {
    let n = 0, who: string | undefined;
    for (const b of allBusy) if (!(s < b.end && s + dur(p) > b.start) && s - HOUR < b.end && s + dur(p) + HOUR > b.start) { n++; who ??= b.title; }
    return { v: 0.1 * n * (p.effort / 30), who };
  };
  const GROUPS: [ReasonKey, number, number][] = [["hour", 0, 1], ["weekend", 1, 2], ["busy", 2, 3], ["deadline", 3, 4], ["kind", 4, 9], ["after", 9, 14], ["energy", 14, 15], ["similar", 15, 16]];
  const dot = (th: ArrayLike<number>, x: number[], k0 = 0, k1 = D) => { let v = 0; for (let k = k0; k < k1; k++) v += th[k] * x[k]; return v; };
  // No learned reason yet: say what is true from the task itself (its due, its length), never "I do not know you".
  const guessOf = (p: Piece): Reason => dueOf(p.task) !== undefined ? { key: "deadline", w: 1, vars: { due: when(dueOf(p.task)!, now) } } : { key: "guess", w: 1, vars: { m: p.effort } };
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
      const ai = xs.slice(I_AFTER, I_AFTER + 5).indexOf(1), aj = ai >= 0 ? ai : xc.slice(I_AFTER, I_AFTER + 5).indexOf(1);
      put(key, w, key === "deadline" ? { due: p.task.deadline === undefined ? "" : when(p.task.deadline, now) }
        : key === "kind" ? { kind: p.task.kind } : key === "after" ? { prev: KINDS[aj] ?? "" }
        : key === "similar" ? { hour: Math.round(hourOf(s)) } : undefined);
    }
    const meanS = dot(ths, xs), meanC = dot(thc, xc);
    const bonus = a ? ucb(prep, as, xs, a) - meanS - (ucb(prep, ac, xc, a) - meanC) : 0;
    const explore = bonus > 0 && meanS < meanC;
    if (explore) put("explore", bonus);
    if (p.n > 1) put("pace", bell(p, now, s) - bell(p, now, c), { k: p.k, n: p.n });
    put("late", 100 * (lateH(p, c) - lateH(p, s)));
    const stab = moveCost(p, c, now) - moveCost(p, s, now);
    if (stab > 0) put("stable", stab); // no wording for "moving cost us"
    const Ls = loadH(p, s);
    put("load", hinge(loadH(p, c)) - hinge(Ls), { h: Math.round(Ls) });
    const hs = halo(p, s), hc = halo(p, c);
    put("gap", hc.v - hs.v, (hs.v > hc.v ? hs.who : hc.who) ? { title: (hs.v > hc.v ? hs.who : hc.who)! } : undefined);
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
    return { why: out.some((r) => r.w > 0) ? out : [guessOf(p)], explore };
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
    if (!changed && known0 && p.lock) continue; // held, and placed before: it keeps the reasons it was placed for, nothing to recompute
    const alt = altOf(p, s);
    const c = changed && p.prior !== undefined ? p.prior : alt;
    const r = c === undefined ? { why: [guessOf(p)], explore: false } : whyOf(p, s, c);
    if (p.task.notAfter !== undefined) r.why = [{ key: "said", w: 1 } as Reason, ...r.why].slice(0, 4);
    if (p.missed !== undefined) {
      r.why.unshift({ key: "missed", w: 1, vars: { time: when(p.missed, now).split(" ").pop()! } }); r.why = r.why.slice(0, 4); missed.push(p);
      const old = m.placed[p.id]; // the hour it was placed on did not work out
      if (old) update(m.arms[old.arm], old.x, -0.4);
      if (p.task.vec) { m.hist.push({ vec: Array.from(p.task.vec), hour: hourOf(old?.start ?? p.missed), r: -1, at: now, miss: true }); m.hist = m.hist.slice(-300); }
    }
    const known = m.placed[p.id];
    if (!changed && known) { if (!p.lock) Object.assign(known, { why: r.why, alt, explore: r.explore }); continue; } // a held piece keeps the reasons it was placed for
    const x = xz(p, s, ends), arm = Math.floor(hourOf(s)), from = p.missed ?? p.prior ?? (opts.later === p.id ? p.task.start : undefined);
    diff.placed.push({ id: p.id, start: s, end: s + dur(p), policy: "linucb", arm, x, alt, why: r.why, explore: r.explore, ...(from !== undefined && from !== s ? { from } : {}) });
    m.placed[p.id] = { arm, x, start: s, policy: "linucb", at: now, why: r.why, alt, explore: r.explore };
    if (p.prior === undefined && dueOf(p.task) !== undefined) m.slip[p.task.kind].placed += 1;
    if (from !== undefined && from !== s) diff.displaced.push({ id: p.id, from, to: s });
    if (changed) {
      const th = prep.theta[arm];
      const ai = x.slice(I_AFTER, I_AFTER + 5).indexOf(1);
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
    vars: { title: top.piece.task.title, kind: KIND_VI[top.piece.task.kind], prev: KIND_VI[top.prev ?? ""] ?? "", time: when(top.start, now) },
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
  return { diff, model: m };
}

const kernel = (a: number, h: number) => Math.exp(-(cdist(a, h) ** 2) / (2 * 0.75 ** 2));

const FIRST_MOVE_BOOST = 1;
const FIRST_MOVE_TAU = 30;
// Only the first drag or later of a placement is an impulse; ageMin is minutes since placement.
const boost = (pl: { at?: number; moved?: boolean }, at: number) =>
  pl.moved || pl.at === undefined ? 1 : 1 + FIRST_MOVE_BOOST * Math.exp(-Math.max(0, at - pl.at) / MIN / FIRST_MOVE_TAU);
const clampR = (r: number) => Math.max(-2, Math.min(0, r));

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
    if (Number.isFinite(from) && Number.isFinite(to)) reward = clampR(-Math.min(1, Math.abs(to - from) / MIN / 240) * boost(pl, ev.at));
  }
  return reward === undefined ? undefined : { arm: pl.arm, x: pl.x, policy: pl.policy ?? "linucb", reward };
}

/** `own`: the caller already holds its own copy of `model` (a loop of learns), so it is updated in place instead of copied again. */
export function learn(model: Model, ev: TaskEvent, task: Task, own = false): Model {
  const m = own ? model : clone(model);
  decay(m, ev.at);
  const pl = m.placed[task.id];
  const hist = (start: number, r: number) => {
    if (task.vec) m.hist.push({ vec: Array.from(task.vec), hour: hourOf(start), r, at: ev.at });
    m.hist = m.hist.slice(-300);
  };
  const start = pl?.start ?? task.start;
  switch (ev.type) {
    case "kept":
      if (pl) { update(m.arms[pl.arm], pl.x, R.kept); }
      break;
    case "done": {
      // A tick far from the block says little about the planned hour: early credits the hour it happened, late credits none.
      const end = task.end ?? (start ?? 0) + HOUR, late = start !== undefined && ev.at > end + HOUR;
      const early = start !== undefined && ev.at < start - HOUR, arm = early ? Math.floor(hourOf(ev.at)) : pl?.arm;
      if (pl && !late && arm !== undefined) update(m.arms[arm], pl.x, R.done);
      if (start !== undefined) {
        if (!late) {
          hist(early ? ev.at : start, 1);
          m.doneHours.push({ hour: hourOf(ev.at), at: ev.at });
          m.doneHours = m.doneHours.slice(-200);
        }
        if (task.vec && task.start !== undefined && task.end !== undefined && ev.at >= task.start && ev.at <= task.end + 30 * MIN) {
          m.efforts.push({ vec: Array.from(task.vec), minutes: Math.min(240, Math.max(15, (ev.at - task.start) / MIN)), at: ev.at });
          m.efforts = m.efforts.slice(-200);
        }
      }
      break;
    }
    case "later":
      m.slip[task.kind].later += 1;
      if (pl) {
        const r = clampR(R.later * boost(pl, ev.at));
        update(m.arms[pl.arm], pl.x, r);
        pl.moved = true;
      }
      if (start !== undefined) hist(start, -1);
      break;
    case "delete":
      if (start !== undefined && ev.at < start) {
        if (pl) { update(m.arms[pl.arm], pl.x, R.delete); }
        hist(start, -1);
      }
      break;
    case "drag": {
      const from = Number(ev.data?.fromStart ?? start), to = Number(ev.data?.toStart);
      if (!Number.isFinite(from) || !Number.isFinite(to) || !pl) break;
      const r = clampR(-Math.min(1, Math.abs(to - from) / MIN / 240) * boost(pl, ev.at));
      const h = hourOf(from);
      // Away from `from` is a penalty; where they dragged it to is the mirror reward (x is the placed context, close enough at the new hour).
      const x = pl.x.map((v, i) => (i ? v : 0)); // no intercept: one drag teaches this kind, not every kind
      for (let a = 0; a < m.arms.length; a++) { update(m.arms[a], x, r, kernel(a + 0.5, h)); update(m.arms[a], x, -r, kernel(a + 0.5, hourOf(to))); }
      hist(from, -1);
      m.placed[task.id] = { ...pl, start: to, arm: Math.floor(hourOf(to)), moved: true };
      break;
    }
    default:
  }
  return m;
}

// A free gap starting within 60 min gets the best-fitting unplaced task.
export function suggest(tasks: Task[], busy: Busy[], model: Model, now: number): { task: Task; start: number; end: number } | undefined {
  const fixed = tasks.filter((t) => !t.doneAt && !t.deletedAt && t.start !== undefined && t.end !== undefined)
    .map((t) => ({ start: t.start!, end: t.end! }));
  const g = gap([...busy, ...fixed], now);
  if (!g) return undefined;
  const room = (g.end - g.start) / MIN;
  const peak = peakHour(model, now);
  let best: { task: Task; v: number } | undefined;
  for (const t of tasks) {
    if (t.doneAt || t.deletedAt || t.fixed || t.parentId || (t.notBefore ?? 0) > g.start) continue;
    const e = round15(effort(t, model));
    if (e > room) continue;
    const nb = neighbors(t, model, now);
    const x = features(t, g.start, { fixedH: () => 0, peak, nb, ends: [] });
    const v = e / room + 0.5 * x[I_ENERGY] + 0.5 * x[I_SIM] + x[3];
    if (!best || v > best.v) best = { task: t, v };
  }
  return best && { task: best.task, start: g.start, end: g.start + round15(effort(best.task, model)) * MIN };
}

export { newModel };
