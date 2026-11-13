import type { Diff, Placement, Policy, Task, TaskEvent, TaskType } from "../lib/types";
import { DAY, HOUR, I_AFTER, I_ENERGY, I_SIM, KINDS, MIN, type FeatCtx, cdist, cellIdx, dayStart, features, hourOf } from "./features";
import { effort, neighbors, peakHour, slipOf } from "./habits";
import { ALPHA, decayArms, prepare, ucb, update } from "./linucb";
import { type Model, newModel } from "./model";
import { type Busy, type End, type Util, cells, fixedHours, gap, solve } from "./place";
import { split } from "./split";
import { type Piece, dur } from "./value";

export interface Opts { later?: string; hourOnly?: boolean; rng?: (id: string) => number }

const HALF = 21 * DAY;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const typeOf = (t: Task): TaskType => t.fixed ?? (t.deadline !== undefined ? "assignment" : "plan");
const round15 = (m: number) => Math.max(30, Math.ceil(m / 15) * 15);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function decay(m: Model, now: number) {
  const dt = now - m.at;
  if (dt <= 0) return;
  decayArms(m.arms, dt);
  const g = 0.5 ** (dt / HALF);
  for (const k of KINDS) { m.slip[k].later *= g; m.slip[k].placed *= g; }
  m.matrix = m.matrix.map((v) => v * g);
  m.at = now;
}

const tpl = {
  after: "You do {prev} before {kind}, so {title} moved to {time}",
  similar: "{title} matches when similar tasks got done, so it moved to {time}",
  slip: "You tend to push {kind} later, so {title} moved earlier to {time}",
};
const fmt = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export function plan(tasks: Task[], busy: Busy[], model: Model, now: number, opts: Opts = {}): { diff: Diff; model: Model } {
  const m = clone(model);
  decay(m, now);
  const live = tasks.filter((t) => !t.doneAt && !t.deletedAt);
  const allBusy: Busy[] = [...busy];
  const fixedEnds: End[] = [];
  const flex: Task[] = [];
  for (const t of live) {
    const inProgress = t.start !== undefined && t.end !== undefined && t.start <= now && now < t.end;
    if ((t.fixed || inProgress) && t.start !== undefined && t.end !== undefined) {
      allBusy.push({ start: t.start, end: t.end });
      fixedEnds.push({ kind: t.kind, end: t.end });
    } else if (!t.fixed) flex.push(t);
  }
  allBusy.sort((a, b) => a.start - b.start);

  const kids = new Map<string, Task[]>();
  for (const t of flex) if (t.parentId) (kids.get(t.parentId) ?? kids.set(t.parentId, []).get(t.parentId)!).push(t);
  const pieces: Piece[] = [];
  const splits: Diff["split"] = [];
  const mk = (task: Task, eff: number, k: number, n: number, prior?: number): Piece => ({
    id: task.id, task, effort: eff, k, n, slip: task.deadline === undefined ? 0 : slipOf(m, task.kind),
    prior: prior !== undefined && prior >= now ? prior : undefined,
  });
  for (const t of flex) {
    if (t.parentId) continue;
    const sibs = kids.get(t.id);
    if (sibs) {
      sibs.sort((a, b) => (a.id < b.id ? -1 : 1)).forEach((c, i) => pieces.push(mk(c, round15(c.effort), i + 1, sibs.length, c.start)));
      continue;
    }
    const eff = round15(effort(t, m));
    const cap = t.maxSitting ?? 90;
    if (eff > cap) {
      const sizes = split(eff, cap);
      const ids = sizes.map((_, i) => `${t.id}#${i + 1}`);
      sizes.forEach((s, i) => pieces.push(mk({ ...t, id: ids[i], parentId: t.id, effort: s, start: undefined, end: undefined }, s, i + 1, sizes.length)));
      splits.push({ parentId: t.id, ids });
    } else pieces.push(mk(t, eff, 1, 1, t.start));
  }
  // Orphan sittings whose parent is gone or done.
  for (const t of flex) if (t.parentId && !flex.some((p) => p.id === t.parentId && !p.parentId) && !pieces.some((p) => p.id === t.id)) {
    pieces.push(mk(t, round15(t.effort), 1, 1, t.start));
  }

  const peak = peakHour(m, now);
  const nbs = new Map(pieces.map((p) => [p.id, neighbors(p.task, m, now)]));
  const fixedH = (d: number) => fixedHours(allBusy, d);
  const ctx = (p: Piece, ends: End[]): FeatCtx => ({ fixedH, peak, nb: nbs.get(p.id)!, ends });
  const xOf = (p: Piece, s: number, ends: End[]) => features(p.task, s, ctx(p, ends));
  const prep = prepare(m.arms);
  const spanLater = (p: Piece, s: number) =>
    opts.later === p.id && p.task.start !== undefined && s < p.task.start + dur(p) && s + dur(p) > p.task.start;

  const linUtil: Util = (p, s, ends) => {
    if (spanLater(p, s)) return -1;
    let x = xOf(p, s, ends);
    if (opts.hourOnly) x = x.map((v, i) => (i === 0 ? 1 : 0));
    return ucb(prep, Math.floor(hourOf(s)), x, ALPHA);
  };
  const heurUtil: Util = (p, s, ends) => {
    if (spanLater(p, s)) return -1;
    const x = xOf(p, s, ends);
    return 0.5 * x[I_ENERGY] + 0.5 * x[I_SIM] + m.matrix[cellIdx(s)];
  };
  const seed = Math.floor(now / MIN) >>> 0;
  const base = { busy: allBusy, fixedEnds, now };
  const A = solve(pieces, { ...base, util: linUtil }, seed);
  const B = solve(pieces, { ...base, util: heurUtil }, seed);

  const rng = opts.rng ?? ((id: string) => hash(`${id}@${now}`));
  const final = new Map<string, { start: number; policy: Policy; other: number }>();
  for (const p of pieces) {
    const a = A.starts.get(p.id)!, b = B.starts.get(p.id)!;
    if (a === b) { final.set(p.id, { start: a, policy: "tie", other: b }); continue; }
    const useLin = rng(p.id) < m.mix;
    final.set(p.id, useLin ? { start: a, policy: "linucb", other: b } : { start: b, policy: "heuristic", other: a });
  }

  // Second-best start: best util at least 1 h from the pick, clear of busy time.
  const altOf = (p: Piece, start: number) => {
    let top: { c: number; v: number } | undefined;
    for (const c of cells(p, now)) {
      if (Math.abs(c - start) < HOUR || allBusy.some((b) => c < b.end && c + dur(p) > b.start)) continue;
      const v = linUtil(p, c, fixedEnds);
      if (!top || v > top.v) top = { c, v };
    }
    return top?.c;
  };
  const ends: End[] = [...fixedEnds, ...pieces.map((p) => ({ kind: p.task.kind, end: final.get(p.id)!.start + dur(p) }))];
  const diff: Diff = { placed: [], displaced: [], split: splits };
  let top: { score: number; piece: Piece; start: number; why: keyof typeof tpl; prev?: string } | undefined;
  for (const p of pieces) {
    const f = final.get(p.id)!;
    const changed = p.prior !== f.start;
    if (!changed && m.placed[p.id]) continue;
    let x = xOf(p, f.start, ends);
    if (opts.hourOnly) x = x.map((v, i) => (i === 0 ? 1 : 0));
    const arm = Math.floor(hourOf(f.start));
    const pl: Placement = { id: p.id, start: f.start, end: f.start + dur(p), policy: f.policy, arm, x, otherStart: f.other, alt: f.other !== f.start ? f.other : altOf(p, f.start) };
    diff.placed.push(pl);
    m.placed[p.id] = { arm, x, start: f.start, otherStart: f.other, policy: f.policy, at: now };
    if (p.prior === undefined && p.task.deadline !== undefined) m.slip[p.task.kind].placed += 1;
    if (p.prior !== undefined && changed) diff.displaced.push({ id: p.id, from: p.prior, to: f.start });
    if (changed) {
      const th = prep.theta[arm];
      const ai = x.slice(I_AFTER, I_AFTER + 5).indexOf(1);
      const cands: [keyof typeof tpl, number, string?][] = [
        ["after", ai >= 0 ? th[I_AFTER + ai] : 0, ai >= 0 ? KINDS[ai] : undefined],
        ["similar", th[I_SIM] * x[I_SIM]],
        ["slip", 0.3 * p.slip],
      ];
      for (const [why, score, prev] of cands) if (score > 0.02 && (!top || score > top.score)) top = { score, piece: p, start: f.start, why, prev };
    }
  }
  for (const [id, v] of Object.entries(m.placed)) if (v.start < now - 30 * DAY) delete m.placed[id];
  if (top) diff.insight = {
    template: tpl[top.why],
    vars: { title: top.piece.task.title, kind: top.piece.task.kind, prev: top.prev ?? "", time: fmt(top.start) },
  };
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
  const nudge = (start: number, r: number, w = 1) => {
    const i = cellIdx(start);
    m.matrix[i] = Math.max(-1, Math.min(1, m.matrix[i] + 0.2 * w * r));
  };
  const hist = (start: number, r: number) => {
    if (task.vec) m.hist.push({ vec: Array.from(task.vec), hour: hourOf(start), r, at: ev.at });
    m.hist = m.hist.slice(-300);
  };
  const start = pl?.start ?? task.start;
  switch (ev.type) {
    case "kept":
      if (pl) { update(m.arms[pl.arm], pl.x, R.kept); nudge(pl.start, R.kept); }
      break;
    case "done":
      if (pl) { update(m.arms[pl.arm], pl.x, R.done); nudge(pl.start, R.done); }
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
        update(m.arms[pl.arm], pl.x, r); nudge(pl.start, r);
        pl.moved = true;
      }
      if (start !== undefined) hist(start, -1);
      break;
    case "delete":
      if (start !== undefined && ev.at < start) {
        if (pl) { update(m.arms[pl.arm], pl.x, R.delete); nudge(pl.start, R.delete); }
        hist(start, -1);
      }
      break;
    case "drag": {
      const from = Number(ev.data?.fromStart ?? start), to = Number(ev.data?.toStart);
      if (!Number.isFinite(from) || !Number.isFinite(to) || !pl) break;
      const r = clampR(-Math.min(1, Math.abs(to - from) / MIN / 240) * boost(pl, ev.at));
      const h = hourOf(from);
      for (let a = 0; a < m.arms.length; a++) update(m.arms[a], pl.x, r, kernel(a + 0.5, h));
      nudge(from, r);
      nudge(to, -r);
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
