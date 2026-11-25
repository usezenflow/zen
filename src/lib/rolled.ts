import type { Task } from "./types";

/** Blocks passed unfinished and rolled forward, from which a flexible task is asked once what to do with it. */
export const ROLLED_MISSES = 5;

/** The one flexible task rolled five times and not yet asked about: not fixed, no deadline, not a sitting or a split parent. */
export function rolledPick(tasks: Task[]): Task | undefined {
  const parents = new Set(tasks.filter((c) => c.parentId && !c.deletedAt).map((c) => c.parentId));
  return tasks.find((x) => (x.misses ?? 0) >= ROLLED_MISSES && !x.askedRolled && !x.fixed && x.deadline === undefined
    && !x.rrule && !x.seriesId && !x.doneAt && !x.deletedAt && !x.parentId && !parents.has(x.id));
}
