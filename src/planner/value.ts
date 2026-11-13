import type { Task } from "../lib/types";
import { DAY, HOUR, MIN, dayStart } from "./features";

export interface Piece {
  id: string;
  task: Task;
  effort: number; // minutes, positive multiple of 15
  k: number; // 1-based sitting index
  n: number; // sittings of the parent
  prior?: number; // current start
  slip: number;
  missed?: number; // old start of a task that ended unfinished: replanned, told so
}

export const dur = (p: Piece) => p.effort * MIN;

export function bell(p: Piece, now: number, start: number): number {
  const t = p.task;
  if (t.deadline === undefined) return 0;
  const lo = Math.max(now, t.notBefore ?? now);
  const hi = t.deadline - dur(p);
  if (hi <= lo) return 1;
  const pos = Math.min(1, Math.max(0, (start - lo) / (hi - lo)));
  const centre = Math.max(0, p.k / (p.n + 1) - 0.3 * p.slip);
  return Math.exp(-((pos - centre) ** 2) / (2 * 0.2 ** 2));
}

export const MOVE_COST = 0.15;
// Leaving a prior costs MOVE_COST, so only a clear gain moves it; today's prior is locked (1.0). A prior that is
// no longer feasible scores -1000 or worse, so it loses anyway. Inside the score so every solver move pays it.
export const moveCost = (p: Piece, start: number, now: number) =>
  p.prior === undefined || p.prior === start ? 0 : dayStart(p.prior) === dayStart(now) ? 1 : MOVE_COST;

export const lateH = (p: Piece, start: number) => (p.task.deadline === undefined ? 0 : Math.max(0, start + dur(p) - p.task.deadline) / HOUR);

// util is the policy part (UCB minus bell).
export function startValue(p: Piece, start: number, now: number, util: number): number {
  return util + bell(p, now, start) - 1e-4 * Math.max(0, (start - now) / DAY) - 100 * lateH(p, start) - moveCost(p, start, now);
}
