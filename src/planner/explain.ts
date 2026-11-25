// The three questions behind a placement: why this day, why this part of the day, why this length. Each explainer returns candidates,
// strongest first; policy's whyOf says the first of each. Every reason carries `on` (its day, grounded.ts drops it once the task moves)
// and, for a time, `pn` (its part). `ev: 1` marks a learned-looking reason that has concrete evidence (a named block, counted outcomes),
// the only kind of learned reason that is said (reasons.ts sayable).
import type { Kind, Reason, Task } from "../lib/types";
import { DAY, HOUR, MIN, PART4, dayStart, hourOf, partIdx } from "./features";

/** The piece being explained: its task, this sitting's minutes, its place among the parent's sittings, and a guessed length's slow ratio. */
export interface Ask { task: Task; effort: number; k: number; n: number; slow?: number }
/** A block on the same day: placed work (id, kind) or a lecture or exam (lecture). */
export interface Slot { id?: string; title: string; start: number; end: number; kind?: Kind; lecture?: boolean }

export interface DayEnv {
  now: number;
  classes: (day: number) => Slot[]; // lectures and exams on that day
  urgent: (day: number) => string | undefined; // a deadline task of higher priority placed on that day
  sibling: (day: number) => boolean; // another sitting of this task placed on that day
  lighter: (day: number) => boolean; // a weekend kept lighter than the day placed
}
export interface TimeEnv {
  others: Slot[]; // the other blocks on the day (not this piece)
  buffer: number; // learned minutes of rest after a lecture (afterBuffer)
  rate: (part: number) => { won: number; n: number }; // done and missed outcomes lately in that part of the day
  slipping: (part: number) => number; // times work was dragged away from that part lately
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const wd = (t: number) => WD[new Date(t).getDay()];
// "sáng nay" today, else "sáng T3": the part of the day and its weekday
const pt = (t: number, now: number) => `${PART4[partIdx(hourOf(t))]} ${dayStart(t) === dayStart(now) ? "nay" : wd(t)}`;
const nextDay = (t: number) => dayStart(t + 25 * HOUR); // a step to the next midnight, safe across DST

/** Why not an earlier day: the days skipped before this one. Candidates, strongest first. */
export function explainDay(p: Ask, s: number, env: DayEnv): Reason[] {
  const d = dayStart(s), today = dayStart(env.now), on = d, here = pt(s, env.now);
  const skipped: number[] = [];
  for (let x = today; x < d && skipped.length < 7; x = nextDay(x)) skipped.push(x);
  if (!skipped.length) return d === today && (p.task.misses ?? 0) > 0 ? [{ key: "late", w: 0.8, vars: { catch: 1, pt: here, on } }] : [];
  const out: Reason[] = [];
  const heavy = skipped.filter((x) => env.classes(x).length >= 2);
  if (heavy.length) {
    const blocks = heavy.flatMap((x) => env.classes(x));
    const hours = blocks.reduce((n, b) => n + (b.end - b.start) / HOUR, 0);
    // "là ngày thoáng đầu tiên" only when every day before it is heavy: then this one is the first lighter day
    out.push({ key: "load", w: 1, vars: { days: heavy.map(wd).join("–"), cls: blocks.length, h: Math.round(hours), pt: here, on, ev: 1, first: heavy.length === skipped.length ? " là ngày thoáng đầu tiên" : "" } });
  }
  const urgent = skipped.map((x) => [x, env.urgent(x)] as const).find(([, u]) => u !== undefined);
  if (urgent) out.push({ key: "deadline", w: 0.9, vars: { wd: wd(urgent[0]), title: urgent[1]!, pt: here, urgent: 1, on, ev: 1 } });
  if (p.n > 1 && skipped.some((x) => env.sibling(x))) out.push({ key: "pace", w: 0.7, vars: { k: p.k, n: p.n, pt: here, on, ev: 1 } });
  const rest = skipped.filter((x) => env.lighter(x));
  if (rest.length) out.push({ key: "weekend", w: 0.5, vars: { days: rest.map(wd).join("–"), pt: here, on, ev: 1 } });
  return out;
}

/** Why this part of the day and not the others that day: what comes just before, what the part's outcomes show. Candidates, strongest first. */
export function explainTime(p: Ask, s: number, env: TimeEnv): Reason[] {
  const part = partIdx(hourOf(s)), pn = PART4[part], on = dayStart(s), out: Reason[] = [];
  const prev = env.others.filter((o) => o.end <= s && s - o.end < HOUR).sort((a, b) => b.end - a.end)[0];
  if (prev?.lecture && env.buffer > 0 && s - prev.end >= env.buffer * MIN) out.push({ key: "after", w: 1, vars: { prev: prev.title, rest: env.buffer, pn, on, ev: 1 } });
  else if (prev) out.push({ key: "after", w: 0.9, vars: { prev: prev.title, pn, on, ev: 1, lead: ", làm liền mạch" } });
  // this part's completion beats the best other part by 20 points, each side with 4 or more outcomes
  const mine = env.rate(part);
  const rivals = [0, 1, 2, 3].filter((q) => q !== part).map((q) => env.rate(q)).filter((x) => x.n >= 4);
  if (mine.n >= 4 && rivals.length && mine.won / mine.n - Math.max(...rivals.map((x) => x.won / x.n)) >= 0.2) out.push({ key: "hour", w: 0.85, vars: { pn, won: mine.won, n: mine.n, on, ev: 1 } });
  // a part work keeps slipping out of (3 or more drags) is the one to avoid
  const slips = [0, 1, 2, 3].filter((q) => q !== part).map((q) => [q, env.slipping(q)] as const).sort((a, b) => b[1] - a[1])[0];
  if (slips && slips[1] >= 3 && slips[1] > env.slipping(part)) out.push({ key: "hour", w: 0.7, vars: { pn, avoid: PART4[slips[0]], on, ev: 1 } });
  const same = env.others.filter((o) => !o.lecture && o.kind === p.task.kind && partIdx(hourOf(o.start)) === part);
  if (same.length >= 2) out.push({ key: "similar", w: 0.6, vars: { n: same.length, title: same[0].title, pn, on, ev: 1 } });
  return out;
}

/** Why this length: the sitting's share of a split that finishes early, and a guessed length that ran long for its kind. Candidates, strongest first. */
export function explainSize(p: Ask, s: number, due: number | undefined): Reason[] {
  const on = dayStart(s), out: Reason[] = [];
  if (p.n > 1) {
    const early = due === undefined ? 0 : Math.floor((due - (s + p.effort * MIN)) / DAY);
    out.push({ key: "pace", w: 0.8, vars: { k: p.k, n: p.n, on, ...(early >= 1 ? { early, ev: 1 } : {}) } });
  }
  if (p.slow !== undefined && p.slow > 1) out.push({ key: "fit", w: 0.7, vars: { len: p.effort, slow: p.slow, kind: p.task.kind, on, ev: 1 } });
  return out;
}
