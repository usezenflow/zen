// Shared builders for component tests. Times default to around NOW (test/setup.ts: Tue 17 Nov 2026, 10:00 VN).
import type { Task } from "@/lib/types";
import { NOW } from "./now";

export { NOW };
export const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** Local (VN) midnight of NOW's day. */
export const TODAY = new Date(new Date(NOW).setHours(0, 0, 0, 0)).getTime();
/** `h:m` today, local time. */
export const at = (h: number, m = 0, day = TODAY) => day + h * HOUR + m * MIN;

let n = 0;
/** A user task, one hour from 14:00 today unless overridden. */
export const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: "Ôn tập", kind: "study", source: "user", effort: 60,
  start: at(14), end: at(15), createdAt: NOW - DAY, ...over,
});
/** A campus lecture (fixed). */
export const lecture = (over: Partial<Task> = {}) =>
  task({ title: "Lập trình Web", source: "dlu", fixed: "lecture", location: "A27.101", section: "99910AB100101", start: at(7), end: at(9, 15), ...over });
