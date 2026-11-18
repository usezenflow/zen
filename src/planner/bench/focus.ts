/*
 * Focus scenarios: the neutral persona (personas.ts NEUTRAL) with exactly one trait turned on, so one idea can be read on its own.
 * Plan idea numbers: doubt=1 (stay put when unsure), missed=2 (ignored three times), fallacy=3 (learn the planning fallacy),
 * lead=4 (learn when you finish before deadlines), buffer=5 (learn the time around class), group=6 (group errands),
 * parts=7 and awake=7 (learn part words and awake hours), load=9 (lighter plans near holidays and exams).
 */
import type { Kind } from "../../lib/types";
import { NEUTRAL, type MixItem, type Persona } from "./personas";

export const FOCUS_NAMES = ["doubt", "missed", "parts", "awake", "load", "fallacy", "lead", "buffer", "group"] as const;
export type FocusName = (typeof FOCUS_NAMES)[number];
export const FOCUS_DAYS = 20; // one focus must run in 3 s per seed: a shorter window than the personas' 30 days

const KINDS: Kind[] = ["study", "work", "chores", "errand", "exercise", "social", "self", "finance", "other"];
const allPref = (h: number): Persona["pref"] => Object.fromEntries(KINDS.map((k) => [k, h]));
const LEC_A = "Giải tích (lý thuyết)", LEC_B = "Vật lý đại cương (lý thuyết)";

export const FOCUS: Record<FocusName, Persona> = {
  // Keeps almost anything, and deletes half of what it is offered mid-day, so every freed hour pulls and bumps.
  doubt: {
    ...NEUTRAL, name: "doubt", spread: 12, deleteP: 0.5,
    mix: [
      { title: "Làm báo cáo", kind: "work", effort: 90, dueInDays: [1, 3], perWeek: 7 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, dueInDays: [2, 5], perWeek: 7 },
      { title: "Dọn phòng", kind: "chores", effort: 30, perWeek: 5 },
      { title: "Đi chợ", kind: "errand", effort: 30, perWeek: 5 },
    ],
  },
  // Hates 9–11h (always ignored, never dragged off); pref 10 bait the planner into that band.
  missed: { ...NEUTRAL, name: "missed", pref: allPref(10), spread: 2, hate: { from: 9, to: 11 } },
  // Said parts of the day ("tối"); does them only at 21–23h.
  parts: {
    ...NEUTRAL, name: "parts", pref: allPref(22), spread: 1,
    mix: [
      { title: "Ôn tập tối nay", kind: "study", effort: 60, perWeek: 4, part: "tối" },
      { title: "Dọn bếp tối nay", kind: "chores", effort: 30, perWeek: 3, part: "tối" },
    ],
  },
  // A night owl: awake 10h to 02h, and does its work at 21h.
  awake: { ...NEUTRAL, name: "awake", wake: 10, sleep: 26, opens: [10.5, 13.5, 17, 20.5, 23.5], pref: allPref(21), spread: 3 },
  // Capacity 3h with 6–8h offered on busy days; day 14 is a holiday with 1h; an exam on day 10.
  load: {
    ...NEUTRAL, name: "load", capacity: 3, holidays: [14], holidayCapacity: 1, exams: [{ day: 10, from: 9, len: 120, title: "Giải tích" }],
    mix: [
      { title: "Làm báo cáo", kind: "work", effort: 120, dueInDays: [2, 8], perWeek: 7 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 90, dueInDays: [3, 10], perWeek: 7 },
      { title: "Dọn phòng", kind: "chores", effort: 60, perWeek: 7 },
    ],
  },
  // Capacity 4h. The guessed work is 3.5h a day (fits), but the true length is 1.5× that (5.25h, overflows).
  fallacy: {
    ...NEUTRAL, name: "fallacy", capacity: 4, fallacy: allPref(1.5) as Persona["fallacy"],
    mix: [
      { title: "Làm báo cáo", kind: "work", effort: 60, perWeek: 7, effortGuessed: true },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 7, effortGuessed: true },
      { title: "Dọn phòng", kind: "chores", effort: 60, perWeek: 7, effortGuessed: true },
      { title: "Đi chợ", kind: "errand", effort: 30, perWeek: 7, effortGuessed: true },
    ],
  },
  // Early deadlines; keeps a dated task only when placed in the first 80% of its window, otherwise it postpones.
  lead: { ...NEUTRAL, name: "lead", deadlineStyle: "early", leadFrac: 0.8, mix: NEUTRAL.mix.map((m): MixItem => (m.dueInDays ? { ...m, dueInDays: [3, 14] } : m)) },
  // Each weekday the only free time before a task's deadline is the 90 min right after the 10:30 class (12:30–14:00, the first
  // 40 min of it is the persona's rest) plus the evening after 21h. The persona prefers the after-class slot (13:15, when its rest ends)
  // but never works inside the 40 min rest. Short tasks (30 min) are what fit the 90 min window.
  buffer: {
    ...NEUTRAL, name: "buffer", buffer: 40, pref: allPref(13.25), spread: 1,
    lectures: [0, 1, 2, 3, 4].flatMap((wd) => [
      { wd, from: 8, to: 10, title: LEC_A }, { wd, from: 10.5, to: 12.5, title: LEC_B }, { wd, from: 14, to: 21, title: "Ca làm" },
    ]),
    mix: [
      { title: "Ôn tập Giải tích", kind: "study", effort: 30, dueInDays: [1, 2], perWeek: 7 },
      { title: "Dọn phòng", kind: "chores", effort: 30, dueInDays: [1, 2], perWeek: 7 },
    ],
  },
  // Three errands a day; it keeps an errand only when another errand sits within an hour of it.
  group: {
    ...NEUTRAL, name: "group", batch: "errand",
    mix: [
      { title: "Làm báo cáo", kind: "work", effort: 60, perWeek: 2 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 2 },
      { title: "Đi chợ", kind: "errand", effort: 30, perWeek: 7 },
      { title: "Trả tiền điện", kind: "errand", effort: 15, perWeek: 7 },
      { title: "Gửi bưu kiện", kind: "errand", effort: 20, perWeek: 7 },
    ],
  },
};
