// magic.html 17-17c: a free gap is offered only while today's work is under a soft, learned line; past it the day rests.
import { addDays, startOfDay } from "../components/cal";
import type { Task } from "./types";

const MIN = 60_000, H = 60 * MIN;
export const REST_BASE = 6 * H; // a full DLU lecture day (7h10 at half) leaves ~2h25 of own work
const STOP = 22; // no gap card runs past 22:00

// Worked ms on the day of `day0` up to `now`: ticked own work from start to tick (a late tick counts its block, an early one its length),
// plus lectures and exams that ended, at half their length. Own intervals are merged so a split and its parent never count twice.
export function worked(tasks: Task[], day0: number, now: number): number {
  const end = Math.min(addDays(day0, 1), now), ps = new Set(tasks.map((x) => x.parentId));
  const own: [number, number][] = [];
  let cls = 0;
  for (const x of tasks) {
    if (x.deletedAt || ps.has(x.id)) continue;
    if (x.fixed === "lecture" || x.fixed === "exam") {
      if (x.start !== undefined && x.end !== undefined && x.end > day0 && x.end <= end) cls += (x.end - Math.max(x.start, day0)) / 2;
    } else if (!x.fixed && x.doneAt !== undefined && x.doneAt >= day0 && x.doneAt < end) {
      const s = x.start !== undefined && x.start <= x.doneAt ? x.start : x.doneAt - x.effort * MIN;
      const e = x.end !== undefined && x.start !== undefined && x.start <= x.doneAt ? Math.min(x.doneAt, x.end) : x.doneAt;
      own.push([Math.max(s, day0), e]);
    }
  }
  own.sort((a, b) => a[0] - b[0]);
  let sum = 0, cs = 0, ce = 0;
  for (const [s, e] of own) {
    if (s > ce) { sum += Math.max(0, ce - cs); cs = s; ce = e; } else ce = Math.max(ce, e);
  }
  return sum + Math.max(0, ce - cs) + cls;
}

// The line: 6h until 5 working days are seen, then the 60th percentile of the last 14 working days (3h to 10h). `more`: what swipes added.
export function restLine(tasks: Task[], now: number, more = 0): number {
  const today = startOfDay(now);
  const days = Array.from({ length: 14 }, (_, i) => worked(tasks, addDays(today, -1 - i), today)).filter((w) => w > 0).sort((a, b) => a - b);
  const base = days.length < 5 ? REST_BASE : Math.min(10 * H, Math.max(3 * H, days[Math.floor(days.length * 0.6)]));
  return base + more;
}

// The open flexible task from a later day (or still without a time) that fits now..until, due soonest first (a prep by its exam),
// then the earliest planned. Never a repeat, a said window, a hand-placed or pinned task.
export function gapPick(tasks: Task[], now: number, until = Infinity): { task: Task; len: number; free: number } | undefined {
  const tomorrow = addDays(startOfDay(now), 1), to = Math.min(until, startOfDay(now) + STOP * H), free = to - now;
  if (free < 15 * MIN) return undefined;
  const ps = new Set(tasks.map((x) => x.parentId)), byId = new Map(tasks.map((x) => [x.id, x]));
  const due = (x: Task) => x.deadline ?? (x.forId ? byId.get(x.forId)?.start : undefined) ?? Infinity;
  return tasks
    .filter((x) => !x.doneAt && !x.deletedAt && !x.fixed && !x.pinned && !ps.has(x.id) && !x.rrule && !x.seriesId && !x.tods?.length
      && !(x.notBefore !== undefined && x.notBefore > now) && !x.userEdited?.includes("start") && (x.start === undefined || x.start >= tomorrow))
    .map((x) => ({ task: x, len: x.start !== undefined && x.end !== undefined ? x.end - x.start : x.effort * MIN, free }))
    .filter((c) => c.len > 0 && c.len <= free && !(c.task.deadline !== undefined && c.task.deadline < now + c.len))
    .sort((a, b) => due(a.task) - due(b.task) || (a.task.start ?? Infinity) - (b.task.start ?? Infinity))[0];
}
