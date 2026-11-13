import type { Diff, Reason, ReasonKey, Step, Task, TaskEvent, TaskType, Warn } from "../lib/types";
import { DAY, HOUR, I_AFTER, I_ENERGY, I_SIM, KINDS, MIN, type FeatCtx, cdist, dayStart, features, hourOf } from "./features";
import { effort, neighbors, peakHour, slipOf } from "./habits";
import { ALPHA, D, type Primed, decayArms, prepare, primeBatch, ucb, ucbAt, update } from "./linucb";
import { type Model, newModel } from "./model";
import { type Busy, type End, type Util, SLOT, cells, fixedHours, gap, solve } from "./place";
import { day, when } from "../lib/when";
import { split } from "./split";
import { type Piece, bell, dur, lateH, moveCost, startValue } from "./value";

export interface Opts { later?: string; hourOnly?: boolean }

const HALF = 21 * DAY;
type Titled = Busy & { title?: string };
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const typeOf = (t: Task): TaskType => t.fixed ?? (t.deadline !== undefined ? "assignment" : "plan");
const round15 = (m: number) => Math.max(30, Math.ceil(m / 15) * 15);

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
    const inProgress = t.start !== undefined && t.end !== undefined && t.start <= now && now < t.end;
    if ((t.fixed || t.pinned || inProgress) && t.start !== undefined && t.end !== undefined) {
      allBusy.push({ start: t.start, end: t.end, title: t.title });
      fixedEnds.push({ kind: t.kind, end: t.end });
    } else if (!t.fixed) flex.push(t);
  }
  allBusy.sort((a, b) => a.start - b.start);

  const kids = new Map<string, Task[]>();
  for (const t of flex) if (t.parentId) (kids.get(t.parentId) ?? kids.set(t.parentId, []).get(t.parentId)!).push(t);
  const pieces: Piece[] = [];
  const splits: Diff["split"] = [];
  const mk = (task: Task, eff: number, k: number, n: number, prior?: number, missed?: number): Piece => ({
    id: task.id, task, effort: eff, k, n, slip: task.deadline === undefined ? 0 : slipOf(m, task.kind),
    prior: prior !== undefined && prior >= now ? prior : undefined, missed,
  });
  const lost = (t: Task) => (t.start !== undefined && t.end !== undefined && t.end <= now ? t.start : undefined);
  for (const t of flex) {
    if (t.parentId) continue;
    const sibs = kids.get(t.id);
    if (sibs) {
      sibs.sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((c, i) => pieces.push(mk(c, round15(c.effort), i + 1, sibs.length, c.start, lost(c))));
      continue;
    }
    const eff = round15(effort(t, m));
    const cap = t.maxSitting ?? 90;
    if (eff > cap) {
      const sizes = split(eff, cap);
      const ids = sizes.map((_, i) => `${t.id}#${i + 1}`);
      sizes.forEach((s, i) => pieces.push(mk({ ...t, id: ids[i], parentId: t.id, effort: s, start: undefined, end: undefined }, s, i + 1, sizes.length, undefined, i ? undefined : lost(t))));
      splits.push({ parentId: t.id, ids });
    } else pieces.push(mk(t, eff, 1, 1, t.start, lost(t)));
  }
  // Orphan sittings whose parent is gone or done.
  for (const t of flex) if (t.parentId && !flex.some((p) => p.id === t.parentId && !p.parentId) && !pieces.some((p) => p.id === t.id)) {
    pieces.push(mk(t, round15(t.effort), 1, 1, t.start, lost(t)));
  }

  const peak = peakHour(m, now);
  const nbs = new Map(pieces.map((p) => [p.id, neighbors(p.task, m, now)]));
  const fixedH = (d: number) => fixedHours(allBusy, d);
  const ctx = (p: Piece, ends: End[]): FeatCtx => ({ fixedH, peak, nb: nbs.get(p.id)!, ends });
  const xOf = (p: Piece, s: number, ends: End[]) => features(p.task, s, ctx(p, ends));
  const prep = prepare(m.arms);
  const rules = m.rules ?? [];
  const hits = (p: Piece, s: number) => rules.filter((r) => {
    if (r.kinds.length && !r.kinds.includes(p.task.kind)) return false;
    if (r.days.length && !r.days.includes(new Date(s).getDay())) return false;
    const a = (s - dayStart(s)) / MIN;
    return a < r.to && a + p.effort > r.from;
  });
  const used = new Set<string>();
  const BLOCK = -1000; // like `later`: only when nothing else fits
  const spanLater = (p: Piece, s: number) =>
    opts.later === p.id && p.task.start !== undefined && s < p.task.start + dur(p) && s + dur(p) > p.task.start;
  // shortcut: exploring is not capped to once a day, add the cap when users see too many "thử giờ mới" in one day.
  const alphaOf = (p: Piece) => (p.task.deadline === undefined ? ALPHA : 0);

  // Task x Cell x Feature, built once: every feature but "after" is fixed per (piece, cell). "After" depends on
  // what the solver has placed, so it stays a one-hot column patched in per call (ucbAt, O(1) per cell).
  interface Batch { lo: number; n: number; prim: Primed; masked: Uint8Array }
  const batches = new Map<string, Batch>();
  for (const p of pieces) {
    const cs = cells(p, now), n = cs.length, c0 = ctx(p, []);
    const X = new Float64Array(n * D), arm = new Uint8Array(n), masked = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      if (opts.hourOnly) X[i * D] = 1; else X.set(features(p.task, c, c0), i * D);
      arm[i] = Math.floor(hourOf(c));
      const h = hits(p, c);
      for (const r of h) used.add(r.id);
      masked[i] = h.length || spanLater(p, c) ? 1 : 0;
    }
    batches.set(p.id, { lo: cs[0], n, prim: primeBatch(prep, X, arm, I_AFTER, 5), masked });
  }
  const gridAt = (b: Batch, s: number) => { const i = (s - b.lo) / SLOT; return Number.isInteger(i) && i >= 0 && i < b.n ? i : -1; };
  // Kind of the latest end in the hour before each cell, as features() picks it: O(ends), not O(cells * ends).
  const afterAll = (b: Batch, ends: End[]) => {
    const j = new Int8Array(b.n).fill(-1), at = new Float64Array(b.n).fill(-Infinity);
    if (opts.hourOnly) return j;
    for (const e of ends) {
      const hi = Math.min(b.n - 1, Math.floor((e.end + HOUR - b.lo) / SLOT));
      for (let i = Math.max(0, Math.ceil((e.end - b.lo) / SLOT)); i <= hi; i++) if (e.end > at[i]) { at[i] = e.end; j[i] = KINDS.indexOf(e.kind); }
    }
    return j;
  };
  const linAll = (p: Piece, ends: End[]) => {
    const b = batches.get(p.id)!, j = afterAll(b, ends), out = new Float64Array(b.n), a = alphaOf(p);
    for (let i = 0; i < b.n; i++) out[i] = b.masked[i] ? BLOCK : ucbAt(prep, b.prim, i, j[i], a);
    return out;
  };
  const linUtil: Util = (p, s, ends) => {
    if (spanLater(p, s) || hits(p, s).length) return BLOCK;
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
  const solved = solve(pieces, { busy: allBusy, fixedEnds, now, util: linUtil, utilAll: linAll }, (Math.floor(now / MIN) >>> 0));
  const at = (p: Piece) => solved.starts.get(p.id)!;

  // Second-best start in solver terms: at least 1 h from the pick, clear of busy time.
  const altOf = (p: Piece, start: number) => {
    let top: { c: number; v: number } | undefined;
    const cs = cells(p, now), u = linAll(p, fixedEnds);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (Math.abs(c - start) < HOUR || allBusy.some((b) => c < b.end && c + dur(p) > b.start)) continue;
      const v = startValue(p, c, now, u[i]);
      if (!top || v > top.v) top = { c, v };
    }
    return top?.c;
  };
  const ends: End[] = [...fixedEnds, ...pieces.map((p) => ({ kind: p.task.kind, end: at(p) + dur(p) }))];

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
  const whyOf = (p: Piece, s: number, c: number): { why: Reason[]; explore: boolean } => {
    const xs = xz(p, s, ends), xc = xz(p, c, ends), as = Math.floor(hourOf(s)), ac = Math.floor(hourOf(c));
    const ths = prep.theta[as], thc = prep.theta[ac], a = alphaOf(p);
    const raw: Reason[] = [];
    const put = (key: ReasonKey, w: number, vars?: Reason["vars"]) => { if (w) raw.push({ key, w, vars }); };
    for (const [key, k0, k1] of GROUPS) {
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
    put("pace", bell(p, now, s) - bell(p, now, c), { k: p.k, n: p.n });
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
    return { why: out, explore };
  };

  const diff: Diff = { placed: [], displaced: [], split: splits };
  const missed: Piece[] = [], fresh: Piece[] = [];
  let top: { score: number; piece: Piece; start: number; why: keyof typeof tpl; prev?: string } | undefined;
  for (const p of pieces) {
    const s = at(p), changed = p.prior !== s, alt = altOf(p, s);
    const c = changed && p.prior !== undefined ? p.prior : alt;
    const r = c === undefined ? { why: [] as Reason[], explore: false } : whyOf(p, s, c);
    if (p.missed !== undefined) { r.why.unshift({ key: "missed", w: 1, vars: { time: when(p.missed, now).slice(-5) } }); r.why = r.why.slice(0, 4); missed.push(p); }
    const known = m.placed[p.id];
    if (!changed && known) { Object.assign(known, { why: r.why, alt, explore: r.explore }); continue; }
    const x = xz(p, s, ends), arm = Math.floor(hourOf(s)), from = p.missed ?? p.prior;
    diff.placed.push({ id: p.id, start: s, end: s + dur(p), policy: "linucb", arm, x, alt, why: r.why, explore: r.explore, ...(from !== undefined && from !== s ? { from } : {}) });
    m.placed[p.id] = { arm, x, start: s, policy: "linucb", at: now, why: r.why, alt, explore: r.explore };
    if (p.prior === undefined && p.task.deadline !== undefined) m.slip[p.task.kind].placed += 1;
    if (from !== undefined && from !== s) diff.displaced.push({ id: p.id, from, to: s });
    if (p.prior === undefined && p.missed === undefined) fresh.push(p);
    if (changed) {
      const th = prep.theta[arm];
      const ai = x.slice(I_AFTER, I_AFTER + 5).indexOf(1);
      const cands: [keyof typeof tpl, number, string?][] = [
        ["after", ai >= 0 ? th[I_AFTER + ai] : 0, ai >= 0 ? KINDS[ai] : undefined],
        ["similar", th[I_SIM] * x[I_SIM]],
        ["slip", 0.3 * p.slip],
      ];
      for (const [why, score, prev] of cands) if (score > 0.02 && (!top || score > top.score)) top = { score, piece: p, start: s, why, prev };
    }
  }
  for (const [id, v] of Object.entries(m.placed)) if (v.start < now - 30 * DAY) delete m.placed[id];
  if (top) diff.insight = {
    template: tpl[top.why][0], sub: tpl[top.why][1],
    vars: { title: top.piece.task.title, kind: KIND_VI[top.piece.task.kind], prev: KIND_VI[top.prev ?? ""] ?? "", time: when(top.start, now) },
  };

  const byId = new Map(pieces.map((p) => [p.id, p]));
  const title = (id: string) => byId.get(id)?.task.title ?? id;
  const steps: Step[] = [{ key: "read", vars: { what: "tuần này" } }];
  for (const e of solved.log) {
    if (e.kind === "day" && e.day !== undefined) steps.push({ key: "lighten", vars: { day: day(e.day, now), h: Math.round(fixedHours(allBusy, e.day) + pieces.reduce((n, q) => (dayStart(at(q)) === e.day ? n + dur(q) / HOUR : n), 0)) } });
    else if (e.kind === "swap" || e.kind === "chain") steps.push({ key: e.kind, vars: { a: title(e.ids[0]), b: title(e.ids[1]) } });
    else if (e.kind === "place" && byId.has(e.ids[0])) steps.push({ key: "place", vars: { title: title(e.ids[0]), time: when(at(byId.get(e.ids[0])!), now) } });
  }
  if (!solved.log.length) for (const p of fresh.slice(0, 3)) steps.push({ key: "place", vars: { title: p.task.title, time: when(at(p), now) } });
  for (const id of used) steps.push({ key: "rule", vars: { text: rules.find((r) => r.id === id)!.text } });
  for (const p of missed) steps.push({ key: "missed", vars: { title: p.task.title } });
  diff.steps = steps.slice(0, 6);

  // A deadline task with a piece past its deadline: how much is missing, and which other task could give way.
  const warn: Warn[] = [];
  const pid = (p: Piece) => p.task.parentId ?? p.task.id;
  for (const id of new Set(pieces.filter((p) => p.task.deadline !== undefined && at(p) + dur(p) > p.task.deadline).map(pid))) {
    const mine = pieces.filter((p) => pid(p) === id), dl = mine[0].task.deadline!;
    const others = pieces.filter((p) => pid(p) !== id);
    let free = 0;
    for (let c = Math.ceil(now / SLOT) * SLOT; c + SLOT <= dl; c += SLOT) {
      const h = hourOf(c);
      if (h >= 7 && h < 23 && !allBusy.some((b) => c < b.end && c + SLOT > b.start) && !others.some((q) => c < at(q) + dur(q) && c + SLOT > at(q))) free += SLOT / MIN;
    }
    const fixes = new Map<string, { id: string; title: string; start: number; len: number }>();
    for (const q of others) if ((q.task.deadline === undefined || q.task.deadline > dl) && at(q) < dl) fixes.set(pid(q), { id: pid(q), title: q.task.title, start: at(q), len: Math.max(fixes.get(pid(q))?.len ?? 0, q.effort) });
    warn.push({ id, title: mine[0].task.title, deadline: dl, need: mine.reduce((n, q) => n + q.effort, 0), free, fixes: [...fixes.values()].sort((x, y) => y.len - x.len).slice(0, 2).map(({ len: _, ...f }) => f) });
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

export function learn(model: Model, ev: TaskEvent, task: Task): Model {
  const m = clone(model);
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
    case "done":
      if (pl) { update(m.arms[pl.arm], pl.x, R.done); }
      if (start !== undefined) {
        hist(start, 1);
        m.doneHours.push({ hour: hourOf(ev.at), at: ev.at });
        m.doneHours = m.doneHours.slice(-200);
        if (task.vec && task.start !== undefined) {
          m.efforts.push({ vec: Array.from(task.vec), minutes: Math.min(240, Math.max(15, (ev.at - task.start) / MIN)), at: ev.at });
          m.efforts = m.efforts.slice(-200);
        }
      }
      break;
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
      for (let a = 0; a < m.arms.length; a++) { update(m.arms[a], pl.x, r, kernel(a + 0.5, h)); update(m.arms[a], pl.x, -r, kernel(a + 0.5, hourOf(to))); }
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
  const fixed = tasks.filter((t) => !t.doneAt && !t.deletedAt && t.fixed && t.start !== undefined && t.end !== undefined)
    .map((t) => ({ start: t.start!, end: t.end! }));
  const g = gap([...busy, ...fixed], now);
  if (!g) return undefined;
  const room = (g.end - g.start) / MIN;
  const peak = peakHour(model, now);
  let best: { task: Task; v: number } | undefined;
  for (const t of tasks) {
    if (t.doneAt || t.deletedAt || t.fixed || t.parentId) continue;
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
