import { HOUR, partIdx } from "../features";
import type { Act, Log, Resp } from "./sim";

/** The keep rule: a placement counts as kept when the persona accepted it (kept or ticked) without a drag, a later, a delete or an ignore. The app can reuse it. */
export function keptRate(resps: { act: Act }[]): number {
  return resps.length ? resps.filter((r) => r.act === "kept" || r.act === "done").length / resps.length : 0;
}

export interface Metrics {
  keepRate: number; earlyKeep: number | null; lateKeep: number | null; coldKeep: number | null;
  tapsPerDay: number; touchesPerDay: number; movesPerDay: number; churn: number; surpriseMoves: number;
  regretH: number; overloadDays: number; lateRate: number; deadlineSlackH: number | null;
  convergeDay: number | null; adaptDays?: number | null;
  // focus extras
  outsideShare: number; bufferShare: number; keepTod: number | null; keepDated: number | null; keepErrand: number | null;
  switchesPerDay: number; lenErrMin: number | null; missBand: number | null; leadShare: number | null;
  overdueMoves: number; // a run's count: Zen moves on tasks already past their deadline
  dragsPerDay: number; dragsToLearn: number | null; transferKeep: number | null; // a dislike or packed morning: drags until the last unwanted start, and keep rate on unseen hours of the parts learned
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const within = (resps: Resp[], a: number, b: number) => resps.filter((r) => r.day >= a && r.day <= b);
const rateOrNull = (rs: Resp[]) => (rs.length ? keptRate(rs) : null);

export function score(log: Log): Metrics {
  const { resps, daily, tasks, days, end, parents } = log;
  const units = tasks.filter((t) => !t.fixed && !parents.has(t.id));
  const dated = units.filter((t) => t.deadline !== undefined && t.deadline <= end);
  const late = dated.filter((t) => t.doneAt === undefined || t.doneAt > t.deadline!).length;
  const placed = [...log.placed].filter((id) => !parents.has(id));
  const churned = placed.filter((id) => (log.zen.get(id) ?? 0) >= 2).length;
  const slack = units.filter((t) => t.doneAt !== undefined && t.deadline !== undefined).map((t) => (t.deadline! - t.doneAt!) / HOUR);
  const sum = (f: (d: (typeof daily)[number]) => number) => daily.reduce((s, d) => s + f(d), 0);
  const band = resps.filter((r) => r.hour >= 9 && r.hour < 11);
  const dated_ = resps.filter((r) => r.deadline !== undefined); // dated placements, for the lead share (created..deadline window)
  return {
    keepRate: keptRate(resps),
    earlyKeep: rateOrNull(within(resps, 0, 6)),
    lateKeep: rateOrNull(within(resps, 21, days - 1)),
    coldKeep: rateOrNull(within(resps, 0, 2)),
    tapsPerDay: sum((d) => d.drags) / days,
    touchesPerDay: sum((d) => d.drags + d.laters + d.undos + d.edits) / days,
    movesPerDay: sum((d) => d.moves) / days,
    churn: placed.length ? churned / placed.length : 0,
    surpriseMoves: sum((d) => d.surprise) / days,
    regretH: mean(resps.map((r) => Math.abs(r.hour - r.pref))),
    overloadDays: daily.filter((d) => d.planned > d.capacity + 1).length,
    lateRate: dated.length ? late / dated.length : 0,
    deadlineSlackH: median(slack),
    convergeDay: convergeDay(resps, days),
    adaptDays: log.shiftDay !== undefined ? adaptDays(resps, log.shiftDay, days) : undefined,
    outsideShare: log.placements ? log.outside / log.placements : 0,
    bufferShare: log.placements ? log.bufferHits / log.placements : 0,
    keepTod: rateOrNull(resps.filter((r) => r.part)),
    keepDated: rateOrNull(resps.filter((r) => r.deadline !== undefined)),
    keepErrand: rateOrNull(resps.filter((r) => r.kind === "errand")),
    switchesPerDay: sum((d) => d.switches) / days,
    lenErrMin: log.lenErr.length ? mean(log.lenErr) : null, // lenErr is in minutes
    missBand: band.length ? band.filter((r) => r.act === "ignore").length / band.length : null,
    overdueMoves: log.overdueMoves,
    dragsPerDay: sum((d) => d.drags) / days,
    ...learnStats(log),
    leadShare: dated_.length ? dated_.filter((r) => r.start - r.created <= 0.8 * (r.deadline! - r.created)).length / dated_.length : null,
  };
}

/** Drags until the last day with a start the persona must learn away from (null for a persona with none), and the keep rate on the
 * hours of those parts it had not yet been taught by then (a null, when nothing was placed there, counts as 1: nothing wrong was kept). */
function learnStats(log: Log): Pick<Metrics, "dragsToLearn" | "transferKeep"> {
  const { unwanted, unwantedHours, daily, resps, days } = log;
  if (unwanted.every((x) => x === 0)) return { dragsToLearn: null, transferKeep: null };
  let last = -1;
  unwanted.forEach((x, d) => { if (x > 0) last = d; });
  const dragsToLearn = daily.filter((d) => d.day <= last).reduce((s, d) => s + d.drags, 0);
  const parts = new Set([...unwantedHours.keys()].map((h) => partIdx(h % 24)));
  const unseen = resps.filter((r) => r.day >= days / 2 && parts.has(partIdx(r.hour % 24)) && !((unwantedHours.get(Math.floor(r.hour)) ?? Infinity) < r.day));
  return { dragsToLearn, transferKeep: rateOrNull(unseen) ?? 1 };
}

/** First day d such that the 5-day rolling keep rate (windows of at least 3 replies) stays at 0.75 or more from d to the end; null if none. */
function convergeDay(resps: Resp[], days: number): number | null {
  const rate = (k: number) => { const w = within(resps, k - 4, k); return w.length >= 3 ? keptRate(w) : 0; };
  for (let d = 0; d < days; d++) {
    let ok = true;
    for (let k = d; k < days && ok; k++) ok = rate(k) >= 0.75;
    if (ok) return d;
  }
  return null;
}

/** Days after the change until a 3-day window that lies wholly after it keeps at least 70%; null if it never does. */
function adaptDays(resps: Resp[], from: number, days: number): number | null {
  for (let k = from + 2; k < days; k++) {
    const w = within(resps, k - 2, k);
    if (w.length >= 3 && keptRate(w) >= 0.7) return k - from;
  }
  return null;
}
