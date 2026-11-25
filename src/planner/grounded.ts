// A reason may only be said while the fact its wording asserts is true of the task now. One predicate per key: adding a ReasonKey
// without one fails to compile, so no emitter can state a claim nothing checks. Written once in the planner, read again on screen.
import { examOn, holidayOn } from "../lib/rest";
import type { Reason, ReasonKey, Rule, Task } from "../lib/types";
import { MIN, PART4, dayStart, dayType, hourOf, partIdx } from "./features";
import { backToBack, batchKind } from "./place";

// tasks: every task, with planned starts and ends: batch reads the neighbour it names, and the exam check a fixed exam the day after the
// reason's day. A holiday or exam reason names its day in vars.day.
export interface Facts { task: Task; start: number; rules: Rule[]; tasks?: Task[] }

const vnum = (r: Reason, k: string) => (typeof r.vars?.[k] === "number" ? (r.vars[k] as number) : undefined);
const has = (r: Reason, k: string) => r.vars?.[k] !== undefined && r.vars[k] !== "";
// "trong hôm nay", "mai": a window to 23:59 is the whole day, not a part of it. Only sáng/chiều/tối (or a said part list) is "the part you said".
const part = (t: Task) => (t.tods?.length ?? 0) > 0 || (t.notAfter !== undefined && ![0, 1439].includes(new Date(t.notAfter).getHours() * 60 + new Date(t.notAfter).getMinutes()));

export const HOLDS: Record<ReasonKey, (r: Reason, f: Facts) => boolean> = {
  said: (_, f) => part(f.task),
  chose: (_, f) => !!f.task.userEdited?.includes("start") && f.task.start === f.start,
  pinned: (_, f) => !!f.task.pinned && f.task.start === f.start,
  rule: (r, f) => f.rules.some((x) => x.text === r.vars?.text),
  kind: (r) => r.vars?.kind !== undefined && r.vars.kind !== "other", // "Hợp việc khác" says nothing
  hour: (r) => (vnum(r, "n") ?? 0) >= 1 || has(r, "avoid"), // avoid: the part work keeps slipping out of (explain.ts)
  similar: (r) => (vnum(r, "n") ?? 0) >= 1,
  after: (r) => has(r, "prev") && r.vars!.prev !== "other",
  pace: (r) => (vnum(r, "n") ?? 0) > 1,
  deadline: (r) => has(r, "due") || has(r, "left") || r.vars?.urgent === 1, // urgent: a higher-priority deadline placed on a skipped day
  // catch: placed today to make up for a task that already slipped
  late: (r, f) => has(r, "due") || has(r, "left") || (r.vars?.catch === 1 && (f.task.misses ?? 0) > 0),
  load: (r) => has(r, "h"),
  holiday: (r) => { const d = vnum(r, "day"); return d !== undefined && holidayOn(d) !== undefined; },
  exam: (r, f) => { const d = vnum(r, "day"); return d !== undefined && !!f.tasks && examOn(f.tasks, d); },
  missed: (r) => has(r, "time"),
  missed3: (_, f) => (f.task.misses ?? 0) >= 3,
  packed: (r) => has(r, "was") && has(r, "to"),
  fit: (r) => has(r, "len") && (!has(r, "slow") || (vnum(r, "slow") ?? 0) > 1), // "bạn hay cần lâu hơn" only with a learned ratio above 1
  over: () => true,
  explore: () => true,
  energy: () => true, weekend: () => true, busy: () => true, gap: () => true, stable: () => true,
  guess: () => true, // the honest default
  // a named neighbour is an errand or finance piece back to back with this one, in the same outing
  batch: (r, f) => batchKind(f.task.kind) && (f.tasks ?? []).some((n) => n.title === r.vars?.title && n.id !== f.task.id && n.start !== undefined && n.end !== undefined && batchKind(n.kind)
    && backToBack({ start: f.start, end: f.start + f.task.effort * MIN }, { start: n.start, end: n.end })),
};

// A reason about a time of day or kind of day (vars.pn, vars.dt) is for that time: moved to another part or day, it is no longer true.
// vars.on (the day it was placed on, explain.ts) is for that day: moved to another day, a day or part reason is stale.
const there = (r: Reason, f: Facts) => (r.vars?.pn === undefined || r.vars.pn === PART4[partIdx(hourOf(f.start))]) && (r.vars?.dt === undefined || r.vars.dt === dayType(new Date(f.start).getDay()))
  && (r.vars?.on === undefined || r.vars.on === dayStart(f.start));

/** The reasons that are still true of this task at `start`; none left means say nothing. */
export const grounded = (why: Reason[] | undefined, f: Facts) => (why ?? []).filter((r) => there(r, f) && HOLDS[r.key](r, f));
