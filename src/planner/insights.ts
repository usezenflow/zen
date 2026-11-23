// The model's weights as things a friend would notice. Pure; the rhythm page, memory page and Sunday card read it.
import { kindW } from "../lib/reasons";
import { partAt, t } from "../lib/i18n";
import type { Kind } from "../lib/types";
import { D, DAY, energy, I_AFTER, I_ENERGY, KINDS, partIdx } from "./features";
import { peakHour, slipOf } from "./habits";
import { coldArms, prepare } from "./linucb";
import { afterBuffer, type Model } from "./model";

export interface Insights {
  grid: number[][]; // [weekday 0..6, CN = 0][part 0..3 = sáng, trưa, chiều, tối] in 0..1: where in the week you finish and move work (a month, recent weighs more)
  when?: { part: number; wds: number[]; n: number; sure: number }; // the part of the day and the days that are yours (planner input only: never said to the user)
  hours: number[]; // 24 values in 0..1: how well each hour tends to go
  golden?: { from: number; to: number; sure?: number }; // best contiguous hours, to exclusive
  pairs: { before: Kind; w: number }[]; // "after" weights worth saying, strongest first
  slip: { kind: Kind; rate: number }[]; // kinds pushed later often, highest first
  unsure?: { from: number; to: number }; // waking hours the model knows least about
  learned: { text: string; hour?: number }[]; // the rules the planner applies now, in plain words (Nhịp): hour = the clock hour it forgets, when it has one
  byKind: { kind: Kind; from: number; to: number; sure: number }[]; // best 3-hour window per kind, only when clearly better than its average
  keep?: { pct: number; delta: number }; // the Sunday card's keep line: this week's share of Zen's placements kept, and the change from last week (points)
  seen: number; // done or moved tasks in the last two weeks: the first days show these, never a bare "still learning"
  avoid: { hour: number; n: number }[]; // hours you dragged work away from in the last two weeks, most first: one drag shows it
  early?: { from: number; to: number; n: number }; // with EARLY of them and no golden yet: the two hours where you finished or dragged work most
}

export const EARLY = 3; // three things you did name a stretch, as a guess
export const PROMOTE = 5; // five in one stretch make it the golden range
export const WHEN_MIN = 4; // a part of the day needs this many (on two or more days) before it is said as yours
const FRESH = 7 * DAY; // evidence halves every week: a new habit leads, one odd day does not flip it

const COLD = prepare(coldArms());
const U0 = Math.sqrt(COLD.inv[0][0]); // uncertainty of an arm with no evidence
const KC = KINDS.map((_, j) => 4 + j); // the kind one-hot columns
const UK = KC.map((c) => Math.sqrt(COLD.inv[0][c * D + c]));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function insights(m: Model, now: number): Insights {
  const cold = coldArms();
  const learned = m.arms.some((arm, a) => arm.A.some((v, i) => Math.abs(v - cold[a].A[i]) > 1e-6));
  const p = prepare(m.arms);
  const peak = peakHour(m, now);
  // An hour's quality counts what was learned for the kind that fits it best: a moved task teaches its kind's columns, never the intercept. (A mean over kinds dilutes one kind's evidence as kinds are added.)
  const raw = range(0, 24).map((h) => p.theta[h][0] + Math.max(...KC.map((c) => p.theta[h][c])) + p.theta[h][I_ENERGY] * energy(h + 0.5, peak));
  const lo = Math.min(...raw), hi = Math.max(...raw);
  const hours = raw.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0));
  // How little is known about an hour: the best-known of its intercept and kind columns, against the cold prior.
  const unc = (hs: number[]) => mean(hs.map((h) => Math.min(Math.sqrt(p.inv[h][0]) / U0, ...KC.map((c, j) => Math.sqrt(p.inv[h][c * D + c]) / UK[j]))));
  const sureOf = (hs: number[]) => clamp(1 - unc(hs));
  const wake = range(7, 23);
  // What you did, counted straight: ticks (the hour it happened), moves away, and the hours you dragged work to.
  const recent = (at?: number) => at !== undefined && now - at <= 14 * DAY;
  const age = (at: number) => 0.5 ** (Math.max(0, now - at) / FRESH);
  const done = m.doneHours.filter((d) => recent(d.at));
  const dragged = (m.moved ?? []).filter((d) => recent(d.at));
  // The week as weekday x part: ticks and the slots you dragged work to, a month back, a week's half-life.
  const grid = Array.from({ length: 7 }, () => [0, 0, 0, 0]), cnt = Array.from({ length: 7 }, () => [0, 0, 0, 0]), dates = [0, 1, 2, 3].map(() => new Set<number>());
  for (const d of [...m.doneHours, ...(m.moved ?? [])]) {
    if (now - d.at > 28 * DAY) continue;
    const wd = d.wd ?? new Date(d.at).getDay(), p = partIdx(d.hour);
    grid[wd][p] += age(d.at); cnt[wd][p]++; dates[p].add(Math.floor(d.at / DAY));
  }
  const gmax = Math.max(0, ...grid.flat());
  const gsum = grid.flat().reduce((a, b) => a + b, 0);
  const pw = [0, 1, 2, 3].map((p) => grid.reduce((a, r) => a + r[p], 0)), pn = [0, 1, 2, 3].map((p) => cnt.reduce((a, r) => a + r[p], 0));
  const top4 = pw.indexOf(Math.max(...pw));
  const when = pn[top4] >= WHEN_MIN && dates[top4].size >= 2 && pw[top4] / (gsum || 1) >= 0.4 ? { part: top4, wds: [0, 1, 2, 3, 4, 5, 6].filter((d) => grid[d][top4] >= 0.35 * Math.max(...grid.map((r) => r[top4]))), n: pn[top4], sure: clamp(pw[top4] / (pw[top4] + PROMOTE)) } : undefined;
  const left = new Map<number, number>();
  for (const d of m.left ?? []) if (recent(d.at)) left.set(Math.floor(d.hour), (left.get(Math.floor(d.hour)) ?? 0) + 1);
  const out: Insights = { grid, hours, pairs: [], slip: [], byKind: [], learned: [], avoid: [...left].map(([hour, n]) => ({ hour, n })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n || a.hour - b.hour).slice(0, 3), seen: done.length + m.hist.filter((x) => x.r < 0 && !x.miss && recent(x.at)).length };
  out.grid = grid.map((r) => r.map((v) => (gmax ? v / gmax : 0)));
  out.when = when;
  // Keep share: a silent keep or a tick on time is kept; a later, a drag, a delete or a miss is not (written to hist as r < 0).
  const share = (from: number, to: number) => {
    const xs = m.hist.filter((x) => x.at > from && x.at <= to), ks = (m.kept ?? []).filter((at) => at > from && at <= to).length;
    const n = xs.length + ks;
    return { n, pct: Math.round((100 * (xs.filter((x) => x.r > 0).length + ks)) / (n || 1)) };
  };
  const cur = share(now - 7 * DAY, now), prev = share(now - 14 * DAY, now - 7 * DAY);
  if (cur.n >= 10 && prev.n > 0 && Math.abs(cur.pct - prev.pct) >= 5) out.keep = { pct: cur.pct, delta: cur.pct - prev.pct };
  const good = [...done, ...dragged].map((d) => ({ h: Math.floor(d.hour), w: age(d.at) }));
  const total = good.reduce((n, g) => n + g.w, 0);
  let top = 0; // weighted: recent evidence leads
  if (out.seen >= EARLY && good.length >= 2) {
    for (let f = 6; f <= 22; f++) {
      const hit = good.filter((g) => g.h === f || g.h === f + 1), w = hit.reduce((n, g) => n + g.w, 0);
      if (w > top) { top = w; out.early = { from: f, to: f + 2, n: hit.length }; }
    }
    if (out.early && out.early.n < 2) out.early = undefined; // scattered: no two in one stretch yet
  }
  // Counted evidence is the fast path: PROMOTE ticks or drags in one stretch, holding most of your recent work, are the golden range, sure grows with each one.
  // The bandit's own golden needs dozens of rewards per hour; it only wins once it is surer than the count.
  const counted = out.early && top >= PROMOTE * 0.7 && top / total >= 0.4 ? clamp(top / (top + PROMOTE)) : 0;
  const say = () => {
    if (counted && counted >= (out.golden?.sure ?? 0)) out.golden = { ...out.early!, sure: counted };
    if (out.golden) out.early = undefined;
  };
  if (!learned) { say(); return out; }

  let best = 0;
  for (let from = 0; from < 24; from++) for (let len = 2; len <= 4 && from + len <= 24; len++) {
    const w = range(from, from + len);
    if (w.some((h) => hours[h] < 0.75)) continue;
    const v = mean(w.map((h) => hours[h]));
    if (v >= best) { best = v; out.golden = { from, to: from + len }; }
  }
  if (out.golden) {
    const sure = sureOf(range(out.golden.from, out.golden.to));
    // A handful of moves or ticks already names a range, marked "Đang đoán" below 0.5; the bare prior never does (learned above).
    if (sure < 0.5) out.golden = undefined;
    else {
      out.golden.sure = sure;
    }
  }

  // Additive model: only "after {prev}, things go well", never "prev then X".
  out.pairs = KINDS.map((before, j) => ({ before, w: mean(wake.map((h) => p.theta[h][I_AFTER + j])) }))
    .filter((e) => e.w > 0.05).sort((a, b) => b.w - a.w);

  KINDS.forEach((kind, j) => {
    const c = 4 + j, score = (h: number) => p.theta[h][0] + p.theta[h][c] + p.theta[h][I_ENERGY] * energy(h + 0.5, peak);
    const avg = mean(wake.map(score));
    let top = -Infinity, from = 7;
    for (let f = 7; f <= 20; f++) { const v = mean(range(f, f + 3).map(score)); if (v > top) { top = v; from = f; } }
    const hs = range(from, from + 3);
    const sure = clamp(1 - mean(hs.map((h) => Math.sqrt(p.inv[h][c * D + c])))); // against the bare ridge, not the prior's mass
    if (top - avg > 0.1 && sure >= 0.5) {
      out.byKind.push({ kind, from, to: from + 3, sure });
    }
  });

  out.slip = KINDS.filter((k) => m.slip[k].placed >= 3 && slipOf(m, k) >= 0.25)
    .map((kind) => ({ kind, rate: slipOf(m, kind) })).sort((a, b) => b.rate - a.rate);

  let worst = -1;
  for (let from = 7; from <= 20; from++) {
    const u = mean(range(from, from + 3).map((h) => Math.sqrt(p.inv[h][0])));
    if (u > worst) { worst = u; out.unsure = { from, to: from + 3 }; }
  }
  // The rules Nhịp lists, from what the planner applies now: a rest that differs from the default, the hours you dragged work away from, the part a kind settled into.
  const nap = afterBuffer(m);
  out.learned = [
    ...(nap !== 15 ? [{ text: t("learnedNap", { m: nap }) }] : []),
    ...out.avoid.map((x) => ({ text: t("learnedAvoidPart", { p: partAt(x.hour) }), hour: x.hour })),
    ...out.byKind.map((x) => ({ text: t("learnedKindPart", { k: kindW(x.kind, true), p: partAt(x.from + 1) }), hour: x.from })),
  ];
  say();
  return out;
}
