import type { Action } from "../types";
import { readActions, type ReadExtra } from "./adapt";
import type { ReaderSource } from "./shared";
import { fold } from "./reader/fold";

// Pure rule-based voice commands: done / delete / note on existing tasks, else the reader's creates.
export type Known = { id: string; title: string; start?: number };

const words = (s: string) => fold(s).text.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1);

/**
 * The task the phrase names: the phrase covers at least half the title's words and the title at least half the
 * phrase's, and one covers the other whole, so "báo cáo môn toán" is not "Báo cáo nhóm". Best by both; ties go to the
 * earliest in `tasks`.
 */
export function target(phrase: string, tasks: Known[]): Known | undefined {
  const said = [...new Set(words(phrase))];
  let best: Known | undefined, top = 0;
  for (const x of tasks) {
    const w = [...new Set(words(x.title))];
    if (!w.length || !said.length) continue;
    const of = w.filter((y) => said.includes(y)).length / w.length;
    const back = said.filter((y) => w.includes(y)).length / said.length;
    // one side must hold the other whole: "tài liệu môn toán" against "Tài liệu môn web" names two different things
    if ((of === 1 || back === 1) && of >= 0.5 && back >= 0.5 && of + back > top) { top = of + back; best = x; }
  }
  return best;
}

// Command words match the lowercased text with its accents (folded, "bổ sung" is "bỏ", "tối" is "tới", "đề" is "để");
// each also matches its accent-free spelling, for typing without accents.
const alt = (...ws: string[]) => [...new Set(ws.flatMap((w) => [w, fold(w).text]))].join("|");
const re = (s: string) => new RegExp(s, "s");

const LEAD = `(?:(?:${alt("đã", "vừa", "mình")})\\s+)?(?:${alt("làm")}\\s+)?`;
const DONE = [
  re(`^${LEAD}(?:${alt("xong", "hoàn thành")})\\s+(.+?)(?:\\s+(?:${alt("rồi", "nhé", "nha")}))?$`),
  re(`^${LEAD}(.+?)\\s+(?:${alt("xong", "hoàn thành")})(?:\\s+(?:${alt("rồi", "nhé", "nha")}))?$`),
];
// "hoàn thành X trước thứ 6" gives a due time: a create, not a done.
const DUE = new RegExp(`(?:^|\\s)(?:${alt("trước", "vào", "hạn", "lúc")})\\s`);
const DELETE = re(`^(?:${alt("xoá", "xóa", "huỷ", "hủy", "bỏ")})\\s+(?:(?:${alt("lịch", "việc")})\\s+)?(.+?)(?:\\s+(?:${alt("đi", "nhé", "nha")}))?$`);
// A spoken move is not a command (moves are made on the task by hand), but naming a task it must not make a second one.
const MOVE = re(`^(${alt("dời", "đổi", "chuyển", "đẩy", "lùi")})\\s+(.+?)\\s+(?:${alt("sang", "qua", "đến", "tới", "vào", "lên", "xuống", "lại")})\\s+.+$`);
const NOTE = re(`^(?:${alt("ghi chú", "ghi lại")}|note)\\s*[:,]?\\s*(.+)$`);

/**
 * Actions for one spoken line. Commands need a task they can name; when the words point at none, the line is
 * not a command and returns [] (the caller says it didn't understand) rather than creating "xong bài tập".
 */
export function think(text: string, now: Date, tasks: Known[], source: ReaderSource = "typed", extra: ReadExtra = {}): Action[] {
  const t = text.trim().normalize("NFC");
  const f = t.toLowerCase();
  const orig = (g: string) => (f.length === t.length ? t.slice(f.length - g.length) : g); // every group used here ends the line
  const note = NOTE.exec(f);
  if (note) return [{ op: "note", title: orig(note[1]) }];
  for (const r of DONE) {
    const m = r.exec(f);
    if (m && !(r === DONE[0] && DUE.test(m[1]))) { const x = target(m[1], tasks); return x ? [{ op: "done", target: x.id }] : []; }
  }
  const del = DELETE.exec(f);
  if (del) { const x = target(del[1], tasks); return x ? [{ op: "delete", target: x.id }] : []; }
  const mv = MOVE.exec(f);
  const hit = mv ? target(mv[2], tasks) : undefined;
  // "chuyển tiền vào thứ 6" with a "Chuyển tiền" there is a new one: a verb that is a word of the title is part of it
  if (hit && !words(hit.title).includes(words(mv![1])[0])) return [];
  const a = readActions(text, now, source, extra);
  return a.length ? a : [{ op: "create", title: text.trim() }];
}
