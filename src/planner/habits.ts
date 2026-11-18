import type { Kind, Task } from "../lib/types";
import { DAY, hourOf, type Nb } from "./features";
import type { Model } from "./model";
import { snapGuess } from "../lib/nlu/size";

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

// How far the user's finished guessed tasks of this kind ran past their guesses: median of actual / guess over the last 20, clamped
// 0.7–1.8. 1 until 5 samples, so a cold model guesses as before.
export function fallacy(m: Model, k: Kind): number {
  const r = m.efforts.filter((e) => e.kind === k && e.guess).slice(-20).map((e) => e.minutes / e.guess!);
  return r.length < 5 ? 1 : Math.min(1.8, Math.max(0.7, median(r)));
}

// A said length stands. A guessed one gives way to the median of 2+ alike tasks the user finished (half hours); with fewer it stands,
// scaled by this kind's fallacy (fallacy()).
export function effort(t: Task, m: Model): number {
  const guessed = !!t.effortGuessed && t.effort > 0;
  if (t.effort > 0 && !guessed) return t.effort;
  if (t.vec) {
    // embed() alone scores some unrelated titles high ("đi khám răng" ~ "đi ngủ sớm" 0.71): a different kind is never alike
    const near = m.efforts.filter((e) => !e.kind || e.kind === t.kind)
      .map((e) => ({ c: cosine(t.vec!, e.vec), m: e.minutes }))
      .filter((e) => e.c > SIM).sort((a, b) => b.c - a.c).slice(0, 5);
    if (guessed && near.length >= 2) return snapGuess(median(near.map((n) => n.m)));
    if (!guessed && near.length) return snapGuess(median(near.map((n) => n.m))); // no length said at all: a guess: 15, else half hours
  }
  if (!guessed) return KIND_EFFORT[t.kind];
  const f = fallacy(m, t.kind);
  return f === 1 ? t.effort : snapGuess(t.effort * f);
}

// Where a dated sitting of this kind is aimed in its window: 1 minus the median share of the window left when you finished, kept
// 0.4–0.9 so a last-minute finisher is never aimed at the edge. Undefined until 4 samples (bell then keeps SOFT_AIM).
// A kind with too few of its own samples borrows every kind's pool, so a rare kind still gets an aim once 4 finishes exist.
export function aimOf(m: Model, k: Kind): number | undefined {
  const own = m.lead?.[k] ?? [], s = own.length >= 4 ? own : Object.values(m.lead ?? {}).flat();
  return s.length >= 4 ? Math.min(0.9, Math.max(0.4, 1 - median(s))) : undefined;
}

// One lead sample: the share of a dated task's window still open at its finish (a tick, or the end of a placement the user kept).
export function leadSample(m: Model, task: Task, finish: number): void {
  if (task.deadline === undefined) return;
  const lo = Math.max(task.createdAt, task.notBefore ?? task.createdAt), span = task.deadline - lo;
  if (span <= 0) return;
  const l = (m.lead ??= {}), s = [...(l[task.kind] ?? []), Math.min(1, Math.max(0, (task.deadline - finish) / span))];
  l[task.kind] = s.slice(-20);
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
