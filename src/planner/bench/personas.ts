import type { Kind } from "../../lib/types";

/**
 * weekdays (0 = Mon) fixes the days; otherwise the item comes on about perWeek days a week.
 * dueInDays: days after the day it comes (a range is drawn per task). part: a said part of the day ("tối nay"), as adapt.ts maps it.
 */
export interface MixItem { title: string; kind: Kind; effort: number; effortGuessed?: boolean; dueInDays?: number | [number, number]; perWeek: number; weekdays?: number[]; part?: "sáng" | "tối" }
export interface Lecture { wd: number; from: number; to: number; title: string; odd?: boolean } // hours of the day; odd: only in odd weeks
export interface Exam { day: number; from: number; len: number; title: string } // len in minutes; its prep is made 4 days before
export interface Persona {
  name: string;
  wake: number; sleep: number; // hours; sleep past 24 means after midnight (26 = 02:00)
  opens: number[]; // five candidate hours the app is opened at; a day opens it 2 to 5 times, each with ±30 min of jitter
  pref: Partial<Record<Kind, number>>; // best hour per kind; kinds left out use 14:00
  spread: number; // hours either side of pref where it keeps a slot
  fallacy: Partial<Record<Kind, number>>; // a guessed length's true length = guess × this; said lengths are true as said
  bias?: number; // minutes it ticks off after its slot (negative: early), on top of the ±12 min noise
  deadlineStyle: "early" | "even" | "late"; // late: waits until 2 days before a deadline; early: never keeps a slot less than a day before it
  buffer: number; // minutes of rest it needs after a lecture
  capacity: number; // own-work hours it will take in a day (each day ±20%)
  ignoreP: number; // chance it ignores a slot it dislikes, otherwise it drags the task to its best hour
  weekendScale?: number; // share of the mix's perWeek on Sat and Sun (default 1: lighter weekends below 1)
  weekendCapacity?: number; // multiplier on capacity on Sat and Sun (default 1)
  noise?: number; // chaotic control: share of replies that are random
  capJitter?: number; // capacity varies by ±this share each day (default 0.2)
  hate?: { from: number; to: number }; // hours it always ignores, never drags off (focus: missed)
  batch?: Kind; // it keeps a task of this kind only next to another one of it within an hour (focus: group)
  leadFrac?: number; // it keeps a dated task only when this share of its window is still left (focus: lead)
  holidays?: number[]; // day indices off: no new tasks, and capacity is holidayCapacity (default half)
  holidayCapacity?: number; // hours on a holiday
  deleteP?: number; // share of tasks it deletes at first sight (default 0.03)
  days?: number; // default 30
  lectures?: Lecture[];
  exams?: Exam[];
  shift?: { day: number; pref: Partial<Record<Kind, number>> }; // a habit that changes from that day (0-based)
  mix: MixItem[];
}

const LEC_A = "Giải tích (lý thuyết)", LEC_B = "Vật lý đại cương (lý thuyết)";

/** The base for every focus scenario: no trait at all. Each focus turns on exactly one trait from here. */
export const NEUTRAL: Persona = {
  name: "neutral", wake: 7, sleep: 23, opens: [8, 11, 14, 17.5, 21], spread: 6, deadlineStyle: "even", buffer: 0, capacity: 6, capJitter: 0, ignoreP: 0,
  pref: { study: 15, work: 15, chores: 15, errand: 15, exercise: 15, social: 15, self: 15, finance: 15, other: 15 }, fallacy: {},
  mix: [
    { title: "Làm báo cáo", kind: "work", effort: 60, dueInDays: [2, 8], perWeek: 3 },
    { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 3 },
    { title: "Dọn phòng", kind: "chores", effort: 30, perWeek: 2 },
    { title: "Đi chợ", kind: "errand", effort: 30, perWeek: 2 },
  ],
};

export const PERSONAS: Persona[] = [
  {
    name: "nightOwl", wake: 10, sleep: 26, opens: [10.5, 13.5, 17, 20.5, 23.5], spread: 2, deadlineStyle: "even", buffer: 0, capacity: 5, ignoreP: 0.5, weekendScale: 0.6,
    pref: { study: 21, work: 21, self: 22, chores: 19, finance: 20, errand: 15, social: 21, exercise: 18, other: 20 },
    fallacy: { study: 1.2, work: 1.1 },
    mix: [
      { title: "Ôn tập Giải tích", kind: "study", effort: 90, effortGuessed: true, dueInDays: [3, 10], perWeek: 2 },
      { title: "Viết nhật ký", kind: "self", effort: 20, perWeek: 3 },
      { title: "Làm báo cáo", kind: "work", effort: 120, dueInDays: [2, 8], perWeek: 1 },
      { title: "Giặt đồ", kind: "chores", effort: 30, perWeek: 1 },
      { title: "Đọc sách tối nay", kind: "self", effort: 40, perWeek: 1, part: "tối" },
    ],
  },
  {
    name: "earlyBird", wake: 7, sleep: 21.5, opens: [7.5, 11, 14.5, 18, 20.5], spread: 1.5, deadlineStyle: "early", buffer: 0, capacity: 7, ignoreP: 0.6, weekendScale: 0.5, weekendCapacity: 0.7,
    pref: { study: 8, work: 9, exercise: 7.5, errand: 10, chores: 17, finance: 9, social: 18, self: 19, other: 10 },
    fallacy: { study: 0.9 },
    mix: [
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 3 },
      { title: "Làm báo cáo", kind: "work", effort: 90, dueInDays: [2, 6], perWeek: 2 },
      { title: "Chạy bộ", kind: "exercise", effort: 40, perWeek: 3 },
      { title: "Đi chợ", kind: "errand", effort: 45, perWeek: 1 },
      { title: "Gọi bố sáng nay", kind: "social", effort: 15, perWeek: 1, part: "sáng" },
    ],
  },
  {
    name: "dluStudent", wake: 7, sleep: 23, opens: [7.5, 11, 13.5, 17, 20.5], spread: 2.5, deadlineStyle: "even", buffer: 40, capacity: 5, ignoreP: 0.5,
    pref: { study: 16, chores: 18, errand: 17, self: 20, other: 17 },
    fallacy: { study: 1.4 },
    lectures: [
      { wd: 0, from: 7.5, to: 9.5, title: LEC_A }, { wd: 0, from: 13, to: 15, title: LEC_B },
      { wd: 2, from: 9, to: 11.5, title: LEC_A }, { wd: 3, from: 13, to: 15, title: LEC_B },
      { wd: 4, from: 7.5, to: 9.5, title: LEC_A }, { wd: 5, from: 9, to: 11, title: "Thực hành Vật lý", odd: true },
    ],
    exams: [{ day: 12, from: 9, len: 120, title: "Giải tích" }, { day: 25, from: 13, len: 90, title: "Vật lý đại cương" }],
    mix: [
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, effortGuessed: true, dueInDays: [3, 7], perWeek: 3 },
      { title: "Làm bài tập Vật lý", kind: "study", effort: 90, dueInDays: [2, 6], perWeek: 2 },
      { title: "Đọc tài liệu", kind: "study", effort: 45, perWeek: 2 },
      { title: "Giặt đồ", kind: "chores", effort: 30, perWeek: 1 },
      { title: "Ôn từ vựng tối nay", kind: "study", effort: 30, perWeek: 1, part: "tối" },
    ],
  },
  {
    name: "crammer", wake: 8, sleep: 24, opens: [9, 12, 15.5, 19, 22.5], spread: 3, deadlineStyle: "late", buffer: 0, capacity: 6, ignoreP: 0.4,
    pref: { study: 20, work: 19, finance: 12, chores: 14 },
    fallacy: { study: 1.6, work: 1.3 },
    bias: 15,
    mix: [
      { title: "Ôn thi Giải tích", kind: "study", effort: 120, effortGuessed: true, dueInDays: [4, 12], perWeek: 2 },
      { title: "Làm báo cáo", kind: "work", effort: 90, dueInDays: [3, 9], perWeek: 2 },
      { title: "Đóng học phí", kind: "finance", effort: 15, dueInDays: [2, 6], perWeek: 1 },
      { title: "Dọn phòng", kind: "chores", effort: 45, perWeek: 1 },
    ],
  },
  {
    name: "steady", wake: 7, sleep: 23, opens: [7.5, 11, 14, 17.5, 21], spread: 2, deadlineStyle: "even", buffer: 0, capacity: 6, ignoreP: 0.3, weekendScale: 0.5,
    pref: { study: 9, work: 10, finance: 12, chores: 18, exercise: 7, errand: 17 },
    fallacy: {},
    mix: [
      { title: "Làm báo cáo", kind: "work", effort: 60, perWeek: 4 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 3 },
      { title: "Trả tiền điện", kind: "finance", effort: 15, dueInDays: [1, 6], perWeek: 1 },
      { title: "Dọn phòng", kind: "chores", effort: 30, perWeek: 2 },
    ],
  },
  {
    name: "gymRoutine", wake: 7, sleep: 23, opens: [7.5, 11, 14.5, 18.5, 21.5], spread: 1, deadlineStyle: "even", buffer: 0, capacity: 5, ignoreP: 0.5,
    pref: { exercise: 18, study: 20, work: 10, chores: 12 },
    fallacy: {},
    mix: [
      { title: "Tập gym", kind: "exercise", effort: 60, perWeek: 3, weekdays: [0, 2, 4] },
      { title: "Làm báo cáo", kind: "work", effort: 60, perWeek: 2 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 2 },
    ],
  },
  {
    name: "errandBatcher", wake: 8, sleep: 22, opens: [9, 12, 15, 19, 21], spread: 2, deadlineStyle: "even", buffer: 0, capacity: 4, ignoreP: 0.4, weekendScale: 0.5,
    pref: { errand: 10, chores: 11, finance: 9, social: 19 },
    fallacy: { errand: 1.3 },
    mix: [
      { title: "Đi chợ", kind: "errand", effort: 45, perWeek: 2 },
      { title: "Giặt đồ", kind: "chores", effort: 30, perWeek: 2 },
      { title: "Trả tiền điện", kind: "finance", effort: 10, dueInDays: [2, 6], perWeek: 1 },
      { title: "Mua quà sinh nhật", kind: "errand", effort: 30, dueInDays: [4, 12], perWeek: 1 },
    ],
  },
  {
    name: "chaotic", wake: 7, sleep: 23, opens: [8, 11.5, 14, 17, 20.5], spread: 6, deadlineStyle: "even", buffer: 0, capacity: 8, ignoreP: 0.5, noise: 0.5,
    pref: { study: 13, work: 15, social: 19, chores: 17 },
    fallacy: {},
    mix: [
      { title: "Làm báo cáo", kind: "work", effort: 60, perWeek: 3 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, perWeek: 3 },
      { title: "Gọi điện cho mẹ", kind: "social", effort: 20, perWeek: 2 },
      { title: "Dọn phòng", kind: "chores", effort: 30, perWeek: 2 },
    ],
  },
  {
    // The gym moves from 18h to 6h on day 15 (0-based). Only the change tests adapting; the rest is steady.
    name: "shifter", wake: 5.5, sleep: 23, opens: [6.5, 10, 14, 18, 21], spread: 1, deadlineStyle: "even", buffer: 0, capacity: 5, ignoreP: 0.4,
    pref: { exercise: 18, study: 20, work: 10, chores: 12 },
    fallacy: { study: 1.2 },
    shift: { day: 15, pref: { exercise: 6 } },
    mix: [
      { title: "Tập gym", kind: "exercise", effort: 60, perWeek: 3, weekdays: [0, 2, 4] },
      { title: "Làm báo cáo", kind: "work", effort: 60, dueInDays: [2, 8], perWeek: 2 },
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, effortGuessed: true, dueInDays: [3, 10], perWeek: 2 },
      { title: "Đi bộ", kind: "exercise", effort: 30, perWeek: 2 },
    ],
  },
  {
    // Ten days and no history: the cold start.
    name: "newbie", wake: 8, sleep: 23, opens: [9, 12.5, 15.5, 19, 21.5], spread: 2, deadlineStyle: "even", buffer: 0, capacity: 4, ignoreP: 0.5, days: 10,
    pref: { study: 10, work: 10, errand: 11, chores: 18, self: 20, exercise: 7 },
    fallacy: { study: 1.3 },
    mix: [
      { title: "Ôn tập Giải tích", kind: "study", effort: 60, effortGuessed: true, dueInDays: [2, 8], perWeek: 3 },
      { title: "Đi chợ", kind: "errand", effort: 45, perWeek: 2 },
      { title: "Giặt đồ", kind: "chores", effort: 30, perWeek: 1 },
      { title: "Tập thể dục buổi sáng", kind: "exercise", effort: 30, perWeek: 3, part: "sáng" },
    ],
  },
];
