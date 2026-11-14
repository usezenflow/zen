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

/** Months of LMS calendar fetched, this one included. */
export const LMS_MONTHS = 4;

/** Start of the month after the last fetched one, VN time: LMS coverage ends here. */
export function lmsCoverageEnd(now: number): number {
  const [y, m] = vnDate(now).split("-").map(Number);
  return Date.UTC(y, m - 1 + LMS_MONTHS, 1) - VN;
}

/** The term in progress now, with no lookahead: exams and marks belong to it, not to the one starting in two weeks. */
export const termNow = (now: number): Term => resolveTerm(now - 14 * DAY);

/** Months the portal publishes and moves exams in: Oct-Nov (HK1), Mar-Apr (HK2), Jun-Jul (HK3). */
export const examMonth = (now: number): boolean => [3, 4, 6, 7, 10, 11].includes(+vnDate(now).slice(5, 7));

/** Marks of an exam land until the end of Jan (HK1 exams, Aug-Jan), Jun (HK2, Feb-May) or Jul (HK3, Jun-Jul): the start of the next month, VN time. */
function marksEnd(exam: number): number {
  const [y, m] = vnDate(exam).split("-").map(Number);
  const [ey, em] = m >= 8 ? [y + 1, 2] : m === 1 ? [y, 2] : m <= 5 ? [y, 7] : [y, 8];
  return Date.UTC(ey, em - 1, 1) - VN;
}

/** Marks are worth fetching from a week after the season's first exam ended to that season's marks end. */
export const marksOpen = (now: number, examEnds: number[]): boolean => examEnds.some((e) => e + 7 * DAY <= now && now < marksEnd(e));

/** Fees are billed by mid Oct, Mar and Jun: from noon on the 15th to that month's end. Returns that month ("2026-10") or null. */
export function feeMonth(now: number): string | null {
  const [y, m, d] = vnDate(now).split("-").map(Number);
  const h = new Date(now + VN).getUTCHours();
  return [3, 6, 10].includes(m) && (d > 15 || (d === 15 && h >= 12)) ? `${y}-${String(m).padStart(2, "0")}` : null;
}

/** Mondays (`YYYY-MM-DD`, VN) from this week to the term end, capped: one timetable job each. */
export function termMondays(now: number, term: Term, cap = 26): string[] {
  const out: string[] = [];
  for (let m = weekStart(vnDate(now)); m < term.end && out.length < cap; m = addDays(m, 7)) out.push(m);
  return out;
}
/** Epoch ms of 00:00 VN on `YYYY-MM-DD`. */
export const vnMidnight = (s: string) => Date.parse(s) - VN;
