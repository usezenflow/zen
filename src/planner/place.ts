import type { Kind } from "../lib/types";
import { DAY, HOUR, MIN, dayStart } from "./features";
import { type Piece, dur, startValue } from "./value";

export interface Busy { start: number; end: number }
export type End = { kind: Kind; end: number };
export type Util = (p: Piece, start: number, ends: End[]) => number;
// utilAll scores every cell of cells(p, now) at once, index-aligned; util stays for off-grid starts.
export interface Env { busy: Busy[]; fixedEnds: End[]; now: number; util: Util; utilAll?: (p: Piece, ends: End[]) => ArrayLike<number> }
/** An accepted search move that raised the best score; policy.ts turns these into narrated Steps. */
export interface LogEntry { kind: "place" | "swap" | "reinsert" | "chain" | "day"; ids: string[]; gain: number; day?: number }
export interface Solved { starts: Map<string, number>; score: number; greedyScore: number; log: LogEntry[] }

export const SLOT = 15 * MIN; // the grid start times are searched on (:00, :15, :30, :45), the shortest gap offered, the errand size
export const STEP = SLOT;
export const WAKE_FROM = 7 * 60, WAKE_TO = 22 * 60;
const HALO = 60 * MIN;
const TAIL = 6 * HOUR; // a block this far past a day's end can still halo an item that spills over midnight
const W_GAP = 0.05; // per SLOT: the same weight per hour as 0.1 per 30 min
const SPREAD = 1;
const T0 = 0.5, T1 = 0.005, CAP_MS = 40, LOG_CAP = 40;
const MISS = -1e6; // an unplaced piece: worse than any late placement, so a piece is left out only when no cell is free
export const EJECT_CAP = 12;

const ceil = (t: number) => Math.ceil(t / STEP) * STEP;
const ov = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function fixedHours(busy: Busy[], day: number): number {
  let ms = 0;
  for (const b of busy) ms += ov(b.start, b.end, day, day + DAY);
  return ms / HOUR;
}

interface Iv { start: number; end: number }

export function cells(p: Piece, now: number): number[] {
  if (p.lock) return [p.prior!];
  const t = p.task;
  const lo = ceil(Math.max(now, t.notBefore ?? now));
  let hi = t.deadline === undefined ? now + (p.soon ? 2 : 7) * DAY : Math.min(t.deadline + 3 * DAY, now + 120 * DAY);
  if (hi <= lo) hi = lo + 3 * DAY;
  // The whole task ends by notAfter; a window already gone is dropped, so the task takes the next free slot, not a forced one at `now`.
  if (t.notAfter !== undefined && t.notAfter - dur(p) + 1 > lo) hi = Math.min(hi, t.notAfter - dur(p) + 1);
  const out: number[] = [];
  for (let c = lo; c < hi; c += STEP) out.push(c);
  return out;
}

/** Flexible work starts from 7:00 and ends by 22:00; a clock the user said ("6 giờ sáng chạy bộ") stands, but nothing crosses midnight.
 *  Cells stay contiguous (index = offset / STEP), so the solver skips the rest. `day` is dayStart(c) when the caller has it. */
export function awake(p: Piece, c: number, day = dayStart(c)): boolean {
  const nb = p.task.notBefore, m = (c - day) / MIN;
  // said parts of the day ("sáng hoặc tối"): the whole sitting inside one of them
  const tods = p.task.tods;
  if (tods?.length && !tods.some(([a, b]) => m >= a && m + p.effort <= b)) return false;
  if (nb !== undefined && nb !== dayStart(nb) && c === ceil(nb)) return m + p.effort <= 24 * 60;
  return m >= WAKE_FROM && m + p.effort <= WAKE_TO;
}

type Mv = [number, number][]; // piece index -> new start (-1 = unplaced)

export function solve(pieces: Piece[], env: Env, seed = 1): Solved {
  const t0 = Date.now(), { now } = env, n = pieces.length;
  const cs = pieces.map((p) => cells(p, now));
  // dayStart is slow (Date): once per day of each piece's cells, which ascend
  const ds = cs.map((c) => {
    let d = -Infinity, nx = -Infinity;
    return c.map((x) => { if (x >= nx) { d = dayStart(x); nx = dayStart(d + 1.5 * DAY); } return d; });
  });
  const du = pieces.map(dur);
  const inDom = (i: number, s: number) => s >= cs[i][0] && s <= cs[i][cs[i].length - 1];

  const bz = new Map<number, Busy[]>(); // busy blocks that can touch a day, halo included
  for (const b of env.busy)
    for (let d = dayStart(b.start - HALO - TAIL); d <= b.end + HALO; d = dayStart(d + 1.5 * DAY)) (bz.get(d) ?? bz.set(d, []).get(d)!).push(b);
  const fx = new Map<number, number>();
  const fh = (day: number) => fx.get(day) ?? (fx.set(day, fixedHours(bz.get(day) ?? [], day)), fx.get(day)!);

  // Hard constraints: awake, clear of busy time and of every other placed piece. A piece never crosses midnight (awake), so its day's lists are enough.
  const clash = (ivs: Iv[], s: number, e: number) => ivs.some((b) => s < b.end && e > b.start);
  const fits = (i: number, s: number, x: number[]) => {
    const e = s + du[i];
    if (!awake(pieces[i], s) || clash(bz.get(dayStart(s)) ?? [], s, e)) return false;
    for (let j = 0; j < n; j++) if (j !== i && x[j] >= 0 && s < x[j] + du[j] && e > x[j]) return false;
    return true;
  };

  // Load hinges, count penalty, halo, and overlap for one day of flexible items; lax skips item-item overlap.
  const dayCost = (day: number, items: Iv[], lax = false) => {
    const N = items.length;
    if (!N) return 0;
    const bs = bz.get(day) ?? [];
    const L = fh(day) + items.reduce((s, i) => s + (i.end - i.start), 0) / HOUR;
    const load = 0.3 * Math.max(0, L - 4) + 1.0 * Math.max(0, L - 6);
    const big = items.filter((i) => i.end - i.start > SLOT).length; // errands of one slot or less do not count
    const count = big > 2 ? 0.5 * (2 ** (big - 2) - 1) : 0;
    let halo = 0, over = 0;
    for (let i = 0; i < N; i++) {
      const a = items[i];
      for (const b of bs) {
        const o = ov(a.start, a.end, b.start, b.end);
        if (o) over += 1000 * (o / HOUR);
        else if (ov(a.start - HALO, a.end + HALO, b.start, b.end)) halo += W_GAP * ((a.end - a.start) / SLOT);
      }
      if (!lax) for (let j = i + 1; j < N; j++) over += 500 * (ov(a.start, a.end, items[j].start, items[j].end) / HOUR);
    }
    return SPREAD * (load + count) + halo + over;
  };

  let S: number[] = Array(n).fill(-1); // current starts
  let V: number[] = Array(n).fill(0); // current startValue per piece
  const D = new Map<number, number>(); // current dayCost per day
  let cur = 0;

  const view = (mv: Mv, skip = -1) => { const x = S.slice(); for (const [i, s] of mv) x[i] = s; if (skip >= 0) x[skip] = -1; return x; };
  const endsOf = (x: number[]) => {
    const e: End[] = [...env.fixedEnds];
    for (let i = 0; i < n; i++) if (x[i] >= 0) e.push({ kind: pieces[i].task.kind, end: x[i] + du[i] });
    return e;
  };
  const listsOf = (x: number[]) => {
    const m = new Map<number, Iv[]>();
    for (let i = 0; i < n; i++) if (x[i] >= 0) { const d = dayStart(x[i]); (m.get(d) ?? m.set(d, []).get(d)!).push({ start: x[i], end: x[i] + du[i] }); }
    return m;
  };

  // Best cell for piece i with the moves in mv applied and i itself lifted out.
  const best = (i: number, mv: Mv, lax = false) => {
    const x = view(mv, i), bk = listsOf(x), ends = endsOf(x), p = pieces[i], u = env.utilAll?.(p, ends);
    const base = new Map<number, number>();
    let top = { c: -1, v: -Infinity }; // -1: nowhere fits
    for (let k = 0; k < cs[i].length; k++) {
      const c = cs[i][k], day = ds[i][k], items = bk.get(day) ?? [], e = c + du[i];
      if (!awake(p, c, day) || clash(bz.get(day) ?? [], c, e) || (!lax && clash(items, c, e))) continue;
      let b0 = base.get(day);
      if (b0 === undefined) base.set(day, (b0 = dayCost(day, items, lax)));
      const v = startValue(p, c, now, u ? u[k] : env.util(p, c, ends)) - (dayCost(day, [...items, { start: c, end: c + du[i] }], lax) - b0);
      if (v > top.v) top = { c, v };
    }
    return top.c;
  };

  // Incremental score change of a move: only touched days and pieces whose "after" window a changed end reaches are rescored.
  const evalMove = (mv: Mv) => {
    const x = view(mv), moved = new Set(mv.map((m) => m[0]));
    if (mv.some(([i, s]) => s >= 0 && !fits(i, s, x))) return { delta: -Infinity, commit() {} };
    const bk = listsOf(x), ends = endsOf(x);
    const win: number[] = [], days = new Set<number>();
    for (const [i, s] of mv) for (const t of [S[i], s]) if (t >= 0) { days.add(dayStart(t)); win.push(t + du[i]); }
    const dv = new Map<number, number>(), nd = new Map<number, number>();
    let delta = 0;
    for (let j = 0; j < n; j++) {
      const s = x[j];
      if (s < 0 ? !moved.has(j) : !moved.has(j) && !win.some((e) => s >= e && s - e <= HOUR)) continue;
      const v = s < 0 ? MISS : startValue(pieces[j], s, now, env.util(pieces[j], s, ends));
      dv.set(j, v); delta += v - V[j];
    }
    for (const d of days) { const c = dayCost(d, bk.get(d) ?? []); nd.set(d, c); delta -= c - (D.get(d) ?? 0); }
    return { delta, commit() { S = x; for (const [j, v] of dv) V[j] = v; for (const [d, c] of nd) D.set(d, c); cur += delta; } };
  };
  const full = (x: number[]) => {
    const ends = endsOf(x);
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] >= 0 ? startValue(pieces[i], x[i], now, env.util(pieces[i], x[i], ends)) : MISS;
    for (const [d, items] of listsOf(x)) s -= dayCost(d, items);
    return s;
  };

  const log: LogEntry[] = [];
  const order = pieces.map((_, i) => i).sort((a, b) =>
    (pieces[a].task.deadline ?? Infinity) - (pieces[b].task.deadline ?? Infinity) || (pieces[a].id < pieces[b].id ? -1 : 1));
  const rank: number[] = []; order.forEach((i, r) => (rank[i] = r));
  for (const i of order) {
    const m = evalMove([[i, best(i, [])]]);
    m.commit();
    if (m.delta > 0 && log.length < LOG_CAP / 2) log.push({ kind: "place", ids: [pieces[i].id], gain: m.delta });
  }
  const greedyScore = full(S);

  let rng = seed >>> 0;
  const rand = () => { rng = (rng + 0x6d2b79f5) >>> 0; let t = Math.imul(rng ^ (rng >>> 15), 1 | rng); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Only pieces with a choice are searched: a held piece has one cell, so a small change stays a small, repeatable search.
  const free = pieces.map((_, i) => i).filter((i) => cs[i].length > 1), nf = free.length;
  const iters = Math.min(3000, 80 * nf);
  let bestS = S, bestScore = cur;
  for (let it = 0; it < iters; it++) {
    if (Date.now() - t0 > CAP_MS) break; // a wall-clock cap: the greedy pass is already clash-free, search only polishes it
    const T = T0 * (T1 / T0) ** (it / iters), r = rand(), i = free[Math.floor(rand() * nf)];
    let mv: Mv = [], kind: LogEntry["kind"] = "reinsert", day: number | undefined;
    if (r < 0.3) {
      const c = best(i, []);
      if (c !== S[i]) mv = [[i, c]];
    } else if (r < 0.5) {
      const j = free[Math.floor(rand() * nf)];
      // a swap must stay inside both pieces' horizons and windows
      if (i !== j && S[i] !== S[j] && inDom(i, S[j]) && inDom(j, S[i])) { mv = [[i, S[j]], [j, S[i]]]; kind = "swap"; }
    } else if (r < 0.8) {
      const a = best(i, [], true);
      mv = [[i, a]];
      const j = S.findIndex((s, k) => k !== i && ov(s, s + du[k], a, a + du[i]) > 0);
      if (j >= 0) { mv.push([j, best(j, mv)]); kind = "chain"; }
      else if (a === S[i]) mv = [];
    } else {
      const by = new Map<number, number[]>();
      S.forEach((s, k) => { const d = dayStart(s); (by.get(d) ?? by.set(d, []).get(d)!).push(k); });
      const keys = [...by.keys()].sort((a, b) => a - b);
      day = keys[Math.floor(rand() * keys.length)];
      const ids = by.get(day)!.filter((k) => cs[k].length > 1).sort((a, b) => rank[a] - rank[b]);
      mv = ids.map((k) => [k, -1]);
      mv.forEach((m) => (m[1] = best(m[0], mv)));
      kind = "day";
    }
    if (!mv.length) continue;
    const m = evalMove(mv);
    if (m.delta < 0 && rand() >= Math.exp(m.delta / T)) continue;
    m.commit();
    if (cur > bestScore + 1e-9) {
      if (log.length < LOG_CAP) log.push({ kind, ids: mv.map((q) => pieces[q[0]].id), gain: cur - bestScore, ...(day !== undefined && { day }) });
      bestScore = cur; bestS = S;
    }
  }
  S = bestS;

  // Cap displaced tasks: revert the smallest moves to their old slot when it is free.
  const moved = pieces.map((_, i) => i).filter((i) => pieces[i].prior !== undefined && S[i] !== pieces[i].prior)
    .sort((a, b) => Math.abs(S[a] - pieces[a].prior!) - Math.abs(S[b] - pieces[b].prior!));
  let extra = moved.length - EJECT_CAP;
  for (const i of moved) {
    if (extra <= 0) break;
    const prior = pieces[i].prior!;
    if (inDom(i, prior) && fits(i, prior, view([], i))) { S = view([[i, prior]]); extra--; }
  }
  return { starts: new Map(pieces.map((p, i) => [p.id, S[i]])), score: full(S), greedyScore, log };
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
