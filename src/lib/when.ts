import { t } from "./i18n";

const DAY = 86400_000;
const WD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// The device's own clock, as hhmm(), startOfDay() and the native pickers use, so every field shows the same time.
const days = (ts: number) => { const d = new Date(ts); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
const wd = (d: number) => (d + 3) % 7; // 1970-01-01 was a Thursday; Monday = 0
const dm = (ts: number) => { const d = new Date(ts); return `${d.getDate()}/${d.getMonth() + 1}`; };
const hm = (ts: number) => { const d = new Date(ts); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const sameWeek = (a: number, b: number) => days(a) - wd(days(a)) === days(b) - wd(days(b));

/** "Hôm nay" on the day of `now`, "T6" in its week (Mon to Sun), else "T6 21/11". */
export const day = (ts: number, now: number) => days(ts) === days(now) ? t("today") : `${WD[wd(days(ts))]}${sameWeek(ts, now) ? "" : ` ${dm(ts)}`}`;
/** day() plus the time: "Hôm nay 14:00", "T6 14:00", "T6 21/11 14:00". */
export const when = (ts: number, now: number) => `${day(ts, now)} ${hm(ts)}`;
/** "T6, 21/11". */
export const dayLabel = (ts: number) => `${WD[wd(days(ts))]}, ${dm(ts)}`;

export const startDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** The end after its time is turned on the dial. Within a day of the start, an end before the start runs past midnight (and back);
 *  an end days later keeps its day. */
export function endAt(start: number, end: number, picked: Date): number {
  const days = Math.round((startDay(end) - startDay(start)) / 86_400_000);
  const base = new Date(days <= 1 ? start : end);
  base.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return base.getTime() <= start ? base.getTime() + (days <= 1 ? 86_400_000 : 0) : base.getTime();
}
