// Period resolver mapping standard DLU / Vietnamese university class periods (Tiết 1–14).
// Class periods resolve to their clock and length, both rounded to the 30 minute grid like any typed time.

import { lengthMin } from "./calendar";

export interface PeriodResolved {
  h: number;
  mi: number;
  durationMinutes: number;
}

export const PERIOD_TABLE: Record<number, { start: number; end: number }> = {
  // Morning block (Tiết 1–5)
  1: { start: 7 * 60 + 30, end: 8 * 60 + 30 },
  2: { start: 8 * 60 + 30, end: 9 * 60 + 15 },
  3: { start: 9 * 60 + 30, end: 10 * 60 + 30 },
  4: { start: 10 * 60 + 30, end: 11 * 60 + 15 },
  5: { start: 11 * 60 + 15, end: 12 * 60 },
  // Midday / Afternoon block (Tiết 6–10)
  6: { start: 12 * 60 + 15, end: 13 * 60 },
  7: { start: 13 * 60, end: 13 * 60 + 45 },
  8: { start: 13 * 60 + 45, end: 14 * 60 + 45 },
  9: { start: 14 * 60 + 45, end: 15 * 60 + 45 },
  10: { start: 15 * 60 + 45, end: 16 * 60 + 30 },
  // Evening block (Tiết 11–14)
  11: { start: 16 * 60 + 45, end: 17 * 60 + 30 },
  12: { start: 17 * 60 + 30, end: 18 * 60 + 30 },
  13: { start: 18 * 60 + 30, end: 19 * 60 + 15 },
  14: { start: 19 * 60 + 15, end: 20 * 60 },
};

/** Resolves period numbers (e.g. Tiết 1-3 or Tiết 7-9) into clock time and duration. */
export function resolvePeriods(p1: number, p2?: number): PeriodResolved | null {
  const from = Math.min(p1, p2 ?? p1);
  const to = Math.max(p1, p2 ?? p1);
  const startSlot = PERIOD_TABLE[from];
  const endSlot = PERIOD_TABLE[to];
  if (!startSlot || !endSlot) return null;

  const startMin = startSlot.start;
  const endMin = endSlot.end;
  const durationMinutes = lengthMin(endMin - startMin);
  return {
    h: Math.floor(startMin / 60),
    mi: startMin % 60,
    durationMinutes,
  };
}
