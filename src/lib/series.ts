import { fold } from "./nlu/reader/fold";
import type { Task } from "./types";

const DAY = 86400_000;
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
/** The offer: the same title done on one weekday three weeks running, not yet a repeat and not declined. `key` is what "Không" remembers. */
export interface SeriesOffer { key: string; title: string; kind: Task["kind"]; effort: number; weekday: number; rrule: string }

const dayNum = (ms: number) => { const d = new Date(ms); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };

/** Done on the same weekday in each of the last three weeks, the last one within the past week. Repeats and declined titles are skipped. */
export function seriesOffer(tasks: Task[], now: number, declined: string[]): SeriesOffer | undefined {
  const groups = new Map<string, { task: Task; weekday: number; days: Set<number> }>();
  for (const x of tasks) {
    if (!x.doneAt || x.deletedAt || x.rrule || x.parentId) continue;
    const weekday = new Date(x.doneAt).getDay(), key = `${fold(x.title).text}|${weekday}`;
    const g = groups.get(key) ?? { task: x, weekday, days: new Set<number>() };
    g.days.add(dayNum(x.doneAt));
    if (x.doneAt > g.task.doneAt!) g.task = x;
    groups.set(key, g);
  }
  const repeats = new Set(tasks.filter((x) => x.rrule && !x.deletedAt).map((x) => fold(x.title).text));
  for (const [key, g] of groups) {
    const last = dayNum(g.task.doneAt!);
    if (last < dayNum(now) - 7 || declined.includes(key) || repeats.has(fold(g.task.title).text)) continue;
    if (!g.days.has(last - 7) || !g.days.has(last - 14)) continue;
    return { key, title: g.task.title, kind: g.task.kind, effort: g.task.effort, weekday: g.weekday, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[g.weekday]}` };
  }
  return undefined;
}
