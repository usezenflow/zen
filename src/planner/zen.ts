// Evidence-based zen rules: each rule's weight is 0 unless the user's own history shows that breaking it lowers completion (auto), or the user set it strict.
import { areaOf, areaShare, DEFAULT_AREAS, type Area } from "../lib/area";
import type { Task, TaskEvent } from "../lib/types";

export type ZenRule = "rest" | "early" | "night" | "balance";
export type ZenMode = "off" | "auto" | "strict";
export const ZEN_RULES: ZenRule[] = ["rest", "early", "night", "balance"];
export const STRICT_WEIGHT = 2.5;

const DAY = 24 * 60 * 60_000;
const PRIOR = 3; // Beta(3,3) prior on each completion rate
const MIN_DROP = 0.1, GAIN = 3, MAX_WEIGHT = 1.5;

/** The rule holds for a planned task (true), breaks it (false), or does not apply (undefined). */
type Keeps = (t: Task) => boolean | undefined;

/**
 * Weight per rule, 0..2.5. Auto: Δ = p_keep - p_break on completion rate (Beta(3,3) shrunk); weight = clamp(3·max(0, Δ - 0.10), 0, 1.5).
 * Auto is 0 when either group is empty, so a history with no contrast says nothing. Strict is 2.5; off is 0.
 */
export function zenWeights(tasks: Task[], events: TaskEvent[], now: number, modes: Record<ZenRule, ZenMode>, areas: Area[] = DEFAULT_AREAS): Record<ZenRule, number> {
  const live = tasks.filter((t) => !t.deletedAt);
  const parents = new Set(live.map((t) => t.parentId).filter((x): x is string => !!x));
  const done = new Set(events.filter((e) => e.type === "done").map((e) => e.taskId));
  for (const t of live) if (t.doneAt !== undefined) done.add(t.id);
  // Planned and past: a split's parent is judged through its sittings, so it is left out.
  const seen = live.filter((t) => !t.fixed && t.start !== undefined && t.start < now && !parents.has(t.id));

  const shares = areaShare(live, areas, now);
  const targetOf = new Map(areas.map((a) => [a.id, (a.targetPct ?? 0) / 100]));
  const hour = (t: Task) => new Date(t.start!).getHours();
  const keeps: Record<ZenRule, Keeps> = {
    rest: (t) => { const d = new Date(t.start!).getDay(); return d !== 0 && d !== 6; },
    night: (t) => { const h = hour(t); return h >= 5 && h < 22; },
    early: (t) => (t.deadline === undefined ? undefined : t.deadline - t.start! >= 1.5 * DAY),
    balance: (t) => {
      const a = areaOf(t, areas);
      const target = a ? targetOf.get(a.id) ?? 0 : 0;
      return a && target > 0 ? (shares[a.id] ?? 0) <= target : undefined;
    },
  };

  const out = {} as Record<ZenRule, number>;
  for (const rule of ZEN_RULES) {
    const mode = modes[rule];
    if (mode === "off") { out[rule] = 0; continue; }
    if (mode === "strict") { out[rule] = STRICT_WEIGHT; continue; }
    const groups = { keep: { n: 0, k: 0 }, break: { n: 0, k: 0 } };
    for (const t of seen) {
      const kept = keeps[rule](t);
      if (kept === undefined) continue;
      const g = kept ? groups.keep : groups.break;
      g.n++;
      if (done.has(t.id)) g.k++;
    }
    if (groups.keep.n === 0 || groups.break.n === 0) { out[rule] = 0; continue; }
    const p = (g: { n: number; k: number }) => (g.k + PRIOR) / (g.n + 2 * PRIOR);
    const delta = p(groups.keep) - p(groups.break);
    out[rule] = Math.min(MAX_WEIGHT, Math.max(0, GAIN * (Math.max(0, delta - MIN_DROP))));
  }
  return out;
}
