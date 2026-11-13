// Vietnam is a fixed UTC+7, so wall-clock math is plain UTC math on a shifted date.
const DAY = 86_400_000;
const VN = 7 * 3_600_000;

export type TermId = "HK01" | "HK02" | "HK03";
export interface Term { academicYear: string; semester: TermId; start: string; end: string }

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(Date.parse(s) + n * DAY));
const isoDow = (s: string) => new Date(Date.parse(s)).getUTCDay() || 7;
const weekStart = (s: string) => addDays(s, 1 - isoDow(s));
const lastWeekStart = (y: number, m: number) => weekStart(ymd(new Date(Date.UTC(y, m, 0))));

export const vnDate = (ms: number) => ymd(new Date(ms + VN));

/** ISO week of `YYYY-MM-DD`, the portal's `tuan`. */
export function isoWeek(s: string): number {
  const d = new Date(Date.parse(s));
  d.setUTCDate(d.getUTCDate() + 4 - isoDow(s));
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - jan1) / DAY + 1) / 7);
}

/** Term holding now plus two weeks, so the changeover is seamless. */
export function resolveTerm(now: number): Term {
  const probe = vnDate(now + 14 * DAY);
  const py = +probe.slice(0, 4);
  const y = probe >= lastWeekStart(py, 7) ? py : py - 1;
  const b = { HK01: lastWeekStart(y, 7), HK02: lastWeekStart(y, 12), HK03: lastWeekStart(y + 1, 5), end: lastWeekStart(y + 1, 7) };
  const semester: TermId = probe < b.HK02 ? "HK01" : probe < b.HK03 ? "HK02" : "HK03";
  const end = semester === "HK01" ? b.HK02 : semester === "HK02" ? b.HK03 : b.end;
  return { academicYear: `${y}-${y + 1}`, semester, start: b[semester], end };
}

/** `tuan` values from this week to the term end, capped. */
export function weeksToTermEnd(now: number, term: Term, cap = 26): number[] {
  const out: number[] = [];
  for (let m = weekStart(vnDate(now)); m < term.end && out.length < cap; m = addDays(m, 7)) out.push(isoWeek(m));
  return out;
}

/** Start of the month after next, VN time: LMS coverage ends here. */
export function lmsCoverageEnd(now: number): number {
  const [y, m] = vnDate(now).split("-").map(Number);
  return Date.UTC(y, m + 1, 1) - VN;
}
