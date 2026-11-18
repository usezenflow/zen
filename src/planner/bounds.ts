// The planner's day bounds for one user: the defaults until the model has learned enough, then the user's own parts and awake window. Pure.
import { PART_NAMES, PARTS, WAKE_FROM, WAKE_TO } from "../lib/parts";
import type { Model } from "./model";

export interface Bounds { parts: [number, number][]; from: number; to: number }
export const DEFAULT_BOUNDS: Bounds = { parts: PARTS, from: WAKE_FROM, to: WAKE_TO };

const MIN_PART = 5, MIN_DAYS = 5, PAD = 30, REACH = 90;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
// shortcut: nearest-rank quantile on a copy, fine for the 50 and 30 samples the model keeps; upgrade to interpolation if they grow.
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.round(p * (xs.length - 1))];

/** Personal bounds from what the user chose: parts from done ticks, the awake window from chosen times per day. Only ever wider than the defaults. */
export function boundsOf(m: Model): Bounds {
  // a learned part widens its default by up to 90 min, and never narrows it: placement inside the window is steered by the arms
  const parts = PARTS.map(([a, b], k): [number, number] => {
    const xs = m.partSeen?.[PART_NAMES[k]];
    if (!xs || xs.length < MIN_PART) return [a, b];
    const lo = clamp(q(xs, 0.1) - PAD, a - REACH, b + REACH), hi = clamp(q(xs, 0.9) + PAD, a - REACH, Math.min(b + REACH, 24 * 60)); // a part never crosses midnight
    return [Math.min(a, lo), Math.max(b, hi)];
  });
  const days = m.active ?? [];
  if (days.length < MIN_DAYS) return { parts, from: WAKE_FROM, to: WAKE_TO };
  // the awake window only expands: it stops forbidding hours the user really works in. shortcut: awake end capped at 24:00, since a piece never crosses midnight (place.ts).
  const from = Math.min(WAKE_FROM, clamp(q(days.map((d) => d.first), 0.1) - PAD, 5 * 60, 24 * 60 - 1));
  const to = Math.max(WAKE_TO, clamp(q(days.map((d) => d.last), 0.9) + PAD, 5 * 60, 24 * 60));
  return { parts, from, to };
}
