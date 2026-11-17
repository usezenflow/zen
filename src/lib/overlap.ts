import * as store from "./store";
import type { Task } from "./types";

const KEY = "overlap.dismissed";

export interface Overlap { mine: Task; fixed: Task }

const live = (x: Task) => !x.doneAt && !x.deletedAt;
const pair = (o: Overlap) => `${o.mine.id}|${o.fixed.id}`;

/** Tasks (end still ahead, even if the start was dragged into the past) the user pinned (userEdited has "start") that overlap a fixed upstream lecture/exam. */
export function overlaps(tasks: Task[], now: number, dismissed: Iterable<string> = []): Overlap[] {
  const skip = new Set(dismissed);
  const fixed = tasks.filter((x) => live(x) && x.source === "dlu" && x.fixed && x.end! > now);
  const out: Overlap[] = [];
  for (const mine of tasks) {
    const own = mine.fixed === "busy" && mine.source === "user"; // the user's own busy block counts like a hand-timed task
    if (!live(mine) || (mine.fixed && !own) || (!own && !mine.userEdited?.includes("start")) || mine.start === undefined || mine.end === undefined || mine.end <= now) continue;
    for (const f of fixed) if (mine.start < f.end! && f.start! < mine.end) out.push({ mine, fixed: f });
  }
  return out.filter((o) => !skip.has(pair(o)));
}

export async function dismissedOverlaps(): Promise<string[]> {
  try { return JSON.parse((await store.kvGet(KEY)) ?? "[]"); } catch { return []; }
}

/** Current warnings, minus the ones the user chose to keep. */
export async function pendingOverlaps(now = Date.now()): Promise<Overlap[]> {
  return overlaps(await store.allTasks(), now, await dismissedOverlaps());
}

/** "Keep both": persisted so the warning does not return. */
export async function keepBoth(o: Overlap) {
  await store.kvSet(KEY, JSON.stringify([...new Set([...(await dismissedOverlaps()), pair(o)])]));
}
