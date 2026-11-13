import type { Kind } from "../lib/types";
import { DAY, HOUR, MIN, dayStart } from "./features";
import { type Piece, dur, startValue } from "./value";

export interface Busy { start: number; end: number }
export type End = { kind: Kind; end: number };
export type Util = (p: Piece, start: number, ends: End[]) => number;
export interface Env { busy: Busy[]; fixedEnds: End[]; now: number; util: Util }
export interface Solved { starts: Map<string, number>; score: number; greedyScore: number }

const SLOT = 30 * MIN;
const HALO = 60 * MIN;
const W_GAP = 0.1;
const SPREAD = 1;
const ITERS = 200;
export const EJECT_CAP = 12;

const ceil = (t: number) => Math.ceil(t / SLOT) * SLOT;
const ov = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function fixedHours(busy: Busy[], day: number): number {
  let ms = 0;
  for (const b of busy) ms += ov(b.start, b.end, day, day + DAY);
  return ms / HOUR;
}

interface Iv { start: number; end: number }

// Load hinges, count penalty, halo, and overlap for one day of flexible items.
function dayCost(env: Env, day: number, items: Iv[]): number {
  if (!items.length) return 0;
  const N = items.length;
  const L = fixedHours(env.busy, day) + items.reduce((s, i) => s + (i.end - i.start), 0) / HOUR;
  const load = 0.3 * Math.max(0, L - 4) + 1.0 * Math.max(0, L - 6);
  const count = N > 2 ? 0.5 * (2 ** (N - 2) - 1) : 0;
  let halo = 0, over = 0;
  for (let i = 0; i < N; i++) {
    const a = items[i];
    for (const b of env.busy) {
      const o = ov(a.start, a.end, b.start, b.end);
      if (o) over += 1000 * (o / HOUR);
      else if (ov(a.start - HALO, a.end + HALO, b.start, b.end)) halo += W_GAP * ((a.end - a.start) / SLOT);
    }
    for (let j = i + 1; j < N; j++) over += 500 * (ov(a.start, a.end, items[j].start, items[j].end) / HOUR);
  }
  return SPREAD * (load + count) + halo + over;
}

export function cells(p: Piece, now: number): number[] {
  const t = p.task;
  const lo = ceil(Math.max(now, t.notBefore ?? now));
  let hi = t.deadline === undefined ? now + 7 * DAY : Math.min(t.deadline + 3 * DAY, now + 120 * DAY);
  if (hi <= lo) hi = lo + 3 * DAY;
  const out: number[] = [];
  for (let c = lo; c < hi; c += SLOT) out.push(c);
  return out;
}

type Buckets = Map<number, Iv[]>;
const add = (b: Buckets, s: number, e: number) => {
  const d = dayStart(s);
  (b.get(d) ?? b.set(d, []).get(d)!).push({ start: s, end: e });
};

export function solve(pieces: Piece[], env: Env, seed = 1): Solved {
  const { now } = env;
  const cand = new Map(pieces.map((p) => [p.id, cells(p, now)]));
  const starts = new Map<string, number>();
  const byId = new Map(pieces.map((p) => [p.id, p]));

  const build = (skip?: string) => {
    const ends: End[] = [...env.fixedEnds];
    const bk: Buckets = new Map();
    for (const [id, s] of starts) {
      if (id === skip) continue;
      const p = byId.get(id)!;
      ends.push({ kind: p.task.kind, end: s + dur(p) });
      add(bk, s, s + dur(p));
    }
    return { ends, bk };
  };
  const best = (p: Piece, ends: End[], bk: Buckets) => {
    let top: { c: number; v: number } | undefined;
    for (const c of cand.get(p.id)!) {
      const day = dayStart(c);
      const cur = bk.get(day) ?? [];
      const marg = dayCost(env, day, [...cur, { start: c, end: c + dur(p) }]) - dayCost(env, day, cur);
      const v = startValue(p, c, now, env.util(p, c, ends)) - marg;
      if (!top || v > top.v) top = { c, v };
    }
    return top!;
  };
  const score = () => {
    const { ends, bk } = build();
    let s = 0;
    for (const [id, st] of starts) { const p = byId.get(id)!; s += startValue(p, st, now, env.util(p, st, ends)); }
    for (const [day, items] of bk) s -= dayCost(env, day, items);
    return s;
  };

  const order = [...pieces].sort((a, b) =>
    (a.task.deadline ?? Infinity) - (b.task.deadline ?? Infinity) || (a.id < b.id ? -1 : 1));
  for (const p of order) { const { ends, bk } = build(); starts.set(p.id, best(p, ends, bk).c); }
  const greedyScore = score();

  let rng = seed >>> 0;
  const rand = () => { rng = (rng + 0x6d2b79f5) >>> 0; let t = Math.imul(rng ^ (rng >>> 15), 1 | rng); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let cur = greedyScore;
  const ids = pieces.map((p) => p.id);
  for (let it = 0; it < ITERS && ids.length; it++) {
    const i = ids[Math.floor(rand() * ids.length)];
    const old = new Map(starts);
    if (rand() < 0.5 && ids.length > 1) {
      const j = ids[Math.floor(rand() * ids.length)];
      if (i === j) continue;
      const a = starts.get(i)!;
      starts.set(i, starts.get(j)!); starts.set(j, a);
    } else {
      const { ends, bk } = build(i);
      starts.set(i, best(byId.get(i)!, ends, bk).c);
    }
    const s = score();
    if (s > cur + 1e-9) cur = s;
    else for (const [k, v] of old) starts.set(k, v);
  }

  // Cap displaced tasks: revert the smallest moves to their old slot when it is free.
  const moved = pieces.filter((p) => p.prior !== undefined && starts.get(p.id) !== p.prior)
    .sort((a, b) => Math.abs(starts.get(a.id)! - a.prior!) - Math.abs(starts.get(b.id)! - b.prior!));
  let extra = moved.length - EJECT_CAP;
  for (const p of moved) {
    if (extra <= 0) break;
    const { bk } = build(p.id);
    const day = dayStart(p.prior!);
    const items = [...(bk.get(day) ?? []), { start: p.prior!, end: p.prior! + dur(p) }];
    const free = dayCost(env, day, items) - dayCost(env, day, bk.get(day) ?? []) < 500;
    if (free) { starts.set(p.id, p.prior!); extra--; }
  }
  return { starts, score: score(), greedyScore };
}

// Best-fitting flexible task for a free gap of 30 min or more that starts within 60 min.
export function gap(busy: Busy[], now: number): Busy | undefined {
  const from = ceil(now);
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  let t = from;
  for (const b of sorted) {
    if (b.end <= t) continue;
    if (b.start - t >= SLOT) break;
    t = Math.max(t, b.end);
  }
  if (t - now > HALO) return undefined;
  const next = sorted.find((b) => b.start >= t)?.start ?? t + 4 * HOUR;
  return next - t >= SLOT ? { start: t, end: Math.min(next, t + 4 * HOUR) } : undefined;
}
