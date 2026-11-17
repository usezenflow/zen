import type { Kind, Task } from "../lib/types";
import { DAY, hourOf, type Nb } from "./features";
import type { Model } from "./model";
import { r30 } from "../lib/nlu/size";

const KIND_EFFORT: Record<Kind, number> = { study: 60, exercise: 60, chores: 30, social: 90, other: 30, work: 60, errand: 30, finance: 30, self: 30 };
const HALF = 21 * DAY;
// Cosine floor for a title to count as alike, in embed() space. Checked in habits.test.ts: 0.6 keeps the synonym pairs
// that clear it and drops most unrelated pairs; "tập gym" ~ "tập thể dục" (0.36) is below any floor that keeps the rest.
export const SIM = 0.6;

// Vectors of another length (a stored one from an older embedding) are never alike: 0, not a partial sum.
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// Median hour of done swipes over 14 days; 15:00 when cold.
export function peakHour(m: Model, now: number): number {
  const h = m.doneHours.filter((d) => now - d.at <= 14 * DAY).map((d) => d.hour);
  return h.length ? median(h) : 15;
}

// A said length stands. A guessed one gives way to the median of 2+ alike tasks the user finished (half hours); with fewer it stands.
export function effort(t: Task, m: Model): number {
  const guessed = !!t.effortGuessed && t.effort > 0;
  if (t.effort > 0 && !guessed) return t.effort;
  if (t.vec) {
    // embed() alone scores some unrelated titles high ("đi khám răng" ~ "đi ngủ sớm" 0.71): a different kind is never alike
    const near = m.efforts.filter((e) => !e.kind || e.kind === t.kind)
      .map((e) => ({ c: cosine(t.vec!, e.vec), m: e.minutes }))
      .filter((e) => e.c > SIM).sort((a, b) => b.c - a.c).slice(0, 5);
    if (guessed && near.length >= 2) return r30(median(near.map((n) => n.m)));
    if (!guessed && near.length) return r30(median(near.map((n) => n.m))); // no length said at all: a guess, on the half hour
  }
  return guessed ? t.effort : KIND_EFFORT[t.kind];
}

// Share of placements of this kind the user pushed later.
export function slipOf(m: Model, k: Kind): number {
  const s = m.slip[k];
  return s.placed > 0 ? Math.min(1, s.later / s.placed) : 0;
}

export function neighbors(t: Task, m: Model, now: number): Nb[] {
  if (!t.vec) return [];
  return m.hist
    .map((h) => ({ c: cosine(t.vec!, h.vec), h }))
    .filter((e) => e.c > SIM)
    .sort((a, b) => b.c - a.c).slice(0, 20)
    .map(({ c, h }) => ({ w: c * 0.5 ** ((now - h.at) / HALF), hour: h.hour, r: h.r }));
}

export { hourOf };
