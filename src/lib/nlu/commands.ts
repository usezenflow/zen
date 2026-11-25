import type { Action, Task } from "../types";
import { readActions, type ReadExtra } from "./adapt";
import { splitOf } from "./intent";
import type { ReaderSource } from "./shared";

/**
 * Every line makes at least one task: the reader's, else the whole line as a title with every other field left to defaults.
 * With `tasks`, the parts of a line that clearly name one of them are commands on it (delete, move, rename, done, extend),
 * applied together with the rest, which is read as creates. A line with no command part reads as before.
 * The lines that make nothing: a command taken back ("xoá gym, à thôi"), and a "hoãn gym" (the app hands it to the planner).
 */
export function think(text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}, tasks?: Task[]): Action[] {
  const line = text.trim().replace(/\s+/g, " ") || text;
  // The commands and the creates of the rest. A line with no action left (only a chip, which the app shows) reads as before: never empty.
  const sp = tasks && splitOf(text.trim() || text, now.getTime(), tasks);
  const acts = !sp ? [] : sp.session ? sp.session.actions : [...sp.ones.flatMap((o) => o.actions), ...(sp.rest ? think(sp.rest, now, source, extra) : [])];
  if (acts.length) return acts;
  if ((sp?.cancelled || sp?.later?.length) && !sp.rest) return []; // "xoá gym, à thôi": taken back; "hoãn gym": the planner moves it, nothing is made
  let read: Action[] = [];
  try { read = readActions(text, now, source, extra); } catch { /* a reader bug must not lose what was said */ }
  // a title the reader emptied ("3h mai") is the whole line, keeping the time it read
  // "xong việc nhà" with no task to finish: the reader drops a leading "xong" from the title; the line keeps it.
  const keepXong = (a: Action) => (/^xong\s/i.test(line) && a.title && a.title.length < line.length && line.toLowerCase().endsWith(a.title.toLowerCase()) ? { ...a, title: line } : a);
  const out = read.filter((a) => a.op === "create").map((a) => (a.title?.trim() ? keepXong(a) : { ...a, title: line }));
  return out.length ? out : [{ op: "create", title: line }];
}
