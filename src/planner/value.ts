import type { Task } from "../lib/types";
import { DAY, HOUR, MIN, dueOf } from "./features";

export interface Piece {
  id: string;
  task: Task;
  effort: number; // minutes, positive multiple of 15
  k: number; // 1-based sitting index
  n: number; // sittings of the parent
  prior?: number; // current start
  slip: number;
  missed?: number; // old start of a task that ended unfinished: replanned, told so
  over?: boolean; // due today and too long for what is left before 22:00: may run on to midnight
  lock?: boolean; // its current start is still good, so it stays: nothing moves without a cause
  soon?: boolean; // missed or "later": without a deadline, aim within 2 days, not a week
  ask?: { from?: number; to: number }; // the window said, when it was too packed and the task ran on past it
  cut?: number; // the guessed length, when it was shrunk to fit what is free
}

export const dur = (p: Piece) => p.effort * MIN;

export function bell(p: Piece, now: number, start: number): number {
  const t = p.task;
  const due = dueOf(t);
  if (due === undefined) return 0; // a repeat's day bound pulls nowhere: place.ts keeps it inside the day
  const lo = Math.max(t.createdAt, t.notBefore ?? t.createdAt); // not `now`: the curve must not drift between replans
  const hi = due - dur(p);
  if (hi <= lo) return 1;
  const pos = Math.min(1, Math.max(0, (start - lo) / (hi - lo)));
  const centre = hi - lo < DAY ? 0 : Math.max(0, p.k / (p.n + 1) - 0.3 * p.slip); // under a day: aim at the start
  return Math.exp(-((pos - centre) ** 2) / (2 * 0.2 ** 2));
}

// Leaving a prior costs 1, so a piece moves only with a cause, plus 0.5 a day of distance (capped at a week), so a piece
// that must move takes the nearest good slot, not one days away. A prior that is no longer feasible scores -1000
// or worse, so it loses anyway. Inside the score so every solver move pays it.
export const moveCost = (p: Piece, start: number, _now: number) =>
  p.prior === undefined || p.prior === start ? 0 : 1 + (0.5 * Math.min(Math.abs(start - p.prior), 7 * DAY)) / DAY;

export const lateH = (p: Piece, start: number) => (p.task.deadline === undefined ? 0 : Math.max(0, start + dur(p) - p.task.deadline) / HOUR);

// util is the policy part (UCB minus bell).
export function startValue(p: Piece, start: number, now: number, util: number): number {
  return util + bell(p, now, start) - 1e-4 * Math.max(0, (start - now) / DAY) - 100 * lateH(p, start) - moveCost(p, start, now);
}
