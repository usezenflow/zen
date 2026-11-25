import type { Kind, Task } from "../lib/types";
import { PART_NAMES } from "../lib/parts";
import { D, KINDS, partIdx } from "./linucb";

export { D, KINDS, partIdx };
export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;
export const I_AFTER = 4 + KINDS.length, I_ENERGY = I_AFTER + KINDS.length, I_SIM = I_ENERGY + 1;

export const hourOf = (t: number) => { const d = new Date(t); return d.getHours() + d.getMinutes() / 60; };
export const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
// A repeat's occurrence ends at midnight of its own day: that bounds the day, it is no due ("Hạn 0:00, xếp sớm"). A said due ("trước 17h") stays.
export const dueOf = (t: Task) => (t.rrule && t.deadline !== undefined && t.deadline === dayStart(t.deadline) ? undefined : t.deadline);
export const cellIdx = (t: number) => { const d = new Date(t); return ((d.getDay() + 6) % 7) * 24 + d.getHours(); };
export const cdist = (a: number, b: number) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d); };
// A day, said as a person would sort it: the part of the day (sáng, trưa, chiều, tối) and ngày thường or cuối tuần. Rhythm and reasons share these words.
export const PART4 = PART_NAMES; // one list of parts for the planner and the rhythm
export const dayType = (wd: number) => (wd === 0 || wd === 6 ? "cuối tuần" : "ngày thường");
export const energy = (h: number, peak: number) => Math.exp(-(cdist(h, peak) ** 2) / 18);
export const ENERGY_SIGMA = 1.5, ENERGY_MIN = 5; // hours of the kernel; done hours before the density replaces the scalar peak

/** Energy by hour: a kernel density of the hours you finished things in the last 14 days, scaled so its best hour is 1 (circular over 24h),
 * so a user with two good stretches (09:00 and 21:00) is not put at 15:00. Fewer than ENERGY_MIN done hours: the scalar energy(h, peak). */
export function energyFn(done: { hour: number; at: number }[], now: number, peak: number): (h: number) => number {
  const xs = done.filter((d) => now - d.at <= 14 * DAY).map((d) => d.hour);
  if (xs.length < ENERGY_MIN) return (h) => energy(h, peak);
  const dens = (h: number) => xs.reduce((s, x) => s + Math.exp(-(cdist(x, h) ** 2) / (2 * ENERGY_SIGMA ** 2)), 0);
  let top = 0;
  for (let g = 0; g < 24; g += 0.5) top = Math.max(top, dens(g));
  return (h) => dens(h) / (top || 1);
}
export const energyAt = (done: { hour: number; at: number }[], h: number, now: number, peak = 15) => energyFn(done, now, peak)(h);

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

// x = [1, weekend, busy, due, kind(K), after(K), energy, similar], D wide
export function features(t: Task, start: number, c: FeatCtx): number[] {
  const x = new Array(D).fill(0);
  const d = new Date(start);
  const h = hourOf(start);
  x[0] = 1;
  x[1] = d.getDay() === 0 || d.getDay() === 6 ? 1 : 0;
  x[2] = Math.min(1, c.fixedH(dayStart(start)) / 8);
  const due = dueOf(t);
  x[3] = due === undefined ? 0 : Math.exp(-Math.max(0, due - start) / HOUR / 24);
  x[4 + KINDS.indexOf(t.kind)] = 1;
  let best: { kind: Kind; end: number } | undefined;
  for (const e of c.ends) if (e.end <= start && e.end >= start - HOUR && (!best || e.end > best.end)) best = e;
  if (best) x[I_AFTER + KINDS.indexOf(best.kind)] = 1;
  x[I_ENERGY] = energy(h, c.peak);
  x[I_SIM] = simAt(c.nb, h);
  return x;
}
