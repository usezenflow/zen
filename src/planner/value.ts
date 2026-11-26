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
  gaps?: { from: number; to: number }[]; // a pull: the freed times it may take, and only earlier than its prior (unscheduled: a start inside one)
  avoid?: { from: number; to: number }[]; // slots the user just set a task off by hand: a start over one costs more (moveCost)
  slow?: number; // a guessed length ran past the guess for this kind (fallacy, habits.ts): the length is said so, never a number
  aim?: number; // where in the window this kind is aimed, learned (aimOf, habits.ts); SOFT_AIM when cold
}

export const dur = (p: Piece) => p.effort * MIN;

// A said due within 30 days: aim at this share of the window from its start (or creation) to the due, so the work lands
// before the last days. A preference only: the hard deadline (lateH) stays as said.
export const SOFT_AIM = 0.75;

export function bell(p: Piece, now: number, start: number): number {
  const t = p.task;
  // A series with no due spreads over the 30 days place.ts scans (shortcut: the window starts at `now`, so it slides a little per replan; the prior's move cost holds a placed sitting still).
  const open = dueOf(t) === undefined && !!t.parentId && !t.rrule;
  const due = open ? now + 30 * DAY : dueOf(t);
  if (due === undefined) return 0; // a repeat's day bound pulls nowhere: place.ts keeps it inside the day
  const lo = open ? now : Math.max(t.createdAt, t.notBefore ?? t.createdAt); // not `now`: the curve must not drift between replans
  const hi = due - dur(p);
  if (hi <= lo) return 1;
  const pos = Math.min(1, Math.max(0, (start - lo) / (hi - lo)));
  const slip = 0.3 * p.slip;
  let centre: number;
  if (hi - lo < DAY) centre = 0; // under a day: aim at the start
  else if (!open && due - now <= 30 * DAY) centre = Math.max(0, Math.min(1, ((p.aim ?? SOFT_AIM) * p.k) / Math.max(1, p.n) * (due - lo) / (hi - lo)) - slip);
  else centre = Math.max(0, p.k / (p.n + 1) - slip);
  // Cold (no learned aim: a last-minute finisher keeps their own), with room to spare (2+ days) the aim never reaches the last EARLY_BUFFER: "trước 1/12" is prepared well before the 30th, never on its eve.
  if (!open && p.aim === undefined && hi - lo >= 2 * DAY) centre = Math.min(centre, Math.max(0, (hi - lo - EARLY_BUFFER) / (hi - lo)));
  return Math.exp(-((pos - centre) ** 2) / (2 * 0.2 ** 2));
}

// Leaving a prior costs 1, so a piece moves only with a cause, plus 0.5 a day of distance (capped at a week), so a piece
// that must move takes the nearest good slot, not one days away. A prior that is no longer feasible scores -1000
// or worse, so it loses anyway. Inside the score so every solver move pays it.
// A pull (freed time): a zen-placed piece may take only a start inside the gap, or stay at its prior; an unscheduled one takes any cell,
// with the gap as a bonus. A start inside the gap is the cause itself, so free; staying put costs one, as a move would.
const inGap = (p: Piece, start: number) => !!p.gaps?.some((g) => start >= g.from && start + dur(p) <= g.to);
export const pullOk = (p: Piece, start: number) => !p.gaps || p.prior === undefined || start === p.prior || inGap(p, start);
// Soft: a start over a slot the user just left costs 2; an earlier move than its prior costs 0.5 more (drags teach the hour, this keeps the day).
export const moveCost = (p: Piece, start: number, _now: number) => {
  const hit = ((p.avoid ?? []).some((v) => start < v.to && start + dur(p) > v.from) ? 2 : 0);
  if (p.gaps && p.prior === undefined) return (inGap(p, start) ? 0 : 1) + hit;
  if (inGap(p, start)) return hit;
  if (p.prior === undefined || p.prior === start) return (p.gaps ? 1 : 0) + hit;
  return 1 + hit + (0.5 * Math.min(Math.abs(start - p.prior), 7 * DAY)) / DAY + (start < p.prior ? 0.5 : 0);
};

// A dated sitting that ends inside the margin before its due pays EDGE.w (0.5) per hour of margin it uses: a soft preference for room to spare.
// Soft: never refuses a start, so an edge slot is still taken when nothing earlier is free. Exempt: a prep (its 22:00 cap is the margin)
// and a piece that cannot move earlier anyway (notBefore at or after due minus length).
export const EDGE = { w: 0.5 }; // a mutable holder so a test can switch the margin off (w: 0)
export const edgeCost = (p: Piece, start: number) => {
  const due = dueOf(p.task);
  if (due === undefined || p.task.forId || (p.task.notBefore ?? -Infinity) >= due - dur(p)) return 0;
  const margin = Math.max(30 * MIN, 0.25 * dur(p)), end = start + dur(p);
  return (EDGE.w * Math.max(0, Math.min(end, due) - Math.max(start, due - margin))) / HOUR;
};

// Overdue (deadline already past): every start is late, so the hour cliff would pull it to the earliest slot and evict locked work. A gentle -1.5 a day instead (startValue scales by 100).
export const lateH = (p: Piece, start: number, now?: number) => {
  if (p.task.deadline === undefined) return 0;
  if (now !== undefined && p.task.deadline < now) return (1.5 / 100) * Math.max(0, start - now) / DAY;
  return Math.max(0, start + dur(p) - p.task.deadline) / HOUR;
};

export const EARLY_BUFFER = 1.5 * DAY; // a deadline is aimed to land this much before it, leaving breathing room
// Behind pace per family (a split's sittings, else the task itself; key parentId ?? id): the share of its effort it should have done by now, not yet done. 0 when on pace or undated.
export function behindOf(tasks: Task[], now: number): Map<string, number> {
  const live = tasks.filter((t) => !t.deletedAt), out = new Map<string, number>();
  for (const t of live) {
    if (t.deadline === undefined || t.rrule) continue;
    const key = t.parentId ?? t.id;
    if (out.has(key)) continue;
    const kids = live.filter((x) => x.parentId === key), group = kids.length ? kids : [t];
    const total = group.reduce((s, x) => s + x.effort, 0), done = group.reduce((s, x) => s + (x.doneAt !== undefined ? x.effort : 0), 0);
    const window = t.deadline - EARLY_BUFFER - t.createdAt;
    out.set(key, total <= 0 || window <= 0 ? 0 : Math.max(0, (total * (now - t.createdAt)) / window - done) / total);
  }
  return out;
}

// util is the policy part (UCB minus bell). W_LEARN: learned util is small next to the move and bell costs, so it is scaled up to decide.
export const W_LEARN = 4;
export function startValue(p: Piece, start: number, now: number, util: number, boost = 0): number {
  return W_LEARN * util + bell(p, now, start) - 1e-4 * Math.max(0, (start - now) / DAY) - 100 * lateH(p, start, now) - moveCost(p, start, now) - edgeCost(p, start) + boost;
}
