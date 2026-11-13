import type { Task } from "../types";
import type { Fetched } from "./client";
import { preps } from "../../planner/prep";
import { lmsCoverageEnd } from "./season";

const ASSIGN_EFFORT = 45; // minutes; the planner resizes
const ASSIGN_SITTING = 45;

const idOf = (key: string) => `dlu:${key}`;
const sourceOf = (key: string) => (key.startsWith("lms:") ? "lms" : "portal");

function fromItem(i: Fetched[number], now: number): Task {
  const start = i.scheduledStartTime.getTime();
  const base = { id: idOf(i.externalKey), title: i.title, kind: "study" as const, source: "dlu" as const, upstreamKey: i.externalKey, createdAt: now };
  if (i.type === "PLAN") {
    return { ...base, effort: ASSIGN_EFFORT, maxSitting: ASSIGN_SITTING, deadline: start, ...(i.submitted ? { doneAt: now } : {}) };
  }
  const end = start + i.durationMinutes * 60_000;
  return { ...base, effort: i.durationMinutes, fixed: i.type === "EXAM" ? "exam" : "lecture", start, end, ...(i.type === "EXAM" ? { deadline: start, ...(i.examFormat ? { format: i.examFormat } : {}) } : {}) };
}

/** Upstream-owned fields; a field in `userEdited` is never overwritten. Planner-owned `start`/`effort` of a flexible task are untouched. */
function merge(old: Task, next: Task): Task {
  const edited = new Set(old.userEdited);
  const out: Task = { ...old };
  const set = <K extends keyof Task>(k: K, v: Task[K]) => {
    if (!edited.has(k)) out[k] = v;
  };
  set("title", next.title);
  set("deadline", next.deadline);
  if (next.format) set("format", next.format);
  if (next.fixed) {
    set("fixed", next.fixed);
    set("start", next.start);
    set("end", next.end);
    set("effort", next.effort);
  }
  if (next.doneAt && !old.doneAt) set("doneAt", next.doneAt);
  if (old.deletedAt && !old.userEdited?.length) out.deletedAt = undefined;
  return out;
}

const same = (a: Task, b: Task) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Diff fetched items against stored tasks by upstreamKey. Upserts are new or changed tasks;
 * deletes are ids of future upstream tasks that disappeared from a source that fetched cleanly
 * (caller soft-deletes them).
 */
export function materialize(items: Fetched, tasks: Task[], now = Date.now(), weak = 0.5): { upserts: Task[]; deletes: string[] } {
  const byKey = new Map(tasks.filter((t) => t.upstreamKey).map((t) => [t.upstreamKey!, t]));
  const seen = new Set<string>();
  const upserts: Task[] = [];

  for (const i of items) {
    seen.add(i.externalKey);
    const next = fromItem(i, now);
    const old = byKey.get(i.externalKey);
    if (!old) upserts.push(next);
    else {
      const merged = merge(old, next);
      if (!same(old, merged)) upserts.push(merged);
    }
  }

  const failed = new Set(items.failed);
  const lmsEnd = lmsCoverageEnd(now);
  const deletes = tasks
    .filter((t) => {
      const key = t.upstreamKey;
      if (!key || t.source !== "dlu" || t.deletedAt || t.doneAt || seen.has(key) || failed.has(sourceOf(key))) return false;
      const at = t.start ?? t.deadline;
      // Past items drop out of the feed by design; LMS only covers this and next month.
      return at !== undefined && at > now && (sourceOf(key) !== "lms" || at < lmsEnd);
    })
    .map((t) => t.id);

  // Preps follow their exam: added when it appears, resized when it moves, dropped when it goes.
  const gone = new Set(deletes);
  const exams = new Map(tasks.filter((t) => t.fixed === "exam" && t.source === "dlu").map((t) => [t.id, t]));
  for (const u of upserts) if (u.fixed === "exam") exams.set(u.id, u);
  const prepOf = new Map(tasks.filter((t) => t.id.startsWith("prep:")).map((t) => [t.id, t]));
  const kids = (id: string) => tasks.filter((t) => t.parentId === id && !t.deletedAt && !t.doneAt).map((t) => t.id);
  for (const e of exams.values()) {
    const old = prepOf.get(`prep:${e.id}`);
    const live = !e.deletedAt && !gone.has(e.id) && e.start! > now;
    const [want] = live ? preps(e, weak) : [];
    if (want && !old) upserts.push(want);
    else if (want && old && !old.deletedAt && !old.doneAt && (old.deadline !== want.deadline || old.effort !== want.effort)) {
      upserts.push({ ...old, deadline: want.deadline, effort: want.effort, title: want.title });
      deletes.push(...kids(old.id)); // resplit at the new size
    } else if (!want && old && !old.deletedAt && !old.doneAt && (e.deletedAt || gone.has(e.id))) {
      deletes.push(old.id, ...kids(old.id));
    }
  }
  return { upserts, deletes };
}
