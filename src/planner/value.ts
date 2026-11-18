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
  gap?: { from: number; to: number }; // a pull: the freed time it may take, and only earlier than its prior (unscheduled: a start inside it)
  avoid?: { from: number; to: number }[]; // slots the user just set a task off by hand: a start over one costs more (moveCost)
}

export const dur = (p: Piece) => p.effort * MIN;

// A said due within 30 days: aim at this share of the window from its start (or creation) to the due, so the work lands
// before the last days. A preference only: the hard deadline (lateH) stays as said.
export const SOFT_AIM = 0.75;

export function bell(p: Piece, now: number, start: number): number {
  const t = p.task;
  const due = dueOf(t);
  if (due === undefined) return 0; // a repeat's day bound pulls nowhere: place.ts keeps it inside the day
  const lo = Math.max(t.createdAt, t.notBefore ?? t.createdAt); // not `now`: the curve must not drift between replans
  const hi = due - dur(p);
  if (hi <= lo) return 1;
  const pos = Math.min(1, Math.max(0, (start - lo) / (hi - lo)));
  const slip = 0.3 * p.slip;
  let centre: number;
  if (hi - lo < DAY) centre = 0; // under a day: aim at the start
  else if (due - now <= 30 * DAY) centre = Math.max(0, Math.min(1, (SOFT_AIM * p.k) / Math.max(1, p.n) * (due - lo) / (hi - lo)) - slip);
  else centre = Math.max(0, p.k / (p.n + 1) - slip);
  return Math.exp(-((pos - centre) ** 2) / (2 * 0.2 ** 2));
}

// Leaving a prior costs 1, so a piece moves only with a cause, plus 0.5 a day of distance (capped at a week), so a piece
// that must move takes the nearest good slot, not one days away. A prior that is no longer feasible scores -1000
// or worse, so it loses anyway. Inside the score so every solver move pays it.
// A pull (freed time): a zen-placed piece may take only a start inside the gap, or stay at its prior; an unscheduled one takes any cell,
// with the gap as a bonus. A start inside the gap is the cause itself, so free; staying put costs one, as a move would.
const inGap = (p: Piece, start: number) => !!p.gap && start >= p.gap.from && start + dur(p) <= p.gap.to;
export const pullOk = (p: Piece, start: number) => !p.gap || p.prior === undefined || start === p.prior || inGap(p, start);
// Soft: a start over a slot the user just left costs 2; an earlier move than its prior costs 0.5 more (drags teach the hour, this keeps the day).
export const moveCost = (p: Piece, start: number, _now: number) => {
  const hit = (p.avoid ?? []).some((v) => start < v.to && start + dur(p) > v.from) ? 2 : 0;
  if (p.gap && p.prior === undefined) return (inGap(p, start) ? 0 : 1) + hit;
  if (inGap(p, start)) return hit;
  if (p.prior === undefined || p.prior === start) return (p.gap ? 1 : 0) + hit;
  return 1 + hit + (0.5 * Math.min(Math.abs(start - p.prior), 7 * DAY)) / DAY + (start < p.prior ? 0.5 : 0);
};

export const lateH = (p: Piece, start: number) => (p.task.deadline === undefined ? 0 : Math.max(0, start + dur(p) - p.task.deadline) / HOUR);

// util is the policy part (UCB minus bell). W_LEARN: learned util is small next to the move and bell costs, so it is scaled up to decide.
export const W_LEARN = 4;
export function startValue(p: Piece, start: number, now: number, util: number): number {
  return W_LEARN * util + bell(p, now, start) - 1e-4 * Math.max(0, (start - now) / DAY) - 100 * lateH(p, start) - moveCost(p, start, now);
}
