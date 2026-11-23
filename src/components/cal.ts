import type { Rule, Task } from "@/lib/types";

export const DAY = 86400_000;
export const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
export const addDays = (ms: number, n: number) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
export const mondayOf = (ms: number) => addDays(startOfDay(ms), -((new Date(ms).getDay() + 6) % 7));
export const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5).replace(/^0/, ""); // "7:00", not "07:00"

export const short = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
// The app names days short everywhere ("T4", "CN"), never "Thứ tư": brevity over formality.
export const weekday = (ms: number) => short[(new Date(ms).getDay() + 6) % 7];
export const monthLabel = (ms: number) => `Tháng ${new Date(ms).getMonth() + 1}`;

export const live = (x: Task) => !x.doneAt && !x.deletedAt;
/** Tasks that show: not a split parent, placed. */
// Cached per list: month and week ask it once per cell (42 and 14 times a render) with the same array. Callers never mutate the result.
const shownMemo = new WeakMap<Task[], Task[]>();
export const shown = (all: Task[]) => {
  let r = shownMemo.get(all);
  if (!r) { const ps = parents(all); r = all.filter((x) => live(x) && x.start !== undefined && x.end !== undefined && !ps.has(x.id)); shownMemo.set(all, r); }
  return r;
};
/** Ids of split parents: built once so callers test membership in O(1), not a scan per task. */
export const parents = (all: Task[]) => new Set(all.map((x) => x.parentId));
/** Everything on that day: what starts on it, and a block running over it from an earlier day (a trip, 23:00 to 01:00). */
export const onDay = (all: Task[], day: number) => { const e = addDays(day, 1); return shown(all).filter((x) => x.start! < e && x.end! > day).sort((a, b) => a.start! - b.start!); };
/** The time a row shows on a day its block began earlier: "đến 12:00" on the last day, `allDay` (Cả ngày) in between; undefined on its first day. */
/** A task begun on an earlier day: its last day shows its own times (the start with -1), a whole day between them "Cả ngày". */
export const carried = (x: Task, day: number, allDay: string) =>
  x.start === undefined || x.start >= day || (x.end !== undefined && x.end < addDays(day, 1)) ? undefined : allDay;
/** Holiday / all-day phone events by local day start. */
export type Hols = Map<number, string>;
/** Week label: "Tết mùng 3" splits in two lines ("Tết" / "mùng 3"); else the title. */
export const holLines = (title: string): [string, string?] => {
  const m = title.match(/mùng\s*\d+/i);
  const rest = m ? title.replace(m[0], "").trim().split(/\s+/)[0] : "";
  if (m && rest) return [rest, m[0].toLowerCase()];
  // Narrow column: a long phone-calendar title ("Ngày Nhà giáo Việt Nam") becomes "Tết" or "Lễ", never a clipped half-word.
  return [title.length <= 8 ? title : /tết/i.test(title) ? "Tết" : "Lễ"];
};

/** Rules that keep time free on a day ("Tối CN để trống"); kind-only rules ("tập thể dục sau 5 giờ") are not free time. */
export const keptOn = (rules: Rule[], day: number) =>
  rules.filter((r) => !r.kinds.length && (!r.days.length || r.days.includes(new Date(day).getDay())) && r.to > r.from).sort((a, b) => a.from - b.from);
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
export const keptSpan = (r: Rule) => `${hm(r.from)} - ${hm(r.to)}`;

/** The month grid a day sits in: its first Monday and how many week rows it takes. */
export const monthGrid = (anchor: number) => {
  const first = new Date(anchor); first.setDate(1);
  const start = mondayOf(first.getTime());
  const rows = Math.ceil(((first.getDay() + 6) % 7 + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  return { first: startOfDay(first.getTime()), start, rows };
};
export type Rect = { x: number; y: number; w: number; h: number };
/** The day under a finger on a 7-column grid of `rows` weeks from `start` (window coordinates), or undefined off it. */
export function dayAt(r: Rect, start: number, rows: number, x: number, y: number, slop = 24): number | undefined {
  if (r.w <= 0 || x < r.x || x >= r.x + r.w || y < r.y - slop || y >= r.y + r.h + slop) return undefined;
  const col = Math.min(6, Math.floor(((x - r.x) / r.w) * 7)), row = Math.max(0, Math.min(rows - 1, Math.floor(((y - r.y) / r.h) * rows)));
  return addDays(start, row * 7 + col);
}
