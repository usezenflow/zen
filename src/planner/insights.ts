// The model's weights as things a friend would notice. Pure; the rhythm page, memory page and Sunday card read it.
import { KIND_VI, kindW } from "../lib/reasons";
import type { Kind } from "../lib/types";
import { D, DAY, energy, hourOf, I_AFTER, I_ENERGY, KINDS } from "./features";
import { peakHour, slipOf } from "./habits";
import { coldArms, prepare } from "./linucb";
import type { Model } from "./model";

export interface Insights {
  hours: number[]; // 24 values in 0..1: how well each hour tends to go
  golden?: { from: number; to: number; sure?: number }; // best contiguous hours, to exclusive
  pairs: { before: Kind; w: number }[]; // "after" weights worth saying, strongest first
  slip: { kind: Kind; rate: number }[]; // kinds pushed later often, highest first
  unsure?: { from: number; to: number }; // waking hours the model knows least about
  guesses: { text: string; sure: number }[]; // sentences for "Mình đoán", sure in 0..1
  byKind: { kind: Kind; from: number; to: number; sure: number }[]; // best 3-hour window per kind, only when clearly better than its average
  weekly?: string; // one sentence for the Sunday card
  seen: number; // done or moved tasks in the last two weeks: the first days show these, never a bare "still learning"
  early?: { from: number; to: number; n: number }; // with EARLY of them and no golden yet: the two hours where you finished or dragged work most
}

export const EARLY = 3;
export const PROMOTE = 5;

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
  const done = m.doneHours.filter((d) => recent(d.at)).map((d) => d.hour);
  const dragged = Object.values(m.placed).filter((x) => x.moved && recent(x.at)).map((x) => hourOf(x.start));
  const out: Insights = { hours, pairs: [], slip: [], byKind: [], guesses: [], seen: done.length + m.hist.filter((x) => x.r < 0 && !x.miss && recent(x.at)).length };
  const weekly: { text: string; sure: number }[] = [];
  const good = [...done, ...dragged].map(Math.floor);
  let top = 0;
  if (out.seen >= EARLY && good.length >= 2) {
    for (let f = 6; f <= 22; f++) { const n = good.filter((h) => h === f || h === f + 1).length; if (n > top) { top = n; out.early = { from: f, to: f + 2, n }; } }
    if (top < 2) out.early = undefined; // scattered: no two in one stretch yet
  }
  // Counted evidence is the fast path: PROMOTE ticks or drags in one stretch, holding most of your work, are the golden range, sure grows with each one.
  // The bandit's own golden needs dozens of rewards per hour; it only wins once it is surer than the count.
  const counted = out.early && top >= PROMOTE && top / good.length >= 0.4 ? clamp(top / (top + PROMOTE)) : 0;
  const say = () => {
    if (counted && counted >= (out.golden?.sure ?? 0)) {
      const { from, to } = out.early!, text = `Giờ vàng ${from}h-${to}h`;
      out.guesses = out.guesses.filter((g) => !g.text.startsWith("Giờ vàng"));
      out.guesses.push({ text, sure: counted });
      out.golden = { from, to, sure: counted };
      if (counted >= 0.5 && !out.weekly?.match(/^Bạn \S+ hợp nhất lúc \d+h$/)) out.weekly = `Bạn làm việc hợp nhất lúc ${from}h-${to}h`; // a per-kind line stays; the old range does not
    } else if (!out.golden && out.early) out.guesses.push({ text: `Bạn hay làm việc lúc ${out.early.from}h-${out.early.to}h`, sure: 0.3 });
    if (out.golden) out.early = undefined;
    out.guesses.sort((a, b) => b.sure - a.sure);
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
    if (sure < 0.35) out.golden = undefined;
    else {
      out.golden.sure = sure;
      out.guesses.push({ text: `Giờ vàng ${out.golden.from}h-${out.golden.to}h`, sure });
      weekly.push({ text: `Bạn làm việc hợp nhất lúc ${out.golden.from}h-${out.golden.to}h`, sure });
    }
  }

  // Additive model: only "after {prev}, things go well", never "prev then X".
  out.pairs = KINDS.map((before, j) => ({ before, w: mean(wake.map((h) => p.theta[h][I_AFTER + j])) }))
    .filter((e) => e.w > 0.05).sort((a, b) => b.w - a.w);
  const ps = sureOf(wake);
  for (const e of out.pairs) {
    out.guesses.push({ text: `Sau giờ ${KIND_VI[e.before]}, bạn làm tiếp tốt`, sure: ps });
  }

  KINDS.forEach((kind, j) => {
    const c = 4 + j, score = (h: number) => p.theta[h][0] + p.theta[h][c] + p.theta[h][I_ENERGY] * energy(h + 0.5, peak);
    const avg = mean(wake.map(score));
    let top = -Infinity, from = 7;
    for (let f = 7; f <= 20; f++) { const v = mean(range(f, f + 3).map(score)); if (v > top) { top = v; from = f; } }
    const hs = range(from, from + 3);
    const sure = clamp(1 - mean(hs.map((h) => Math.sqrt(p.inv[h][c * D + c])))); // against the bare ridge, not the prior's mass
    if (top - avg > 0.1 && sure >= 0.5) {
      out.byKind.push({ kind, from, to: from + 3, sure });
      out.guesses.push({ text: `${kindW(kind, true)} hợp nhất lúc ${from}h-${from + 3}h`, sure });
      weekly.push({ text: `${kindW(kind, true)} hợp nhất lúc ${from}h`, sure });
    }
  });

  out.slip = KINDS.filter((k) => m.slip[k].placed >= 3 && slipOf(m, k) >= 0.25)
    .map((kind) => ({ kind, rate: slipOf(m, kind) })).sort((a, b) => b.rate - a.rate);
  for (const e of out.slip) out.guesses.push({ text: `${kindW(e.kind, true)} hay bị dời`, sure: clamp(m.slip[e.kind].placed / 10) });

  let worst = -1;
  for (let from = 7; from <= 20; from++) {
    const u = mean(range(from, from + 3).map((h) => Math.sqrt(p.inv[h][0])));
    if (u > worst) { worst = u; out.unsure = { from, to: from + 3 }; }
  }
  out.guesses = out.guesses.filter((g) => g.sure > 0);
  out.guesses.sort((a, b) => b.sure - a.sure);
  out.weekly = weekly.filter((w) => w.sure >= 0.5).sort((a, b) => b.sure - a.sure)[0]?.text;
  say();
  return out;
}
