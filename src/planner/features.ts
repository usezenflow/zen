import type { Kind, Task } from "../lib/types";

export const KINDS: Kind[] = ["study", "exercise", "chores", "social", "other"];
export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;
export const I_AFTER = 9, I_ENERGY = 14, I_SIM = 15;

export const hourOf = (t: number) => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60; };
export const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const cellIdx = (t: number) => { const d = new Date(t); return ((d.getDay() + 6) % 7) * 24 + d.getHours(); };
export const cdist = (a: number, b: number) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d); };
export const energy = (h: number, peak: number) => Math.exp(-(cdist(h, peak) ** 2) / 18);

export interface Nb { w: number; hour: number; r: number }
export interface FeatCtx {
  fixedH: (day: number) => number;
  peak: number;
  nb: Nb[];
  ends: { kind: Kind; end: number }[]; // placed or fixed items, candidates for "after"
}

export const simAt = (nb: Nb[], h: number) => {
  let s = 0, w = 0;
  for (const n of nb) { s += n.w * Math.exp(-(cdist(n.hour, h) ** 2) / 2) * n.r; w += n.w; }
  return w ? s / w : 0;
};

// x = [1, weekend, busy, due, kind(5), after(5), energy, similar]
export function features(t: Task, start: number, c: FeatCtx): number[] {
  const x = new Array(16).fill(0);
  const d = new Date(start);
  const h = hourOf(start);
  x[0] = 1;
  x[1] = d.getDay() === 0 || d.getDay() === 6 ? 1 : 0;
  x[2] = Math.min(1, c.fixedH(dayStart(start)) / 8);
  x[3] = t.deadline === undefined ? 0 : Math.exp(-Math.max(0, t.deadline - start) / HOUR / 24);
  x[4 + KINDS.indexOf(t.kind)] = 1;
  let best: { kind: Kind; end: number } | undefined;
  for (const e of c.ends) if (e.end <= start && e.end >= start - HOUR && (!best || e.end > best.end)) best = e;
  if (best) x[I_AFTER + KINDS.indexOf(best.kind)] = 1;
  x[I_ENERGY] = energy(h, c.peak);
  x[I_SIM] = simAt(c.nb, h);
  return x;
}
