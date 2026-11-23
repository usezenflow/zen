// Parts of the day in minutes after midnight: the one source for the planner (planner/place.ts) and the reader's adapter (nlu/adapt.ts).
import type { ReaderWindow } from "./nlu/shared";

/** The parts of the day, the same four the rhythm shows: sáng 0-11, trưa 11-13, chiều 13-18, tối 18-24 (the awake window and the learned preference keep early hours free, not the part; "đêm" and "khuya" said are the end of it). */
export const PARTS: [number, number][] = [[0, 660], [660, 780], [780, 1080], [1080, 1440]];
/** Flexible work starts from 7:00 and ends by 22:00; a said part that runs later (đêm) stands. */
export const WAKE_FROM = 7 * 60, WAKE_TO = 22 * 60;

/** Where a part of the day opens for the planner, as people say the hours: 1-10 giờ sáng, 11-12 giờ trưa, 1-5 giờ chiều, 6-9 giờ tối, 10-12 giờ đêm. */
export const WINDOW_FROM: Record<ReaderWindow, string> = {
  EARLY_MORNING: "05:00", DAWN: "04:00", MORNING: "05:00", NOON: "11:00",
  AFTERNOON: "13:00", EVENING: "18:00", NIGHT: "18:00", MIDNIGHT: "22:00",
};
/** Where a said part of the day ends (the reader's own bounds in reader/parts.ts); a task of that part stays inside it. */
export const WINDOW_END: Record<ReaderWindow, string> = {
  EARLY_MORNING: "08:00", DAWN: "08:00", MORNING: "11:00", NOON: "13:00",
  AFTERNOON: "18:00", EVENING: "22:00", NIGHT: "22:00", MIDNIGHT: "23:59",
};
/** The names of PARTS, in the same order: sáng, trưa, chiều, tối. */
export const PART_NAMES = ["sáng", "trưa", "chiều", "tối"] as const;
export type PartName = (typeof PART_NAMES)[number];

/** "Dời" choices from `now`: the parts of today still ahead (a part with less than 30 min left is not offered), then tomorrow's sáng and trưa (at most four). Each keeps its window. */
export function laterChoices(now: number): { label: string; day: number; part: [number, number] }[] {
  const d0 = new Date(now).setHours(0, 0, 0, 0), mins = (now - d0) / 60_000;
  const d1 = new Date(d0).setDate(new Date(d0).getDate() + 1); // a DST day is not 24 h
  const today = PARTS.map((part, k) => ({ label: `${PART_NAMES[k]} nay`, day: d0, part })).filter((c) => c.part[1] > mins + 30);
  const tomorrow = PARTS.slice(0, 2).map((part, k) => ({ label: `mai ${PART_NAMES[k]}`, day: d1, part }));
  return [...today, ...tomorrow].slice(0, 4);
}
