import { addDays, live, startOfDay } from "./cal";
import type { Task } from "@/lib/types";

// A daily repeat with no fixed time shows its next 14 days; the rest fold into one row on the first day past them, which opens in place.
export const FOLD_DAYS = 14;

/** The occurrences of daily flexible repeats past the window (`hidden`), grouped per series; each fold sits on its `first` day. */
export function foldRepeats(tasks: Task[], now: number) {
  const cut = addDays(startOfDay(now), FOLD_DAYS), hidden = new Set<string>(), bySeries = new Map<string, Task[]>();
  for (const x of tasks) {
    if (!live(x) || x.start === undefined || x.start < cut || !x.rrule || !/(^|;)FREQ=DAILY(;|$)/.test(x.rrule) || x.fixed || x.parentId || x.source !== "user") continue;
    const key = x.seriesId ?? `${x.rrule}|${x.title}`; // as apply.ts keys older repeats
    hidden.add(x.id);
    bySeries.set(key, [...(bySeries.get(key) ?? []), x]);
  }
  const folds = [...bySeries].map(([key, xs]) => {
    xs.sort((a, b) => a.start! - b.start!);
    return { key, xs, first: startOfDay(xs[0].start!), last: xs[xs.length - 1].start! };
  });
  return { hidden, folds };
}

/** A split task's open sittings from tomorrow on fold into one row, as repeats past their window do; today's and earlier sittings, done ones and unplaced ones stay rows. */
export function foldSittings(sits: Task[], now: number): { shown: Task[]; folded: Task[] } {
  const cut = addDays(startOfDay(now), 1);
  const folded = sits.filter((x) => !x.doneAt && x.start !== undefined && x.start >= cut).sort((a, b) => a.start! - b.start!);
  const out = new Set(folded);
  return { shown: sits.filter((x) => !out.has(x)), folded };
}
