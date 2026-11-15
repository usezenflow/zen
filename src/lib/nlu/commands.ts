import type { Action } from "../types";
import { readActions, type ReadExtra } from "./adapt";
import type { ReaderSource } from "./shared";
import { fold } from "./reader/fold";

// Every line makes something: a note ("ghi chú: …"), else the reader's tasks. Existing tasks are changed by hand, never by voice.
const alt = (...ws: string[]) => [...new Set(ws.flatMap((w) => [w, fold(w).text]))].join("|");
const NOTE = new RegExp(`^(?:${alt("ghi chú", "ghi lại")}|note)\\s*[:,]?\\s*(.+)$`, "s");

export function think(text: string, now: Date, source: ReaderSource = "typed", extra: ReadExtra = {}): Action[] {
  const t = text.trim().normalize("NFC");
  const f = t.toLowerCase();
  const note = NOTE.exec(f);
  if (note) return [{ op: "note", title: f.length === t.length ? t.slice(f.length - note[1].length) : note[1] }]; // the original case
  const a = readActions(text, now, source, extra);
  return a.length ? a : [{ op: "create", title: text.trim() }];
}
