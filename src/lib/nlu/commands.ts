import type { Action } from "../types";
import { readActions, type ReadExtra } from "./adapt";
import type { ReaderSource } from "./shared";

/**
 * Every line makes at least one task: the reader's, else the whole line as a title with every other field left to defaults.
 * Existing tasks are changed by hand, never by voice.
 */
export function think(text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}): Action[] {
  const line = text.trim().replace(/\s+/g, " ") || text;
  let read: Action[] = [];
  try { read = readActions(text, now, source, extra); } catch { /* a reader bug must not lose what was said */ }
  // a title the reader emptied ("3h mai") is the whole line, keeping the time it read
  const out = read.filter((a) => a.op === "create").map((a) => (a.title?.trim() ? a : { ...a, title: line }));
  return out.length ? out : [{ op: "create", title: line }];
}
