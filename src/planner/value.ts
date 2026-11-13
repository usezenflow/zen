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

// util is the policy part (UCB or heuristic minus bell).
export function startValue(p: Piece, start: number, now: number, util: number): number {
  const late = p.task.deadline === undefined ? 0 : Math.max(0, start + dur(p) - p.task.deadline) / HOUR;
  let stab = 0;
  if (p.prior !== undefined && p.prior !== start && p.prior - now <= DAY) {
    const age = Math.max(0, now - p.task.createdAt) / HOUR;
    const cross = dayStart(p.prior) !== dayStart(start) ? 1 : 0;
    stab = 0.1 * Math.exp(-age / 48) * (1 + Math.abs(start - p.prior) / HOUR + 10 * cross);
  }
  return util + bell(p, now, start) - 1e-4 * Math.max(0, (start - now) / DAY) - 100 * late - stab;
}
