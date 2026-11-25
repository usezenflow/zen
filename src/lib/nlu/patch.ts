// A bare phrase typed or said on a task's own screen ("mai 3h chiều 90 phút", "hạn thứ 6", "mỗi T3 T5"): the task is known,
// so there is no verb and no title to find. The reader does the dates and lengths; its titles are noise here and never read.
import type { Action, Task } from "../types";
import { readFull } from "./adapt";
import { fold } from "./reader/fold";

export interface Patch {
  edit?: Action;
  reshape?: { from: number; rrule: string };
  splitCount?: number;
  clearRepeat?: boolean;
}

const NUM: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
// The reader's wall clock ("2026-11-14 15:00") as the ISO-like wall string apply reads back.
const wall = (s: string) => `${s.replace(" ", "T")}${s.length === 16 ? ":00" : ""}`;

/** What a bare phrase says about the task it was typed on. Empty when it says nothing it can patch. */
export function patchOf(text: string, task: Task, now: Date): Patch {
  const f = fold(text).text.replace(/\s+/g, " ").trim();
  const split = /(?<![\p{L}])chia (\d+|[a-z]+) buoi(?![\p{L}])/u.exec(f);
  const n = split ? (/^\d+$/.test(split[1]) ? +split[1] : NUM[split[1]]) : undefined;
  // "chia 3 buổi" and "bỏ lặp" carry no date the reader should read: its length guess would be wrong here
  if (n && n > 1) return { splitCount: n };
  if (/(?<![\p{L}])(bo|het|khong) lap( lai)?(?![\p{L}])/u.test(f)) return { clearRepeat: true };
  const out: Patch = {};
  const it = readFull(text, now).items[0];
  if (!it) return out;
  const edit: Action = { op: "edit", target: task.id };
  if (it.startsAt) edit.when = wall(it.startsAt);
  // a repeat's deadline is the reader's guess for the window, not a due date
  if (it.rrule) out.reshape = { from: now.getTime(), rrule: it.rrule };
  else if (it.deadline) edit.deadline = wall(it.deadline);
  // a length the reader guessed ("họp" = 60p) is not a length said
  if (it.durationMinutes && !it.inferred?.includes("durationMinutes")) edit.effortMinutes = it.durationMinutes;
  if (Object.keys(edit).length > 2) out.edit = edit;
  return out;
}
