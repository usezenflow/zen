import type { Task } from "./types";
import { dueOf } from "../planner/features";

const HOUR_MS = 3600_000;
const dayStart = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();

/** The task to show now, in order: a fixed block running; a flexible block running; an unscheduled task due within 3h (overdue included);
 *  else the earliest upcoming task today by start. A task waiting for an open predecessor (`after`) is no candidate. */
export function pickNow(tasks: Task[], now: number): Task | undefined {
  const ps = new Set(tasks.map((c) => c.parentId));
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const open = tasks.filter((x) => !x.doneAt && !x.deletedAt && !ps.has(x.id)
    && !x.after?.some((id) => { const p = byId.get(id); return p && !p.doneAt && !p.deletedAt; }));
  const timed = open.filter((x) => x.start !== undefined && x.end !== undefined);
  const running = timed.find((x) => x.fixed && x.start! <= now && now < x.end!) ?? timed.find((x) => x.start! <= now && now < x.end!);
  if (running) return running;
  const due = open.filter((x) => x.start === undefined && dueOf(x) !== undefined && dueOf(x)! - now <= 3 * HOUR_MS)
    .sort((a, b) => dueOf(a)! - dueOf(b)!)[0];
  if (due) return due;
  return timed.filter((x) => x.start! > now && dayStart(x.start!) === dayStart(now))
    .sort((a, b) => a.start! - b.start!)[0];
}
