// What the app knows that the reader is not told by the text: the timetable, habits per title, marks. Pure, so each is testable.
import type { ParsedMark } from "../dlu/parse/student";
import type { Task } from "../types";
import type { Committed } from "./reader/assemble";
import { fold } from "./reader/fold";
import type { CalDay } from "./reader/daypick";
import type { ReaderItem } from "./shared";

const DAY = 86400_000;
// App time is fixed UTC+7 (see dlu/parse/time.ts).
const wall = (ms: number) => new Date(ms + 7 * 3600_000);
const dateOf = (ms: number) => wall(ms).toISOString().slice(0, 10);
const minOf = (ms: number) => { const d = wall(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

/** The next `days` local days from today, each with its synced classes and exams, the shape a "hôm có tiết sáng" phrase picks from. */
export function calendarOf(tasks: Task[], now: number, days = 14): CalDay[] {
  const live = tasks.filter((x) => x.fixed && x.start !== undefined && !x.doneAt && !x.deletedAt);
  return Array.from({ length: days }, (_, i) => {
    const date = dateOf(now + i * DAY), on = live.filter((x) => dateOf(x.start!) === date);
    return {
      date,
      classes: on.filter((x) => x.fixed === "lecture").map((x) => ({ title: x.title, start: minOf(x.start!), end: minOf(x.end ?? x.start!) })),
      exams: on.filter((x) => x.fixed === "exam").map((x) => ({ title: x.title, start: minOf(x.start!) })),
    };
  });
}

/** Prep length multiplier per folded course title: a fail or low mark reads above 1, a high one below. */
export function affinityOf(marks: Pick<ParsedMark, "curriculumName" | "score10" | "passed">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of marks) {
    const mult = m.passed === false || (m.score10 !== null && m.score10 < 5) ? 1.6 : m.score10 === null ? 1 : m.score10 < 7 ? 1.25 : m.score10 >= 8.5 ? 0.75 : 1;
    const key = fold(m.curriculumName).text.trim();
    if (key && mult !== 1) out.set(key, mult);
  }
  return out;
}

const KEEP = 300;
/** Rows kept for `prior`: what each saved item looked like, newest first, capped. */
export const committedRows = (items: ReaderItem[], old: Committed[] = []): Committed[] =>
  [...items.map((i) => ({ title: i.title, type: i.type, durationMinutes: i.durationMinutes, window: i.windows?.[0] })), ...old].slice(0, KEEP);

const TERMS = ["deadline", "demo", "meeting", "assignment", "project", "quiz", "midterm", "final", "exam", "report", "submit", "slide", "seminar", "workshop", "online", "zoom"];
const HINTS = 100;
/** Words to bias the recognizer toward: live task titles, courses, rooms and teachers, then the English words students say. */
export function vocab(tasks: Task[]): string[] {
  const live = tasks.filter((x) => !x.doneAt && !x.deletedAt && !x.parentId);
  const own = live.flatMap((x) => [x.title, x.course, x.location, x.teacher]);
  return [...new Set([...own, ...TERMS].map((x) => x?.trim()).filter((x): x is string => !!x && x.length < 60))].slice(0, HINTS);
}
