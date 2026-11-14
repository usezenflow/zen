// Scores a ReaderResult against a hard case (hard.ts), adapted from the reference's eval/score.ts. Partial credit per field.
import { fold } from "../fold";
import { periodSpan } from "../periods";
import { read } from "../reader";
import type { ReaderItem, ReaderResult } from "../../shared";
import { EVAL_CASES, type EvalCase, type ExpFixed, type ExpItem } from "./hard";

export interface CaseScore {
  /** The reader returned as many tasks and fixed items as the case expects. */
  shape: boolean;
  /** The reader adds more items than the case expects. */
  falsePositive: boolean;
  /** Share of expected field checks that held, 0 to 1. */
  fieldAcc: number;
  /** Right shape and every expected field held. */
  pass: boolean;
  /** Checks that did not hold, for reading a failure. */
  misses: string[];
}

const DOW = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU" };
const day = (s?: string) => s?.slice(0, 10) ?? null;
const hhmm = (s?: string) => s?.slice(11, 16) ?? null;
const near = (got: number | undefined, want: number) => got != null && Math.abs(got - want) <= 0.25 * want;
const hits = (title: string, kw: string[]) => kw.filter((k) => fold(title).text.includes(fold(k).text)).length;
const clockOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function taskChecks(e: ExpItem, m?: ReaderItem): [string, boolean][] {
  const out: [string, boolean][] = [["kw", !!m && hits(m.title, e.kw) > 0]];
  const dl = day(m?.deadline);
  if (e.due === null) out.push(["due null", !!m && !m.deadline]);
  else if (e.due !== undefined) out.push(["due", dl !== null && [e.due].flat().includes(dl)]);
  if (e.window) {
    const from = day(m?.notBefore) ?? m?.days?.[0] ?? null;
    const to = dl ?? m?.days?.at(-1) ?? null;
    out.push(["window", from === e.window[0] && to === e.window[1]]);
  }
  if (e.dur !== undefined) out.push(["dur", near(m?.durationMinutes, e.dur)]);
  if (e.tod) {
    const w = (m?.windows ?? []).map((x) => x.toLowerCase());
    out.push(["tod", w.length > 0 && w.every((t) => e.tod!.includes(t as never))]);
  }
  return out;
}

function fixedChecks(e: ExpFixed, m?: ReaderItem): [string, boolean][] {
  const out: [string, boolean][] = [["kw", !!m && hits(m.title, e.kw) > 0], ["date", !!m && day(m.startsAt) === e.date]];
  const clock = e.clock ?? (e.periods ? clockOf(periodSpan(...e.periods)!.start) : undefined);
  if (clock) out.push(["clock", hhmm(m?.startsAt) === clock]);
  const dur = e.dur ?? (e.periods ? periodSpan(...e.periods)!.end - periodSpan(...e.periods)!.start : undefined);
  if (dur !== undefined) out.push(["dur", near(m?.durationMinutes, dur)]);
  if (e.repeat) {
    const by = /BYDAY=([A-Z,]+)/.exec(m?.rrule ?? "")?.[1].split(",") ?? [];
    out.push(["repeat", by.length === e.repeat.length && e.repeat.every((d) => by.includes(DOW[d]))]);
  }
  return out;
}

/** Greedy best-keyword match of each expectation to an unused item of the allowed types. */
const isPrep = (i: ReaderItem) => i.type === "PLAN" && PREP_TITLE.test(i.title);
function pick(pool: ReaderItem[], used: Set<ReaderItem>, kw: string[], types?: string[]) {
  // a prep item matches only when nothing else does
  return pickIn(pool.filter((i) => !isPrep(i)), used, kw, types) ?? pickIn(pool.filter(isPrep), used, kw, types);
}
function pickIn(pool: ReaderItem[], used: Set<ReaderItem>, kw: string[], types?: string[]) {
  let best: ReaderItem | undefined;
  let bestHits = 0;
  for (const it of pool) {
    if (used.has(it) || (types && !types.includes(it.type))) continue;
    const h = hits(it.title, kw);
    if (h > bestHits) [best, bestHits] = [it, h];
  }
  if (best) used.add(best);
  return best;
}

const FIXED = { exam: "EXAM", lecture: "LECTURE", dnd: "BUSY" } as const;

/** zen's exam-prep items (examPreps in assemble.ts): the reference cases never expect them, so they are not counted. */
const PREP_TITLE = /^(Ôn tập|Viết báo cáo|Soạn slide|Chuẩn bị vấn đáp)/;

export function scoreResult(c: EvalCase, res: ReaderResult): CaseScore {
  const expTasks = c.expect.kind === "tasks" ? c.expect.items : [];
  const expFixed = c.expect.kind === "tasks" ? (c.expect.fixed ?? []) : [];
  const used = new Set<ReaderItem>();
  const misses: string[] = [];
  let held = 0;
  let total = 0;
  const tally = (who: string, checks: [string, boolean][]) => {
    total += checks.length;
    for (const [k, ok] of checks) { if (ok) held++; else misses.push(`${who}:${k}`); }
  };
  for (const e of expTasks) tally(e.kw[0], taskChecks(e, pick(res.items, used, e.kw, ["PLAN", "ASSIGNMENT"])));
  for (const e of expFixed) tally(e.kw[0], fixedChecks(e, pick(res.items, used, e.kw, [FIXED[e.type]])));
  const want = expTasks.length + expFixed.length;
  const got = res.items.filter((i) => used.has(i) || !isPrep(i)).length;
  const shape = got === want;
  if (!shape) misses.push(`count ${got} != ${want}`);
  return {
    shape,
    falsePositive: got > want,
    fieldAcc: total ? held / total : got === 0 ? 1 : 0,
    pass: shape && misses.length === (shape ? 0 : 1),
    misses,
  };
}

/** `now` is an ISO instant with the zone's offset; its wall clock is the reader's ref. */
export function runHard(c: EvalCase): CaseScore {
  const [y, m, d, h, mi] = c.now.slice(0, 16).split(/[-T:]/).map(Number);
  return scoreResult(c, read(c.text, { ref: { y, m, d, h, mi }, source: "typed" }));
}

export const hardScores = () => EVAL_CASES.map((c) => ({ c, s: runHard(c) }));
