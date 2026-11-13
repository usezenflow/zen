import type { Action, Kind } from "../types";
import { read } from "./reader/reader";
import type { ReaderItem, ReaderItemType, ReaderResult, ReaderWC, ReaderWindow } from "./shared";

// App time is fixed UTC+7 (see dlu/parse/time.ts); the reader works in wall clock.
const wallClock = (now: Date): ReaderWC => {
  const t = new Date(now.getTime() + 7 * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
};

const iso = (s: string) => `${s.replace(" ", "T")}${s.length === 16 ? ":00" : ""}`;
const START: Record<ReaderWindow, string> = {
  EARLY_MORNING: "05:00", DAWN: "05:00", MORNING: "08:00", NOON: "11:30",
  AFTERNOON: "14:00", EVENING: "18:00", NIGHT: "20:00", MIDNIGHT: "23:00",
};
const KIND: Partial<Record<ReaderItemType, Kind>> = { EXAM: "study", ASSIGNMENT: "study", LECTURE: "study" };

export function itemAction(it: ReaderItem): Action {
  const a: Action = { op: "create", title: it.title };
  const kind = KIND[it.type];
  if (kind) a.kind = kind;
  // Fixed items carry a start; flexible ones may carry a day plus a clock or part of day.
  const day = it.days?.[0];
  const at = it.startsAt ? iso(it.startsAt) : day && `${day}T${it.clocks?.[0]?.from ?? START[it.windows?.[0] as ReaderWindow] ?? "09:00"}:00`;
  if (at) a.when = at;
  if (it.deadline) a.deadline = iso(it.deadline);
  if (it.durationMinutes) a.effortMinutes = it.durationMinutes;
  if (it.rrule) a.repeat = it.rrule;
  return a;
}

/** The reader's full result for one typed utterance; empty when it finds nothing. Never throws. */
export function readFull(text: string, now: Date): ReaderResult {
  try {
    return read(text, { ref: wallClock(now), source: "typed" });
  } catch {
    return { items: [], dropped: [], mentions: [], repairs: [] };
  }
}

/** Rule-based reading of one utterance; empty when the reader finds nothing. Never throws. */
export const readActions = (text: string, now: Date): Action[] => readFull(text, now).items.map(itemAction);

/** The text with the reader's typo repairs applied. */
export const repaired = (text: string, r: ReaderResult) =>
  [...r.repairs].sort((a, b) => b.start - a.start).reduce((s, x) => s.slice(0, x.start) + x.to + s.slice(x.end), text);

const BRIEF = ["type", "title", "startsAt", "deadline", "notBefore", "days", "windows", "clocks", "rrule", "durationMinutes", "inferred", "flags"] as const;

/** What the reader understood about one item, set fields only, for the model's prompt. */
export function brief(it: ReaderItem): Partial<ReaderItem> {
  const out: Record<string, unknown> = {};
  for (const k of BRIEF) {
    const v = it[k];
    if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) out[k] = v;
  }
  return out;
}
