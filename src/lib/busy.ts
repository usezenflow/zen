const DAY = 86400_000;
const TZ = 7 * 3600_000; // shortcut: fixed UTC+7 like dlu/parse/time.ts

/** An all-day event blocks every whole local day it touches. Start/end may be UTC midnight (Android) or local (iOS); end is exclusive or 23:59:59. */
export function allDayBusy(start: number, end: number) {
  const utc = start % DAY === 0; // Android dates all-day events in UTC midnights
  const off = utc ? 0 : TZ;
  const first = Math.floor((start + off) / DAY);
  const last = Math.max(first, Math.floor((end - 1 + off) / DAY));
  return { start: first * DAY - TZ, end: (last + 1) * DAY - TZ };
}
