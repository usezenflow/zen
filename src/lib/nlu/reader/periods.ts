// Period resolver for Vietnamese university class periods (Tiết 1–14). The portal's table is the only one:
// periods 5 and 6 are the user's decision (plan 1.14); a period it does not know resolves to null.
import { periodsToWallClock } from "../../dlu/parse/period-map";
import { lengthMin } from "./calendar";

export interface PeriodResolved {
  h: number;
  mi: number;
  durationMinutes: number;
}

/** The portal's wall clock for periods `p1`..`p2` (either order), minutes from midnight; null when any is unknown. */
export function periodSpan(p1: number, p2 = p1) {
  const from = Math.min(p1, p2);
  const span = periodsToWallClock(from, Math.max(p1, p2) - from + 1);
  return span && { start: span.startMin, end: span.endMin };
}

/** Resolves period numbers (e.g. Tiết 1-3 or Tiết 7-9) into clock time and duration. */
export function resolvePeriods(p1: number, p2?: number): PeriodResolved | null {
  const s = periodSpan(p1, p2);
  return s && { h: Math.floor(s.start / 60), mi: s.start % 60, durationMinutes: lengthMin(s.end - s.start) };
}
