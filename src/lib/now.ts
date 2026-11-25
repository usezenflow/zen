import { newModel, type Model } from "../planner";
import { PART_OF } from "../planner/policy";
import { prepare, ucb } from "../planner/linucb";
import { dueOf, features, hourOf } from "../planner/features";
import { effort, neighbors, peakHour } from "../planner/habits";
import type { Kind, Task } from "./types";

const DAY = 86400_000;
const HOUR_MS = 3600_000;
const dayStart = (ms: number) => new Date(new Date(ms).setHours(0, 0, 0, 0)).getTime();

/** The task to show now: a fixed one in progress; else the open flexible task today (or unscheduled) that scores best, unless a fixed one starts first.
 *  Score: its UCB at this hour, plus deadline urgency (learned minutes left ÷ hours to due), plus 0.2 for a kind below its 4-week share this week.
 *  A task waiting for an open predecessor (`after`) is no candidate. */
/** `prep`: the model's prepared arms, passed in by a caller that asks many times (the widget timeline); learning mutates arms, so no cache here. */
export const prepOf = (m: Model) => prepare(m.arms, m.parts, PART_OF);
export function pickNow(tasks: Task[], now: number, model: Model = newModel(now), prep = prepOf(model)): Task | undefined {
  const ps = new Set(tasks.map((c) => c.parentId));
  const live = tasks.filter((x) => !x.doneAt && !x.deletedAt && x.start !== undefined && x.end !== undefined && !ps.has(x.id));
  const running = live.find((x) => x.fixed && x.start! <= now && now < x.end!);
  if (running) return running;
  const nextFixed = live.filter((x) => x.fixed && x.start! > now).sort((a, b) => a.start! - b.start!)[0];
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const open = tasks.filter((x) => !x.doneAt && !x.deletedAt && !x.fixed && !ps.has(x.id) && (x.start === undefined || (dayStart(x.start) === dayStart(now) && x.end! > now))
    && !x.after?.some((id) => { const p = byId.get(id); return p && !p.doneAt && !p.deletedAt; }));
  const arm = Math.floor(hourOf(now)), peak = peakHour(model, now);
  const done28 = tasks.filter((x) => x.doneAt && !x.deletedAt && x.doneAt >= now - 28 * DAY), done7 = done28.filter((x) => x.doneAt! >= now - 7 * DAY);
  const share = (xs: Task[], k: Kind) => { const all = xs.reduce((s, x) => s + x.effort, 0); return all ? xs.filter((x) => x.kind === k).reduce((s, x) => s + x.effort, 0) / all : 0; };
  const score = (x: Task) => {
    const due = dueOf(x);
    const urgency = due === undefined ? 0 : effort(x, model) / Math.max((due - now) / HOUR_MS, 0.25); // overdue: the quarter hour floor
    const behind = share(done7, x.kind) < share(done28, x.kind) ? 0.2 : 0;
    return ucb(prep, arm, features(x, now, { fixedH: () => 0, peak, nb: neighbors(x, model, now), ends: [] })) + urgency + behind;
  };
  const best = open.map((x) => ({ x, s: score(x) })).sort((a, b) => b.s - a.s || (a.x.start ?? Infinity) - (b.x.start ?? Infinity))[0]?.x;
  return best && (best.start === undefined || !nextFixed || best.start <= nextFixed.start!) ? best : nextFixed;
}
