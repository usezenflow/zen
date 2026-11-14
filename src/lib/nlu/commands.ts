import type { Action } from "../types";
import { readActions, type ReadExtra } from "./adapt";
import type { ReaderSource } from "./shared";
import { fold } from "./reader/fold";

// Pure rule-based voice commands: done / delete / move / note on existing tasks, else the reader's creates.
export type Known = { id: string; title: string; start?: number };

const words = (s: string) => fold(s).text.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1);

/** The task whose title words the phrase covers best (at least half); ties go to the earliest in `tasks`. */
export function target(phrase: string, tasks: Known[]): Known | undefined {
  const hay = new Set(words(phrase));
  let best: Known | undefined, top = 0;
  for (const x of tasks) {
    const w = words(x.title);
    const s = w.length ? w.filter((y) => hay.has(y)).length / w.length : 0;
    if (s > top) { top = s; best = x; }
  }
  return top >= 0.5 ? best : undefined;
}

const DONE = [/^(?:(?:da|vua|minh)\s+)?(?:lam\s+)?(?:xong|hoan thanh)\s+(.+)$/, /^(?:(?:da|vua|minh)\s+)?(?:lam\s+)?(.+?)\s+(?:xong|hoan thanh)(?:\s+(?:roi|nhe|nha))?$/];
const DELETE = /^(?:xoa|huy|bo)\s+(?:lich\s+|viec\s+)?(.+?)(?:\s+(?:di|nhe|nha))?$/;
const MOVE = /^(?:doi|chuyen|day|lui|don|de)\s+(.+?)\s+(?:sang|qua|den|toi|vao|len|xuong|lai)\s+(.+)$/;
const NOTE = /^(?:ghi chu|ghi lai|note)\s*[:,]?\s*(.+)$/;
const wallHm = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(11, 16); // app time is fixed UTC+7

/**
 * Actions for one spoken line. Commands need a task they can name; when the words point at none, the line is
 * not a command and returns [] (the caller says it didn't understand) rather than creating "xong bài tập".
 */
export function think(text: string, now: Date, tasks: Known[], source: ReaderSource = "typed", extra: ReadExtra = {}): Action[] {
  const { text: f, map } = fold(text.trim());
  const orig = (g: string) => text.trim().slice(map[f.length - g.length]); // every group used here ends the line
  const note = NOTE.exec(f);
  if (note) return [{ op: "note", title: orig(note[1]) }];
  for (const re of DONE) {
    const m = re.exec(f);
    if (m) { const x = target(m[1], tasks); return x ? [{ op: "done", target: x.id }] : []; }
  }
  const del = DELETE.exec(f);
  if (del) { const x = target(del[1], tasks); return x ? [{ op: "delete", target: x.id }] : []; }
  const mv = MOVE.exec(f);
  if (mv) {
    const x = target(mv[1], tasks);
    const a = readActions(orig(mv[2]), now, source, { ...extra, alternatives: undefined })[0];
    // A day without a clock ("sang thứ sáu") keeps the task's own time on that day.
    const at = a?.when ?? (a?.deadline && (a.deadline.endsWith("23:59:00") ? `${a.deadline.slice(0, 10)}T${x?.start !== undefined ? wallHm(x.start) : "09:00"}:00` : a.deadline));
    return x && at ? [{ op: "edit", target: x.id, when: at }] : [];
  }
  const a = readActions(text, now, source, extra);
  return a.length ? a : [{ op: "create", title: text.trim() }];
}
