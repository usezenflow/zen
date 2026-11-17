// A reason may only be said while the fact its wording asserts is true of the task now. One predicate per key: adding a ReasonKey
// without one fails to compile, so no emitter can state a claim nothing checks. Written once in the planner, read again on screen.
import type { Reason, ReasonKey, Rule, Task } from "../lib/types";

export interface Facts { task: Task; start: number; rules: Rule[] }

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
  hour: (r) => (vnum(r, "n") ?? 0) >= 1,
  similar: (r) => (vnum(r, "n") ?? 0) >= 1,
  after: (r) => has(r, "prev") && r.vars!.prev !== "other",
  pace: (r) => (vnum(r, "n") ?? 0) > 1,
  deadline: (r) => has(r, "due") || has(r, "left"),
  late: (r) => has(r, "due") || has(r, "left"),
  load: (r) => has(r, "h"),
  missed: (r) => has(r, "time"),
  packed: (r) => has(r, "was") && has(r, "to"),
  fit: (r) => has(r, "len"),
  over: () => true,
  explore: () => true,
  energy: () => true, weekend: () => true, busy: () => true, gap: () => true, stable: () => true,
  guess: () => true, // the honest default
};

/** The reasons that are still true of this task at `start`; none left means say nothing. */
export const grounded = (why: Reason[] | undefined, f: Facts) => (why ?? []).filter((r) => HOLDS[r.key](r, f));
