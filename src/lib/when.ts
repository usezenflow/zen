const DAY = 86400_000;
const TZ = 7 * 3600_000; // shortcut: fixed UTC+7 like dlu/parse/time.ts
const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const days = (ts: number) => Math.floor((ts + TZ) / DAY);
const wd = (d: number) => (d + 3) % 7; // 1970-01-01 was a Thursday; Monday = 0
const dm = (ts: number) => { const d = new Date(ts + TZ); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
const hm = (ts: number) => new Date(ts + TZ).toISOString().slice(11, 16);
const sameWeek = (a: number, b: number) => days(a) - wd(days(a)) === days(b) - wd(days(b));

/** "T6" in the week of `now` (Mon to Sun), else "T6 21/11". */
export const day = (ts: number, now: number) => `${WD[wd(days(ts))]}${sameWeek(ts, now) ? "" : ` ${dm(ts)}`}`;
/** "T6 14:00" in the week of `now`, else "T6 21/11 14:00". */
export const when = (ts: number, now: number) => `${day(ts, now)} ${hm(ts)}`;
/** "T6, 21/11". */
export const dayLabel = (ts: number) => `${WD[wd(days(ts))]}, ${dm(ts)}`;
