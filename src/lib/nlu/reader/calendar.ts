// S3 calendar: wall-clock dates, weekdays and year inference. Pure, no zone.
import type { ReaderWC } from "../shared";

const DAY = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

/** Day of week of a date, 0 is Sunday. */
export const dowOf = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d)).getUTCDay();

export function addDays(w: ReaderWC, n: number): ReaderWC {
  const t = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** Days since epoch for a date, ignoring time. */
export const dayNo = (w: ReaderWC) => Date.UTC(w.y, w.m - 1, w.d) / DAY;

/** Minutes since epoch, wall clock. */
export const minutesOf = (w: ReaderWC) =>
  dayNo(w) * 1440 + (w.h ?? 0) * 60 + (w.mi ?? 0);

/** Minutes on the 30 minute grid: a remainder of 15 or more rounds up, under 15 rounds down. */
export const round30 = (min: number) => Math.floor((min + 15) / 30) * 30;
/** A said start on the planner's 15-minute grid (place.ts STEP): 10:15 stays, 10:10 is 10:15, 23:55 is midnight. */
export const round15 = (min: number) => Math.floor((min + 7.5) / 15) * 15;

/** A length on the 30 minute grid, never under 30. */
export const lengthMin = (min: number) => Math.max(30, round30(min));

/** "YYYY-MM-DD HH:mm" for a date and a time. */
export const stamp = (w: ReaderWC, h: number, mi: number) =>
  `${w.y}-${p2(w.m)}-${p2(w.d)} ${p2(h)}:${p2(mi)}`;

/**
 * The year of a date written without one: the nearest of ref's year -1, 0, +1 that is not more than
 * PAST_GRACE_DAYS in the past: a date up to four months back is a past date to flag, one further back is next year.
 */
export function inferYear(m: number, d: number, ref: ReaderWC): number {
  const PAST_GRACE_DAYS = 120;
  const r = dayNo(ref);
  let best: { y: number; gap: number } | undefined;
  for (const y of [ref.y - 1, ref.y, ref.y + 1]) {
    // a day past the month's end is its last day: "30/2" is 28 February, not 2 March
    const day = Date.UTC(y, m - 1, Math.min(d, daysInMonth(y, m))) / DAY;
    if (day < r - PAST_GRACE_DAYS) continue;
    const gap = Math.abs(day - r);
    if (!best || gap < best.gap) best = { y, gap };
  }
  return best ? best.y : ref.y + 1;
}

/** Number of days in month m (1-12) of year y. */
export const daysInMonth = (y: number, m: number): number =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();
